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
import { safeSerialize, summarizeDomMutation } from './serializer.js';
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

  function emit(payload: unknown): void {
    window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
  }

  function currentComponentId(): string | null {
    return componentStack.length > 0 ? componentStack[componentStack.length - 1].id : null;
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

    onPop() {
      const node = componentStack.pop();
      if (!node) return;
      const duration = performance.now() - node._startTime;
      node.renderDuration = duration;

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
      componentMap.delete(id);
      emit({ type: 'component:unmounted', id });
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
      const meta = signalMap.get(signal);
      if (!meta) return;

      emit({
        type: 'component:updated',
        id: meta.componentId,
        renderDuration: 0,
        stateIds: [],
        effectIds: [],
      });

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
          let reactionId = stableReactionIds.get(reaction);
          if (!reactionId) {
            reactionId = genId();
            stableReactionIds.set(reaction, reactionId);
          }

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

        let reactionSignalId = stableReactionIds.get(r);
        if (!reactionSignalId) {
          reactionSignalId = genId();
          stableReactionIds.set(r, reactionSignalId);
        }

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

      for (const rootMut of mutations) {
        const chain = buildChainFromSignal(rootMut._signal);
        emit({
          type: 'trace:update',
          trace: {
            id: genId(),
            timestamp: rootMut.timestamp,
            rootCause: {
              signalId: rootMut.signalId,
              signalLabel: rootMut.signalLabel,
              componentId: rootMut.componentId,
              componentName: rootMut.componentName,
              stackTrace: rootMut.stackTrace,
              oldValue: rootMut.oldValue,
              newValue: rootMut.newValue,
            },
            chain,
            domMutations: domSnap,
          },
        });
      }
    });
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
