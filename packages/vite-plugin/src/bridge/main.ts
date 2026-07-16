/**
 * Bridge entry — runs in the page context as a side-effect IIFE.
 *
 * Registers `window.__svelte_devtools__` and starts:
 * - the AST-transform call-target methods (onPush/onPop/etc.)
 * - the postMessage listener for panel commands
 * - the DOM MutationObserver for update tracing
 *
 * The transform.ts in this package generates calls of the form
 * `window.__svelte_devtools__?.onPush(...)` inside compiled Svelte
 * output. The shape of `bridge` below MUST match those call sites.
 *
 * Every read of Svelte's private internals goes through `Compat`.
 */

import { Compat, detectSvelteVersion } from './compat.js';
import { safeSerialize, summarizeDomMutation, serializeChildrenAtPath } from './serializer.js';
import { showHighlight, findDomElementsByFilename } from './highlight.js';
import { applyEditAtPath } from './state-editor.js';
import { startPicker, stopPicker } from './picker.js';
import { getSvelteMetaFile } from './svelte-meta.js';
import type { Value, Reaction, ComponentFn, SvelteDevtoolsBridge } from './types.js';

(function () {
  if (typeof window === 'undefined' || window.__svelte_devtools__) return;

  // -- ID generation --
  let idCounter = 0;
  const genId = () => 'sdt-' + ++idCounter;

  // -- Component tracking --
  interface ComponentNode {
    id: string;
    name: string;
    filename: string | null;
    children: string[];
    parentId: string | null;
    meta: null;
    stateIds: string[];
    effectIds: string[];
    renderDuration: number | null;
    _startTime: number;
    _componentFn: ComponentFn;
    _props: unknown;
  }
  const componentStack: ComponentNode[] = [];
  const componentMap = new Map<string, ComponentNode>();
  const rootComponents: string[] = [];

  // -- Signal & Effect registries --
  interface SignalMeta {
    id: string;
    label: string | null;
    componentId: string | null;
    type: 'state' | 'derived' | 'props';
  }
  interface EffectMeta {
    id: string;
    label: string | null;
    componentId: string | null;
    fn: (...args: unknown[]) => unknown;
    wrappedFn: ((...args: unknown[]) => unknown) | null;
  }
  const signalMap = new Map<Value, SignalMeta>();
  const effectMap = new Map<string, EffectMeta>();
  const stableReactionIds = new WeakMap<Reaction, string>();
  const idToSignal = new Map<string, Value>();
  const idToReaction = new Map<string, WeakRef<Reaction>>();
  // Template-effect wrappers (wrapRenderEffect) — tracked so graph/tracer
  // label fallbacks never display the instrumentation wrapper's own fn name
  // ('wrappedRenderEffect') for reactions that are absent from effectMap.
  const renderEffectWrappers = new WeakSet<(...args: unknown[]) => unknown>();

  // -- Profiling --
  const MAX_PROFILING_ENTRIES = 10000;
  let profilingActive = false;
  const renderTimings: Array<{
    componentId: string;
    name: string;
    startTime: number;
    duration: number;
    isRerender: boolean;
  }> = [];
  const effectTimings: Array<{
    effectId: string;
    label: string | null;
    componentId: string | null;
    componentName: string | null;
    duration: number;
    depsCount: number;
  }> = [];
  const updateTimings: Array<{
    componentId: string | null;
    componentName: string | null;
    duration: number;
  }> = [];

  // -- Tracing --
  const MAX_TRACE_PENDING = 200;
  let traceFlushScheduled = false;
  const tracePending: Array<{
    signalId: string;
    signalLabel: string | null;
    componentId: string | null;
    componentName: string | null;
    stackTrace: string | null;
    oldValue: unknown;
    newValue: unknown;
    timestamp: number;
    _signal: Value;
  }> = [];
  const traceDomMutations: Array<{
    type: 'childList' | 'attributes' | 'characterData';
    targetTag: string;
    targetId: string | null;
    targetClass: string | null;
    attributeName: string | null;
    summary: string;
  }> = [];
  const preCapture = new WeakMap<Value, unknown>();

  // -- Panel connection gating --
  // Per-write tracing (stack capture, serialization, tracePending push,
  // trace:update/component:updated messaging) is quiescent until a DevTools
  // panel actually connects for this tab (see the 'devtools:panel-connected'
  // / 'devtools:panel-disconnected' cases in the message listener below).
  // Component mount/unmount events and request/response messages stay
  // ungated — their cost is per-mount or per-request, not per-write.
  let panelConnected = false;

  // -- Captured Svelte internals namespace (plan 018) --
  // A compiled module's `$` namespace, handed to onPop by the transform
  // (instrumentPop). First mount wins — every module in a dev app shares the
  // same svelte/internal/client instance. Used only by Compat.setValue for
  // panel-initiated state edits; null until the first instrumented mount,
  // which is fine (there is nothing to edit before anything mounts).
  let svelteInternals: unknown = null;

  // -- Live reactivity-graph subscription (plan 008) --
  // The panel subscribes while the Reactivity tab is visible; the bridge then
  // re-emits a full graph:snapshot (throttled) whenever the graph may have
  // changed. Full snapshots, never graph:update deltas — the panel replaces
  // wholesale, so there is no merge-growth to prune.
  const GRAPH_EMIT_MIN_INTERVAL_MS = 500;
  let graphSubscribed = false;
  let graphFilter: string | null = null;
  let graphDirty = false;
  let graphEmitTimer: ReturnType<typeof setTimeout> | null = null;
  let lastGraphEmit = 0;

  function emit(payload: unknown): void {
    window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
  }

  // -- Svelte version probe/announce (F16) --
  let announcedSvelteVersion = 'unknown';

  // Probe + announce. Called once at init (where it deterministically reports
  // 'unknown' — the bridge is the first module script in the document, so it
  // always runs before Svelte's disclose-version), and again from onPop once a
  // component mount proves the Svelte runtime has executed (F16).
  // Guarded: a throwing probe must never cost us bridge:ready + the observers
  // (that was the F15 failure mode).
  function probeAndAnnounce(): { svelteVersion: string; untested: boolean } {
    let svelteVersion = 'unknown';
    let untested = true;
    try {
      const probe = detectSvelteVersion();
      svelteVersion = probe.version;
      untested = !probe.tested;
    } catch {
      // fall through with unknown/untested
    }
    announcedSvelteVersion = svelteVersion;
    emit({ type: 'bridge:ready', svelteVersion, protocolVersion: 1, untested });
    return { svelteVersion, untested };
  }

  function currentComponentId(): string | null {
    return componentStack.length > 0 ? componentStack[componentStack.length - 1].id : null;
  }

  // -- Dev-server relay (open-in-editor, and future get-source) --
  // The bridge runs in the page context and has no direct handle to Vite's
  // WebSocket; it reaches the dev server through Vite's own HMR client,
  // which the dev server already serves at /@vite/client. The specifier is
  // routed through a variable (with @vite-ignore) so tsup's bundler, which
  // fully inlines this file into dist/bridge.js, leaves it as a genuine
  // runtime dynamic import rather than trying to resolve/bundle it.
  let viteHot: { send: (event: string, data: unknown) => void } | null = null;
  async function sendToDevServer(event: string, data: unknown): Promise<void> {
    try {
      if (!viteHot) {
        const clientPath = '/@vite/client';
        const mod = await import(/* @vite-ignore */ clientPath);
        viteHot = mod.createHotContext('/__svelte_devtools__');
      }
      viteHot!.send(event, data);
    } catch {
      console.warn('[svelte-devtools] open-in-editor unavailable (no Vite dev client)');
    }
  }

  /**
   * Chrome Performance Extensibility API wrapper. The first arg is a display
   * label rendered in the Performance panel — NOT a printf-style format string.
   * Safe to interpolate static labels. Returns void; silently no-op on
   * browsers that don't support console.timeStamp.
   */
  type TimeStampConsole = Console & {
    timeStamp: (
      label: string,
      start?: number,
      end?: number,
      trackName?: string,
      trackGroup?: string,
      color?: string,
    ) => void;
  };
  function markPerf(label: string, start: number, end: number, track: string, color: string): void {
    (console as TimeStampConsole).timeStamp(label, start, end, track, 'Svelte DevTools Pro', color);
  }

  // -- Bridge API (must match transform.ts call sites) --
  const bridge: SvelteDevtoolsBridge & {
    version: string;
    componentMap: typeof componentMap;
    signalMap: typeof signalMap;
    effectMap: typeof effectMap;
    rootComponents: typeof rootComponents;
    removeComponent: (id: string) => void;
    getTree: () => unknown[];
    buildGraph: (filterComponentId: string | null) => { nodes: unknown[]; edges: unknown[] };
    startProfiling: () => void;
    stopProfiling: () => { timings: unknown[]; effectTimings: unknown[]; updateTimings: unknown[] };
  } = {
    version: '0.0.1',
    componentMap,
    signalMap,
    effectMap,
    rootComponents,

    onPush(name, props, componentFn) {
      const id = genId();
      const parentId = currentComponentId();
      const node: ComponentNode = {
        id,
        name,
        filename: Compat.getComponentFilename(componentFn),
        children: [],
        parentId,
        meta: null,
        stateIds: [],
        effectIds: [],
        renderDuration: null,
        _startTime: performance.now(),
        _componentFn: componentFn,
        _props: props,
      };
      componentMap.set(id, node);
      if (parentId) {
        const parent = componentMap.get(parentId);
        if (parent) parent.children.push(id);
      } else {
        rootComponents.push(id);
      }
      componentStack.push(node);
      return id;
    },

    onPop(internals?) {
      const node = componentStack.pop();
      if (!node) return;
      const id = node.id;
      const duration = performance.now() - node._startTime;
      node.renderDuration = duration;

      // Register unmount teardown so the tree/registries don't leak forever.
      // `internals` is only present when the compiled module was built with
      // the updated transform (instrumentPop now passes the `$` namespace) —
      // a warm dev-server session may still be running an older cached
      // transform that calls onPop() bare, so guard for that.
      if (internals) {
        if (!svelteInternals) svelteInternals = internals;
        Compat.registerComponentTeardown(internals, () => bridge.removeComponent(id));
      }

      emit({
        type: 'component:mounted',
        node: {
          id: node.id,
          name: node.name,
          filename: node.filename,
          children: node.children,
          parentId: node.parentId,
          meta: node.meta,
          stateIds: node.stateIds,
          effectIds: node.effectIds,
          renderDuration: duration,
        },
      });
      markGraphDirty();

      // F16: the init-time probe always ran before Svelte's disclose-version, so
      // it announced 'unknown'. Re-probe once a mount proves the runtime executed;
      // re-announcing overwrites the SW's per-tab cache and updates any open panel.
      if (announcedSvelteVersion === 'unknown') {
        probeAndAnnounce();
      }

      if (profilingActive) {
        try {
          // console.timeStamp is the Chrome Performance Extensibility API — its
          // first arg is a display label, NOT a printf-style format string.
          // node.name is a literal baked at compile time by the AST transform
          // (see transform.ts instrumentPush), not user input.
          markPerf(`Render: ${node.name}`, node._startTime, node._startTime + duration, 'Component Renders', 'primary');
        } catch {
          // console.timeStamp is non-standard; ignore if unsupported
        }

        if (renderTimings.length >= MAX_PROFILING_ENTRIES) renderTimings.shift();
        renderTimings.push({
          componentId: node.id,
          name: node.name,
          startTime: node._startTime,
          duration,
          isRerender: false,
        });
      }

      return node.id;
    },

    removeComponent(id) {
      const node = componentMap.get(id);
      if (!node) return;
      for (const childId of node.children) bridge.removeComponent(childId);
      if (node.parentId) {
        const parent = componentMap.get(node.parentId);
        if (parent) {
          const idx = parent.children.indexOf(id);
          if (idx !== -1) parent.children.splice(idx, 1);
        }
      } else {
        const idx = rootComponents.indexOf(id);
        if (idx !== -1) rootComponents.splice(idx, 1);
      }
      // Drop this node's signals/effects from the registries so a dev session
      // doesn't accumulate every component instance that ever mounted. Each
      // stateId/effectId is owned exclusively by this node (per-node arrays),
      // so this can never delete a still-live component's entries.
      // idToReaction holds WeakRefs — left alone; GC reclaims dead reactions.
      for (const stateId of node.stateIds) {
        const sig = idToSignal.get(stateId);
        if (sig) signalMap.delete(sig);
        idToSignal.delete(stateId);
      }
      for (const effectId of node.effectIds) {
        effectMap.delete(effectId);
      }
      componentMap.delete(id);
      emit({ type: 'component:unmounted', id });
      markGraphDirty();
    },

    registerSignal(signal, label, componentId, signalType) {
      if (!signal || signalMap.has(signal)) return;
      const id = genId();
      const owner = componentId || currentComponentId();
      signalMap.set(signal, {
        id,
        label: label || Compat.getLabel(signal),
        componentId: owner,
        type: signalType || 'state',
      });
      idToSignal.set(id, signal);
      if (owner) {
        const node = componentMap.get(owner);
        if (node) node.stateIds.push(id);
      }
    },

    registerEffect(fn, componentId) {
      const id = genId();
      const owner = componentId || currentComponentId();
      const fnName = (fn as { name?: string }).name;
      effectMap.set(id, {
        id,
        // The transform's IIFE binds every instrumented effect as
        // `const __fn = ...` (transform.ts instrumentUserEffect), so an
        // inferred name of '__fn' is meaningless — record null instead.
        label: fnName && fnName !== '__fn' ? fnName : null,
        componentId: owner,
        fn,
        wrappedFn: null,
      });
      if (owner) {
        const node = componentMap.get(owner);
        if (node) node.effectIds.push(id);
      }
      return id;
    },

    preMutation(signal) {
      if (!panelConnected) return;
      if (!signal || typeof signal !== 'object' || !signalMap.has(signal)) return;
      try {
        preCapture.set(signal, safeSerialize(Compat.getValue(signal)));
      } catch {
        try {
          preCapture.set(signal, null);
        } catch {
          // signal may be GC'd between checks; nothing useful to do
        }
      }
    },

    onMutation(signal) {
      if (!panelConnected) return;
      const meta = signalMap.get(signal);
      if (!meta) return;

      // component:updated is emitted once per distinct component at flush
      // time (scheduleTraceFlush), not per write — see Step 4 in plan 004.

      const stack = new Error().stack || null;
      const oldValue = preCapture.get(signal) ?? null;
      preCapture.delete(signal);
      let newValue: unknown = null;
      try {
        newValue = safeSerialize(Compat.getValue(signal));
      } catch {
        // serializer fails on hostile getters — fall through with null
      }

      const compNode = meta.componentId ? componentMap.get(meta.componentId) : null;
      if (tracePending.length >= MAX_TRACE_PENDING) tracePending.shift();
      tracePending.push({
        signalId: meta.id,
        signalLabel: meta.label,
        componentId: meta.componentId,
        componentName: compNode ? compNode.name : null,
        stackTrace: stack,
        oldValue,
        newValue,
        timestamp: Date.now(),
        _signal: signal,
      });
      scheduleTraceFlush();
    },

    wrapEffect(fn, effectId) {
      let reactionRef: Reaction | null = null;
      const wrapped = function wrappedEffect(this: unknown, ...args: unknown[]) {
        // Call-time gate (F19): wrapping happens once, at effect registration
        // (= component mount), so gating at wrap time permanently excluded
        // every component mounted before Record was pressed. The wrapper is
        // permanent; only the timing work is conditional.
        if (!profilingActive) return fn.apply(this, args);
        const start = performance.now();
        const result = fn.apply(this, args);
        const duration = performance.now() - start;
        if (effectTimings.length >= MAX_PROFILING_ENTRIES) effectTimings.shift();
        const effMeta = effectMap.get(effectId);
        if (!reactionRef) {
          // Lazy lookup: find the Svelte reaction object owning this wrapper
          for (const [signal] of signalMap) {
            for (const r of Compat.getReactions(signal)) {
              if (r && Compat.getReactionFn(r) === wrappedEffect) {
                reactionRef = r;
                break;
              }
            }
            if (reactionRef) break;
          }
        }
        effectTimings.push({
          effectId,
          label: effMeta?.label || null,
          componentId: effMeta?.componentId ?? null,
          componentName: effMeta?.componentId ? (componentMap.get(effMeta.componentId)?.name ?? null) : null,
          duration,
          depsCount: reactionRef ? Compat.getReactionDeps(reactionRef).length : 0,
        });
        try {
          const effLabel = effectMap.get(effectId)?.label || effectId;
          markPerf(`Effect: ${effLabel}`, start, start + duration, 'Effect Execution', 'secondary');
        } catch {
          // console.timeStamp non-standard; ignore
        }
        return result;
      };
      const effEntry = effectMap.get(effectId);
      if (effEntry) effEntry.wrappedFn = wrapped;
      return wrapped;
    },

    wrapRenderEffect(fn, componentName) {
      // Timing-only wrapper for compiler-emitted template effects. Unlike
      // user effects these are NEVER registered into effectMap/the graph:
      // {#each} bodies create one per row, so registry entries would grow
      // with list size. Owner is captured at wrap time — the transform bakes
      // the lexical component fn name in as `componentName`, which is correct
      // for rows created at ANY time (post-mount {#each} rows run with an
      // empty bridge component stack); the push/pop-window map lookup is only
      // a fallback. The name is frozen immediately either way (never resolve
      // history through live state).
      const ownerId = currentComponentId();
      const ownerName = componentName ?? (ownerId ? (componentMap.get(ownerId)?.name ?? null) : null);
      const wrapped = function wrappedRenderEffect(this: unknown, ...args: unknown[]) {
        // Call-time gate: the wrapper is permanent; only timing is conditional.
        if (!profilingActive) return fn.apply(this, args);
        const start = performance.now();
        const result = fn.apply(this, args);
        const duration = performance.now() - start;
        if (updateTimings.length >= MAX_PROFILING_ENTRIES) updateTimings.shift();
        updateTimings.push({ componentId: ownerId, componentName: ownerName, duration });
        return result;
      };
      renderEffectWrappers.add(wrapped);
      return wrapped;
    },

    getTree() {
      const nodes: unknown[] = [];
      for (const [, node] of componentMap) {
        nodes.push({
          id: node.id,
          name: node.name,
          filename: node.filename,
          children: node.children,
          parentId: node.parentId,
          meta: node.meta,
          stateIds: node.stateIds,
          effectIds: node.effectIds,
          renderDuration: node.renderDuration,
        });
      }
      return nodes;
    },

    buildGraph(filterComponentId) {
      const graphNodes: unknown[] = [];
      const graphEdges: unknown[] = [];
      const visited = new Set<Reaction>();
      const addedNodeIds = new Set<string>();

      for (const [signal, meta] of signalMap) {
        if (filterComponentId && meta.componentId !== filterComponentId) continue;

        let value: unknown = null;
        try {
          value = safeSerialize(Compat.getValue(signal));
        } catch {
          // serializer failed; emit null
        }
        graphNodes.push({
          id: meta.id,
          type: 'source',
          label: meta.label,
          value,
          dirty: Compat.isDirty(signal),
          componentId: meta.componentId,
        });
        addedNodeIds.add(meta.id);

        for (const reaction of Compat.getReactions(signal)) {
          if (!reaction) continue;
          const reactionId = getStableReactionId(reaction);

          const isDerived = Compat.isDerived(reaction);
          const reactionType = isDerived ? 'derived' : 'effect';

          if (!visited.has(reaction)) {
            visited.add(reaction);
            const fn = Compat.getReactionFn(reaction);
            let effMeta: EffectMeta | null = null;
            for (const [, eff] of effectMap) {
              if (eff.fn === fn || eff.wrappedFn === fn) {
                effMeta = eff;
                break;
              }
            }
            // Matched effects must never fall back to fn.name — fn is now always the
            // permanent profiling wrapper (named 'wrappedEffect'), not user code.
            // Same for unmatched template-effect reactions: they are deliberately
            // absent from effectMap, so gate the fn?.name fallback on the wrapper
            // registry lest they display 'wrappedRenderEffect'.
            const fallbackName = effMeta ? effMeta.label : fn && renderEffectWrappers.has(fn) ? null : fn?.name;
            const reactionLabel = Compat.getLabel(reaction) || fallbackName || null;
            let reactionValue: unknown = null;
            let reactionDirty = false;
            if (isDerived) {
              try {
                reactionValue = safeSerialize(Compat.getDerivedValue(reaction));
              } catch {
                // serializer failed; emit null
              }
              reactionDirty = Compat.isDirty(reaction);
            }

            let reactionComponentId: string | null = null;
            const ownerFn = Compat.getOwnerComponentFn(reaction);
            if (ownerFn) {
              for (const [, comp] of componentMap) {
                if (comp._componentFn === ownerFn) {
                  reactionComponentId = comp.id;
                  break;
                }
              }
            }
            if (!reactionComponentId && effMeta) {
              reactionComponentId = effMeta.componentId;
            }

            if (!filterComponentId || reactionComponentId === filterComponentId) {
              graphNodes.push({
                id: reactionId,
                type: reactionType,
                label: reactionLabel,
                value: reactionValue,
                dirty: reactionDirty,
                componentId: reactionComponentId,
              });
              addedNodeIds.add(reactionId);
            }
          }

          if (addedNodeIds.has(meta.id) && addedNodeIds.has(reactionId)) {
            graphEdges.push({ from: meta.id, to: reactionId, active: true });
          }
        }
      }

      return { nodes: graphNodes, edges: graphEdges };
    },

    startProfiling() {
      profilingActive = true;
      renderTimings.length = 0;
      effectTimings.length = 0;
      updateTimings.length = 0;
    },

    stopProfiling() {
      profilingActive = false;
      const data = {
        timings: [...renderTimings],
        effectTimings: [...effectTimings],
        updateTimings: [...updateTimings],
      };
      renderTimings.length = 0;
      effectTimings.length = 0;
      updateTimings.length = 0;
      return data;
    },
  };

  function getStableReactionId(reaction: Reaction): string {
    let rid = stableReactionIds.get(reaction);
    if (!rid) {
      rid = genId();
      stableReactionIds.set(reaction, rid);
      idToReaction.set(rid, new WeakRef(reaction));
    }
    return rid;
  }

  /**
   * Build + emit the state:snapshot for one component. Shared by the
   * inspect:component request and the state:edit handler, which re-emits the
   * authoritative snapshot after EVERY edit attempt so the panel confirms an
   * applied edit or reverts a refused one. The reported `type` corrects
   * tagged deriveds at read time (the transform registers $.tag($.state(...))
   * and $.tag($.derived(...)) identically, so meta.type alone says 'state'
   * for both — see Compat.isDerivedSignal).
   */
  function emitStateSnapshot(componentId: string): void {
    if (!componentMap.has(componentId)) return;
    const signals: unknown[] = [];
    for (const [signal, meta] of signalMap) {
      if (meta.componentId !== componentId) continue;
      let rawValue: unknown;
      try {
        rawValue = Compat.getValue(signal);
      } catch {
        rawValue = undefined;
      }
      let value: unknown = null;
      try {
        value = safeSerialize(rawValue);
      } catch {
        // serializer fails on hostile getters — fall through with null
      }
      const reportedType = meta.type === 'state' && Compat.isDerivedSignal(signal) ? 'derived' : meta.type || 'state';
      signals.push({ id: meta.id, label: meta.label, type: reportedType, value });
    }
    emit({ type: 'state:snapshot', componentId, signals });
  }

  /** Resolve a panel-supplied rootId to its current live value (signal .v or derived value). */
  function resolveLiveValue(rootId: string): { ok: boolean; value: unknown } {
    const signal = idToSignal.get(rootId);
    if (signal) {
      try {
        return { ok: true, value: Compat.getValue(signal) };
      } catch {
        return { ok: false, value: null };
      }
    }
    const reaction = idToReaction.get(rootId)?.deref();
    if (reaction && Compat.isDerived(reaction)) {
      try {
        return { ok: true, value: Compat.getDerivedValue(reaction) };
      } catch {
        return { ok: false, value: null };
      }
    }
    return { ok: false, value: null };
  }

  function buildChainFromSignal(signal: Value): unknown[] {
    const steps: unknown[] = [];
    const reactions = Compat.getReactions(signal);
    if (reactions.length === 0) return steps;
    const visited = new Set<Reaction>();

    function walk(rs: Reaction[]) {
      for (const r of rs) {
        if (!r || visited.has(r)) continue;
        visited.add(r);
        if (steps.length >= 50) return;

        const fn = Compat.getReactionFn(r);
        const isDerived = Compat.isDerived(r);
        let effectId: string | null = null;
        let effMeta: EffectMeta | null = null;
        if (!isDerived) {
          for (const [eid, eff] of effectMap) {
            if (eff.fn === fn || eff.wrappedFn === fn) {
              effectId = eid;
              effMeta = eff;
              break;
            }
          }
        }

        // Matched effects must never fall back to fn.name — fn is now always the
        // permanent profiling wrapper (named 'wrappedEffect'), not user code.
        // Same for unmatched template-effect reactions: they are deliberately
        // absent from effectMap, so gate the fn?.name fallback on the wrapper
        // registry lest they display 'wrappedRenderEffect'.
        const fallbackName = effMeta ? effMeta.label : fn && renderEffectWrappers.has(fn) ? null : fn?.name;
        const reactionLabel = Compat.getLabel(r) || fallbackName || null;
        let reactionValue: unknown = null;
        if (isDerived) {
          try {
            reactionValue = safeSerialize(Compat.getDerivedValue(r));
          } catch {
            // serializer failed; emit null
          }
        }

        const reactionSignalId = getStableReactionId(r);

        steps.push({
          signalId: reactionSignalId,
          signalLabel: reactionLabel,
          oldValue: null,
          newValue: reactionValue,
          effectId,
        });

        if (isDerived) {
          const innerReactions = Compat.getReactions(r);
          if (innerReactions.length > 0) walk(innerReactions);
        }
      }
    }
    walk(reactions);
    return steps;
  }

  function scheduleTraceFlush(): void {
    if (traceFlushScheduled) return;
    traceFlushScheduled = true;
    queueMicrotask(() => {
      traceFlushScheduled = false;
      if (tracePending.length === 0) return;

      const mutations = tracePending.splice(0);
      const domSnap = traceDomMutations.splice(0);

      // Coalesce by signalId, preserving first-seen order: one trace:update
      // per distinct signal instead of one per write. buildChainFromSignal
      // (a reaction-graph walk) runs once per group, not per mutation.
      const groups = new Map<string, typeof mutations>();
      for (const mut of mutations) {
        const group = groups.get(mut.signalId);
        if (group) {
          group.push(mut);
        } else {
          groups.set(mut.signalId, [mut]);
        }
      }

      const updatedComponentIds = new Set<string>();

      for (const group of groups.values()) {
        const first = group[0];
        const last = group[group.length - 1];
        const chain = buildChainFromSignal(last._signal);
        emit({
          type: 'trace:update',
          trace: {
            id: genId(),
            timestamp: last.timestamp,
            rootCause: {
              signalId: last.signalId,
              signalLabel: last.signalLabel,
              componentId: last.componentId,
              componentName: last.componentName,
              stackTrace: last.stackTrace,
              oldValue: first.oldValue,
              newValue: last.newValue,
            },
            chain,
            domMutations: domSnap,
            ...(group.length > 1 ? { coalescedCount: group.length } : {}),
          },
        });
        if (last.componentId) updatedComponentIds.add(last.componentId);
      }

      // component:updated moved here from onMutation: one emit per distinct
      // component touched in this flush, instead of one per write. This still
      // drives the panel's selected-component live-refresh (panel/main.ts) —
      // just at flush granularity. renderDuration: 0 preserves the guard in
      // components.svelte.ts that ignores this message for render timings.
      for (const componentId of updatedComponentIds) {
        emit({
          type: 'component:updated',
          id: componentId,
          renderDuration: 0,
          stateIds: [],
          effectIds: [],
        });
      }
      markGraphDirty();
    });
  }

  function emitGraphSnapshot(): void {
    graphDirty = false;
    lastGraphEmit = Date.now();
    const graph = bridge.buildGraph(graphFilter);
    emit({ type: 'graph:snapshot', nodes: graph.nodes, edges: graph.edges });
  }

  function stopGraphSubscription(): void {
    graphSubscribed = false;
    graphDirty = false;
    if (graphEmitTimer != null) {
      clearTimeout(graphEmitTimer);
      graphEmitTimer = null;
    }
  }

  // Trailing-edge throttle: the first dirty mark after a quiet period emits
  // after whatever remains of the interval; further marks while the timer is
  // pending coalesce into that one emission.
  function markGraphDirty(): void {
    if (!graphSubscribed || !panelConnected) return;
    graphDirty = true;
    if (graphEmitTimer != null) return;
    const delay = Math.max(0, GRAPH_EMIT_MIN_INTERVAL_MS - (Date.now() - lastGraphEmit));
    graphEmitTimer = setTimeout(() => {
      graphEmitTimer = null;
      if (!graphSubscribed || !panelConnected || !graphDirty) return;
      emitGraphSnapshot();
    }, delay);
  }

  // -- Listen for panel→bridge messages --
  // Three layered checks below validate origin (event.origin === same-origin),
  // source (event.source === window itself, blocking cross-frame), and the
  // `data.source` signature. Hardcoded allowlist origin isn't possible — this
  // script ships embedded in arbitrary host pages, so the page's own
  // window.location.origin IS the authoritative trusted origin.
  // nosemgrep
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'svelte-devtools-pro') return;
    const msg = data.payload;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'devtools:panel-connected':
        panelConnected = true;
        break;
      case 'devtools:panel-disconnected':
        panelConnected = false;
        // Stale queue — nothing left to flush for a panel that's gone.
        tracePending.length = 0;
        traceDomMutations.length = 0;
        stopGraphSubscription();
        // A closed panel can't finish an in-flight pick — never leave the
        // page in picking mode (crosshair cursor, capture-phase listeners).
        stopPicker();
        break;
      case 'profiler:start':
        bridge.startProfiling();
        break;
      case 'profiler:stop': {
        const result = bridge.stopProfiling();
        emit({ type: 'profiler:data', ...result });
        break;
      }
      case 'inspect:component': {
        emitStateSnapshot(msg.id);
        break;
      }
      case 'graph:request': {
        const graph = bridge.buildGraph(msg.componentId || null);
        emit({ type: 'graph:snapshot', nodes: graph.nodes, edges: graph.edges });
        break;
      }
      case 'graph:subscribe':
        // Reset any pending timer so re-subscribe (filter change) re-baselines
        // the throttle window atomically.
        stopGraphSubscription();
        graphSubscribed = true;
        graphFilter = msg.componentId || null;
        // Immediate snapshot so the tab renders without waiting a throttle
        // interval; also (re)baselines the throttle clock.
        emitGraphSnapshot();
        break;
      case 'graph:unsubscribe':
        stopGraphSubscription();
        break;
      case 'tree:request': {
        emit({ type: 'component:tree', nodes: bridge.getTree() });
        break;
      }
      case 'open-in-editor': {
        const { file, line, column } = msg as { file?: unknown; line?: unknown; column?: unknown };
        if (typeof file !== 'string' || !file) break;
        void sendToDevServer('svelte-devtools:open-in-editor', {
          file,
          line: typeof line === 'number' ? line : 1,
          column: typeof column === 'number' ? column : 1,
        });
        break;
      }
      case 'highlight:component': {
        const hlId = msg.id;
        if (hlId === null) {
          showHighlight(null);
        } else {
          const node = componentMap.get(hlId);
          const els = node ? findDomElementsByFilename(hlId, node.filename) : [];
          const rects = els.map((el) => el.getBoundingClientRect());
          showHighlight(rects);
        }
        break;
      }
      case 'picker:start': {
        startPicker((el) => {
          let componentId: string | null = null;
          const metaFile = el ? getSvelteMetaFile(el) : null;
          if (metaFile) {
            // First matching componentMap entry in insertion order — same
            // coarseness as highlight.ts's reverse mapping (filename-level,
            // can't distinguish two instances of the same component).
            for (const [id, node] of componentMap) {
              if (node.filename && (metaFile === node.filename || metaFile.endsWith('/' + node.filename))) {
                componentId = id;
                break;
              }
            }
          }
          emit({ type: 'picker:picked', componentId });
          // One pick per activation.
          stopPicker();
        });
        break;
      }
      case 'picker:stop':
        stopPicker();
        break;
      case 'state:expand': {
        const expandMsg = msg as { rootId: string; path: (string | number)[] };
        const rootId = expandMsg.rootId;
        const rawPath = Array.isArray(expandMsg.path) ? expandMsg.path : [];
        const path = rawPath.map(String);
        const resolved = resolveLiveValue(rootId);
        const children = resolved.ok ? serializeChildrenAtPath(resolved.value, path) : null;
        emit({ type: 'state:expanded', rootId, path: rawPath, children });
        break;
      }
      case 'state:edit': {
        // Declared in the protocol since v1; built by plan 018. The SW-side
        // shape validator already enforces signalId: string + path: string[]
        // for panel traffic, but the page wire is reachable without the
        // extension (e2e, other tooling) — re-normalize here.
        // Reachable from same-origin page scripts BY DESIGN (same trust model
        // as inspect:component / highlight:component): a same-realm script
        // can already mutate app state directly, so this write path grants
        // no capability it doesn't have — and the plugin is dev-only.
        const editMsg = msg as { signalId?: unknown; path?: unknown; value?: unknown };
        if (typeof editMsg.signalId !== 'string') break;
        const path = Array.isArray(editMsg.path) ? editMsg.path.map(String) : [];
        const signal = idToSignal.get(editMsg.signalId);
        const meta = signal ? signalMap.get(signal) : undefined;
        if (!signal || !meta) break;
        // Source-only contract enforced here for BOTH branches (adversarial
        // review round): nested edits must not mutate an object-valued
        // derived's cached value — deriveds often alias source objects, so
        // such writes would leak into real state. meta.type filters any
        // future non-state registrations (props); isDerivedSignal
        // structurally catches tagged deriveds. Compat.setValue re-checks
        // internally (defense in depth).
        const editableSource = meta.type === 'state' && !Compat.isDerivedSignal(signal);
        let edited = false;
        if (editableSource) {
          if (path.length === 0) {
            // Top-level replace — only source signals, through the app's own
            // $.set. Proxy-registered object state has no top-level setter (the
            // variable binding isn't ours to reassign) and is refused inside
            // setValue by the Value-shape check.
            edited = Compat.setValue(svelteInternals, signal, editMsg.value);
          } else {
            // Nested edit — assign through the live value; $state proxies fire
            // their own reactivity from the set trap. Note edits deliberately
            // bypass preMutation/onMutation (those wrap the transform's
            // instrumented $.set call sites), so panel edits produce no
            // trace:update entries.
            let live: unknown;
            try {
              live = Compat.getValue(signal);
            } catch {
              live = undefined;
            }
            edited = applyEditAtPath(live, path, editMsg.value);
          }
        }
        if (edited) markGraphDirty();
        // Always answer with the authoritative snapshot — confirm or revert.
        if (meta.componentId) emitStateSnapshot(meta.componentId);
        break;
      }
    }
  });

  window.__svelte_devtools__ = bridge;

  // Announce readiness — include version probe result so the panel can warn.
  const { svelteVersion, untested } = probeAndAnnounce();

  // -- DOM MutationObserver for tracing --
  try {
    const domObserver = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length && traceDomMutations.length < 100; i++) {
        const m = mutations[i];
        const target = m.target as Element;
        traceDomMutations.push({
          type: m.type,
          targetTag: (target.tagName || '#text').toLowerCase(),
          targetId: target.id || null,
          targetClass: typeof target.className === 'string' ? target.className : null,
          attributeName: m.attributeName || null,
          summary: summarizeDomMutation(m),
        });
      }
    });
    if (document.body) {
      domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
      });
    }
  } catch {
    // MutationObserver unsupported (very old browsers); tracing without DOM context is still useful
  }

  console.log('[svelte-devtools] Bridge initialized (Svelte ' + svelteVersion + (untested ? ', untested' : '') + ')');
})();
