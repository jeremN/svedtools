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
    duration: number;
    depsCount: number;
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
    stopProfiling: () => { timings: unknown[]; effectTimings: unknown[] };
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
      effectMap.set(id, {
        id,
        label: (fn as { name?: string }).name || null,
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
      if (!profilingActive) return fn;
      let reactionRef: Reaction | null = null;
      const wrapped = function wrappedEffect(this: unknown, ...args: unknown[]) {
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
            const reactionLabel = Compat.getLabel(reaction) || fn?.name || null;
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
            if (!reactionComponentId) {
              for (const [, eff] of effectMap) {
                if (eff.fn === fn || eff.wrappedFn === fn) {
                  reactionComponentId = eff.componentId;
                  break;
                }
              }
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
    },

    stopProfiling() {
      profilingActive = false;
      const data = {
        timings: [...renderTimings],
        effectTimings: [...effectTimings],
      };
      renderTimings.length = 0;
      effectTimings.length = 0;
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
        if (!isDerived) {
          for (const [eid, eff] of effectMap) {
            if (eff.fn === fn || eff.wrappedFn === fn) {
              effectId = eid;
              break;
            }
          }
        }

        const reactionLabel = Compat.getLabel(r) || fn?.name || null;
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
        const targetId = msg.id;
        const comp = componentMap.get(targetId);
        if (!comp) break;
        const signals: unknown[] = [];
        for (const [signal, meta] of signalMap) {
          if (meta.componentId !== targetId) continue;
          let rawValue: unknown;
          try {
            rawValue = Compat.getValue(signal);
          } catch {
            rawValue = undefined;
          }
          signals.push({
            id: meta.id,
            label: meta.label,
            type: meta.type || 'state',
            value: safeSerialize(rawValue),
          });
        }
        emit({ type: 'state:snapshot', componentId: targetId, signals });
        break;
      }
      case 'graph:request': {
        const graph = bridge.buildGraph(msg.componentId || null);
        emit({ type: 'graph:snapshot', nodes: graph.nodes, edges: graph.edges });
        break;
      }
      case 'graph:subscribe':
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
    }
  });

  window.__svelte_devtools__ = bridge;

  // Announce readiness — include version probe result so the panel can warn.
  const { version, tested } = detectSvelteVersion();
  emit({
    type: 'bridge:ready',
    svelteVersion: version,
    protocolVersion: 1,
    untested: !tested,
  });

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

  console.log('[svelte-devtools] Bridge initialized (Svelte ' + version + (tested ? '' : ', untested') + ')');
})();
