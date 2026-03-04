/**
 * Returns the source code for the runtime bridge that gets injected
 * into the page via the virtual module `virtual:svelte-devtools-bridge`.
 *
 * This code runs in the page context and:
 * - Creates `window.__svelte_devtools__` global
 * - Tracks component push/pop for tree building
 * - Registers signals and effects
 * - Records mutations for update tracing
 * - Emits postMessage events for the extension content script
 */
export function getBridgeCode(): string {
  return `
(function() {
  if (typeof window === 'undefined' || window.__svelte_devtools__) return;

  let idCounter = 0;
  const genId = () => 'sdt-' + (++idCounter);

  // -- Component stack --
  const componentStack = [];
  const componentMap = new Map(); // id -> ComponentNode
  const rootComponents = [];     // top-level component IDs

  // -- Signal & Effect registries --
  const signalMap = new Map();   // signal object -> { id, label, componentId }
  const effectMap = new Map();   // effect id -> { id, label, componentId, fn }
  const stableReactionIds = new Map(); // reaction object -> stable graph node id (persists across buildGraph calls)

  // -- Profiling --
  const MAX_PROFILING_ENTRIES = 10000;
  let profilingActive = false;
  const renderTimings = [];
  const effectTimings = [];

  // -- Mutation queue (for update tracing) --
  const pendingMutations = [];

  // -- Helpers --
  function emit(payload) {
    window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
  }

  // Lightweight serializer for signal values (runs in page context, no imports)
  const STATE_SYMBOL = Symbol.for('state');
  function unwrapProxy(obj) {
    if (obj && typeof obj === 'object' && STATE_SYMBOL in obj) {
      const raw = obj[STATE_SYMBOL];
      if (raw && typeof raw === 'object') return raw;
    }
    return obj;
  }

  function safeSerialize(value, depth, seen) {
    if (depth === undefined) depth = 0;
    if (seen === undefined) seen = new WeakSet();
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t === 'boolean' || t === 'number') return value;
    if (t === 'bigint') return value + 'n';
    if (t === 'string') return value.length > 200 ? value.slice(0, 200) + '...' : value;
    if (t === 'symbol') return 'Symbol(' + (value.description || '') + ')';
    if (t === 'function') return 'fn ' + (value.name || 'anonymous') + '()';
    // Object
    const raw = unwrapProxy(value);
    if (seen.has(raw)) return { __type: 'circular', path: '' };
    seen.add(raw);
    if (raw && typeof raw.nodeType === 'number') {
      return { __type: 'dom', tag: (raw.tagName || 'node').toLowerCase(), id: raw.id || null, className: raw.className || null };
    }
    if (raw instanceof Date) return raw.toISOString();
    if (raw instanceof RegExp) return raw.toString();
    if (raw instanceof Error) return raw.name + ': ' + raw.message;
    if (depth >= 3) return { __type: 'truncated', reason: 'Max depth reached' };
    if (Array.isArray(raw)) {
      const preview = raw.slice(0, 5).map(function(v) { return previewVal(v); }).join(', ');
      return { __type: 'array', length: raw.length, preview: '[' + preview + (raw.length > 5 ? ', ...' : '') + ']' };
    }
    var keys;
    try { keys = Object.keys(raw); } catch(e) { return { __type: 'truncated', reason: 'Cannot enumerate' }; }
    var previewKeys = keys.slice(0, 5);
    var preview = previewKeys.map(function(k) { return k + ': ' + previewVal(raw[k]); }).join(', ');
    return { __type: 'object', preview: '{' + preview + (keys.length > 5 ? ', ...' : '') + '}', childCount: keys.length };
  }

  function previewVal(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    var t = typeof v;
    if (t === 'string') return '"' + (v.length > 30 ? v.slice(0, 30) + '...' : v) + '"';
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
    if (t === 'symbol') return 'Symbol()';
    if (Array.isArray(v)) return 'Array(' + v.length + ')';
    if (t === 'function') return 'fn()';
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Error) return v.name;
    return '{...}';
  }

  // -- Highlight overlay --
  let highlightOverlay = null;
  function showHighlight(rects) {
    if (!highlightOverlay) {
      highlightOverlay = document.createElement('div');
      highlightOverlay.id = 'svelte-devtools-highlight';
      highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ff3e00;background:rgba(255,62,0,0.1);transition:all 0.15s;';
      document.body.appendChild(highlightOverlay);
    }
    if (!rects || rects.length === 0) {
      highlightOverlay.style.display = 'none';
      return;
    }
    // Union of all rects
    let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
    for (const r of rects) {
      if (r.top < top) top = r.top;
      if (r.left < left) left = r.left;
      if (r.bottom > bottom) bottom = r.bottom;
      if (r.right > right) right = r.right;
    }
    highlightOverlay.style.display = 'block';
    highlightOverlay.style.top = top + 'px';
    highlightOverlay.style.left = left + 'px';
    highlightOverlay.style.width = (right - left) + 'px';
    highlightOverlay.style.height = (bottom - top) + 'px';
  }

  // Cache DOM element lookups to avoid repeated full-page walks
  let highlightCache = { componentId: null, elements: [], timestamp: 0 };
  const HIGHLIGHT_CACHE_TTL = 500; // ms

  function findDomElements(componentId) {
    const node = componentMap.get(componentId);
    if (!node || !node.filename) return [];

    // Return cached result if fresh
    const now = performance.now();
    if (highlightCache.componentId === componentId && (now - highlightCache.timestamp) < HIGHLIGHT_CACHE_TTL) {
      return highlightCache.elements;
    }

    // Walk DOM for __svelte_meta matching filename (with element limit)
    const MAX_ELEMENTS = 10000;
    const elements = [];
    const filename = node.filename;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let el;
    let count = 0;
    while ((el = walker.nextNode()) && count < MAX_ELEMENTS) {
      count++;
      const meta = el.__svelte_meta;
      if (!meta || !meta.file) continue;
      // Prefer full path match, fall back to basename
      if (meta.file === filename || meta.file.endsWith('/' + filename)) {
        elements.push(el);
      }
    }

    highlightCache = { componentId, elements, timestamp: now };
    return elements;
  }

  // Svelte stores the filename as a symbol property on the component function
  const FILENAME_KEY = Symbol.for('svelte.filename');

  function getComponentName(fn) {
    return fn?.name || 'Unknown';
  }

  function getComponentFilename(fn) {
    if (!fn) return null;
    // Try known symbols and common property names
    for (const key of Object.getOwnPropertySymbols(fn)) {
      const desc = key.description || '';
      if (desc === 'filename' || desc === 'svelte.filename') {
        return fn[key] || null;
      }
    }
    // Fallback: check FILENAME symbol directly
    return fn[FILENAME_KEY] || null;
  }

  // -- Bridge API --
  const bridge = {
    version: '0.0.1',
    componentMap,
    signalMap,
    effectMap,
    rootComponents,

    // Called when $.push is intercepted
    // name is baked as a string literal at compile time to survive HMR wrapping
    onPush(name, props, componentFn) {
      const id = genId();
      const parentId = componentStack.length > 0
        ? componentStack[componentStack.length - 1].id
        : null;

      const node = {
        id,
        name,
        filename: getComponentFilename(componentFn),
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

    // Called when $.pop is intercepted
    onPop() {
      const node = componentStack.pop();
      if (!node) return;

      const duration = performance.now() - node._startTime;
      node.renderDuration = duration;

      // Emit component:mounted
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

      // Chrome Performance API integration
      if (profilingActive) {
        try {
          // console.timeStamp for Chrome Performance custom tracks
          console.timeStamp(
            'Render: ' + node.name,
            node._startTime,
            node._startTime + duration,
            'Component Renders',
            'Svelte DevTools Pro',
            'primary'
          );
        } catch {}
      }

      if (profilingActive) {
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

    // Remove a component and its descendants from the tree (for HMR/unmount)
    removeComponent(id) {
      const node = componentMap.get(id);
      if (!node) return;

      // Recursively remove children
      for (const childId of node.children) {
        bridge.removeComponent(childId);
      }

      // Remove from parent's children array
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

    // Called when $.state or $.tag($.state(...), label) is encountered
    // signalType: 'state' | 'derived' | 'props'
    registerSignal(signal, label, componentId, signalType) {
      if (!signal || signalMap.has(signal)) return;
      const id = genId();
      const currentComponent = componentId || (
        componentStack.length > 0
          ? componentStack[componentStack.length - 1].id
          : null
      );
      signalMap.set(signal, { id, label: label || signal.label || null, componentId: currentComponent, type: signalType || 'state' });

      if (currentComponent) {
        const node = componentMap.get(currentComponent);
        if (node) node.stateIds.push(id);
      }
    },

    // Called when $.user_effect is intercepted
    registerEffect(fn, componentId) {
      const id = genId();
      const currentComponent = componentId || (
        componentStack.length > 0
          ? componentStack[componentStack.length - 1].id
          : null
      );
      effectMap.set(id, { id, label: fn.name || null, componentId: currentComponent, fn });

      if (currentComponent) {
        const node = componentMap.get(currentComponent);
        if (node) node.effectIds.push(id);
      }

      return id;
    },

    // Called AFTER $.set or $.update completes (to avoid double evaluation)
    onMutation(signal) {
      const meta = signalMap.get(signal);
      if (!meta) return;

      if (pendingMutations.length >= 1000) pendingMutations.shift();
      pendingMutations.push({
        signalId: meta.id,
        signalLabel: meta.label,
        componentId: meta.componentId,
        timestamp: performance.now(),
      });

      // Emit for live updates
      emit({
        type: 'component:updated',
        id: meta.componentId,
        renderDuration: 0,
        stateIds: [],
        effectIds: [],
      });
    },

    // Wrap an effect function for profiling
    wrapEffect(fn, effectId) {
      if (!profilingActive) return fn;
      return function wrappedEffect() {
        const start = performance.now();
        const result = fn.apply(this, arguments);
        const duration = performance.now() - start;
        if (effectTimings.length >= MAX_PROFILING_ENTRIES) effectTimings.shift();
        effectTimings.push({ effectId, duration, timestamp: start });
        try {
          console.timeStamp(
            'Effect: ' + (effectMap.get(effectId)?.label || effectId),
            start,
            start + duration,
            'Effect Execution',
            'Svelte DevTools Pro',
            'secondary'
          );
        } catch {}
        return result;
      };
    },

    // Get the full component tree (for panel reconnection)
    getTree() {
      const nodes = [];
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

    // Build the reactive dependency graph
    buildGraph(filterComponentId) {
      const graphNodes = [];
      const graphEdges = [];
      const visited = new Set();  // track visited reaction objects
      const addedNodeIds = new Set(); // track which node IDs were actually added

      // Walk all registered signals
      for (const [signal, meta] of signalMap) {
        if (filterComponentId && meta.componentId !== filterComponentId) continue;

        // Add signal as source node
        let value = null;
        try { value = safeSerialize(signal.v); } catch(e) {}
        const dirty = typeof signal.wv === 'number' && typeof signal.rv === 'number' && signal.wv > signal.rv;

        graphNodes.push({
          id: meta.id,
          type: 'source',
          label: meta.label,
          value: value,
          dirty: dirty,
          componentId: meta.componentId,
        });
        addedNodeIds.add(meta.id);

        // Walk reactions (dependents)
        const reactions = signal.reactions;
        if (!reactions || !Array.isArray(reactions)) continue;

        for (const reaction of reactions) {
          if (!reaction) continue;
          // Stable ID: cache reaction→id mapping across calls
          let reactionId = stableReactionIds.get(reaction);
          if (!reactionId) {
            reactionId = genId();
            stableReactionIds.set(reaction, reactionId);
          }

          // Determine type: Effects have a 'teardown' field, Deriveds do not
          // (more reliable than checking .reactions which can be null on new deriveds)
          const isDerived = !('teardown' in reaction);
          const reactionType = isDerived ? 'derived' : 'effect';

          if (!visited.has(reaction)) {
            visited.add(reaction);
            let reactionLabel = reaction.label || (reaction.fn && reaction.fn.name) || null;
            let reactionValue = null;
            let reactionDirty = false;

            if (isDerived) {
              try { reactionValue = safeSerialize(reaction.v); } catch(e) {}
              reactionDirty = typeof reaction.wv === 'number' && typeof reaction.rv === 'number' && reaction.wv > reaction.rv;
            }

            // Find owning component
            let reactionComponentId = null;
            if (reaction.ctx && reaction.ctx.uid) {
              for (const [, comp] of componentMap) {
                if (comp._componentFn && reaction.ctx.function === comp._componentFn) {
                  reactionComponentId = comp.id;
                  break;
                }
              }
            }
            if (!reactionComponentId) {
              for (const [, eff] of effectMap) {
                if (eff.fn === reaction.fn) {
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

          // Only add edge if both source and target nodes were added
          if (addedNodeIds.has(meta.id) && addedNodeIds.has(reactionId)) {
            graphEdges.push({
              from: meta.id,
              to: reactionId,
              active: true,
            });
          }
        }
      }

      return { nodes: graphNodes, edges: graphEdges };
    },

    // Profiling control
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

  // -- Listen for messages FROM extension --
  window.addEventListener('message', (event) => {
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
        const data = bridge.stopProfiling();
        emit({ type: 'profiler:data', ...data });
        break;
      }
      case 'inspect:component': {
        const targetId = msg.id;
        const comp = componentMap.get(targetId);
        if (!comp) break;
        // Walk signalMap for signals owned by this component
        const signals = [];
        for (const [signal, meta] of signalMap) {
          if (meta.componentId !== targetId) continue;
          // Read signal.v — this is an untracked reactive read in Svelte 5.
          // Outside a component/effect context this is safe (no subscription created).
          // If Svelte adds dev-mode warnings for untracked reads, this may need untrack().
          let rawValue;
          try { rawValue = signal.v; } catch(e) { rawValue = undefined; }
          signals.push({
            id: meta.id,
            label: meta.label,
            type: meta.type || 'state',
            value: safeSerialize(rawValue),
          });
        }
        emit({
          type: 'state:snapshot',
          componentId: targetId,
          signals,
        });
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
          const els = findDomElements(hlId);
          const rects = els.map(function(el) { return el.getBoundingClientRect(); });
          showHighlight(rects);
        }
        break;
      }
    }
  });

  window.__svelte_devtools__ = bridge;

  // Announce readiness
  emit({
    type: 'bridge:ready',
    svelteVersion: window.__svelte?.v || 'unknown',
    protocolVersion: 1,
  });

  console.log('[svelte-devtools] Bridge initialized');
})();
export {};
`;
}
