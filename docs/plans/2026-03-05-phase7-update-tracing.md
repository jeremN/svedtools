# Phase 7: "Why Did This Update?" Tracing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Always-on update tracing that captures the full causal chain from source mutation to DOM change, displayed in a timeline UI.

**Architecture:** Bridge captures stack traces at mutation sites, walks the reactive graph to build propagation chains, and correlates with MutationObserver DOM changes — all batched via queueMicrotask. Panel stores a ring buffer of 200 traces with expandable detail view.

**Tech Stack:** Svelte 5 runes (.svelte.ts stores), MutationObserver API, queueMicrotask, existing bridge postMessage infrastructure.

---

### Task 1: Update $.set transform to capture pre-mutation value

**Files:**
- Modify: `packages/vite-plugin/src/transform.ts:204-212`
- Modify: `packages/vite-plugin/src/transform.test.ts:82-85`

**Step 1: Update the $.set test expectation**

In `transform.test.ts`, update the `instruments $.set with onMutation call` test to expect the new preMutation + onMutation pattern:

```typescript
it('instruments $.set with preMutation and onMutation calls', () => {
  const result = transformSvelteOutput(EFFECT_FIXTURE, 'EffectChain.svelte');
  expect(result!.code).toContain('__svelte_devtools__?.preMutation(processed)');
  expect(result!.code).toContain('__svelte_devtools__?.onMutation(processed)');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vite-plugin/src/transform.test.ts`
Expected: FAIL — `preMutation` not found in output.

**Step 3: Update instrumentSet in transform.ts**

Replace the `instrumentSet` function at line 204:

```typescript
function instrumentSet(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 2) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  // Capture old value before set, then notify after set
  s.prependLeft(node.start, `(window.__svelte_devtools__?.preMutation(${signalArg}), `);
  s.appendRight(node.end, `, window.__svelte_devtools__?.onMutation(${signalArg}))`);
}
```

Output: `(preMutation(signal), $.set(signal, value), onMutation(signal))`

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vite-plugin/src/transform.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/vite-plugin/src/transform.ts packages/vite-plugin/src/transform.test.ts
git commit -m "feat(transform): add preMutation capture for $.set instrumentation"
```

---

### Task 2: Update $.update transform to capture pre/post mutation values

**Files:**
- Modify: `packages/vite-plugin/src/transform.ts:222-233`
- Modify: `packages/vite-plugin/src/transform.test.ts:65-68,87-93`

**Step 1: Update $.update test expectations**

In `transform.test.ts`, update the `instruments $.update with onMutation call` test:

```typescript
it('instruments $.update with preMutation and onMutation calls', () => {
  const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
  expect(result!.code).toContain('__svelte_devtools__?.preMutation(count)');
  expect(result!.code).toContain('__svelte_devtools__?.onMutation(count)');
});
```

Also update the `preserves original code structure` test — `$.update(count, -1)` should still be present in the IIFE:

```typescript
it('preserves original code structure', () => {
  const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
  expect(result!.code).toContain('$.push($$props, true, Counter)');
  expect(result!.code).toContain('$.pop($$exports)');
  expect(result!.code).toContain('$.update(count, -1)');
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/vite-plugin/src/transform.test.ts`
Expected: FAIL — `preMutation(count)` not found.

**Step 3: Update instrumentUpdate to IIFE pattern**

Replace the `instrumentUpdate` function at line 222:

```typescript
function instrumentUpdate(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 1) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  // IIFE preserves $.update return value while capturing pre/post mutation
  s.prependLeft(
    node.start,
    `(() => { window.__svelte_devtools__?.preMutation(${signalArg}); const __r = `,
  );
  s.appendRight(
    node.end,
    `; window.__svelte_devtools__?.onMutation(${signalArg}); return __r; })()`,
  );
}
```

Output: `(() => { preMutation(signal); const __r = $.update(signal, -1); onMutation(signal); return __r; })()`

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/vite-plugin/src/transform.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/vite-plugin/src/transform.ts packages/vite-plugin/src/transform.test.ts
git commit -m "feat(transform): add preMutation/onMutation IIFE for $.update"
```

---

### Task 3: Add bridge tracing infrastructure

**Files:**
- Modify: `packages/vite-plugin/src/runtime-inject.ts`

This is the largest task — add all bridge-side tracing to `runtime-inject.ts`.

**Step 1: Add trace state variables**

After line 37 (`const pendingMutations = [];`), add:

```javascript
  // -- Tracing --
  const MAX_TRACE_MUTATIONS = 200;
  let traceFlushScheduled = false;
  const tracePending = [];        // root cause mutations for current microtask
  const traceDomMutations = [];   // DOM changes from MutationObserver
  const preCapture = new Map();   // signal -> serialized old value
```

**Step 2: Add preMutation method to bridge**

Add before `onMutation` (around line 343):

```javascript
    // Capture signal value BEFORE mutation (called by $.set and $.update transforms)
    preMutation(signal) {
      if (!signalMap.has(signal)) return;
      try { preCapture.set(signal, safeSerialize(signal.v)); } catch(e) { preCapture.set(signal, null); }
    },
```

**Step 3: Enhance onMutation with stack capture + trace scheduling**

Replace the `onMutation` method body (lines 343-364):

```javascript
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

      // Emit for live component updates
      emit({
        type: 'component:updated',
        id: meta.componentId,
        renderDuration: 0,
        stateIds: [],
        effectIds: [],
      });

      // -- Tracing --
      const stack = new Error().stack || null;
      const oldValue = preCapture.get(signal) ?? null;
      preCapture.delete(signal);
      let newValue = null;
      try { newValue = safeSerialize(signal.v); } catch(e) {}

      const compNode = meta.componentId ? componentMap.get(meta.componentId) : null;
      tracePending.push({
        signalId: meta.id,
        signalLabel: meta.label,
        componentId: meta.componentId,
        componentName: compNode ? compNode.name : null,
        stackTrace: stack,
        oldValue,
        newValue,
        timestamp: performance.now(),
        _signal: signal,
      });

      scheduleTraceFlush();
    },
```

**Step 4: Add chain building function**

Add after the bridge object (before the message listener), around line 545:

```javascript
  // -- Trace chain building --
  function buildChainFromSignal(signal) {
    const steps = [];
    if (!signal || !signal.reactions) return steps;

    const visited = new Set();
    function walkReactions(reactions) {
      if (!reactions || !Array.isArray(reactions)) return;
      for (const r of reactions) {
        if (!r || visited.has(r)) continue;
        visited.add(r);
        if (steps.length >= 50) return; // cap chain depth

        const isDerived = !('teardown' in r);
        let effectId = null;
        if (!isDerived) {
          for (const [eid, eff] of effectMap) {
            if (eff.fn === r.fn) { effectId = eid; break; }
          }
        }

        let reactionLabel = r.label || (r.fn && r.fn.name) || null;
        let reactionValue = null;
        if (isDerived) {
          try { reactionValue = safeSerialize(r.v); } catch(e) {}
        }

        // Find signal ID for this reaction
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
          effectId: effectId,
        });

        // Recurse into derived's own reactions
        if (isDerived && r.reactions) {
          walkReactions(r.reactions);
        }
      }
    }
    walkReactions(signal.reactions);
    return steps;
  }
```

**Step 5: Add DOM mutation summary helper**

Add near the helper functions (after `safeSerialize`, around line 95):

```javascript
  function summarizeDomMutation(m) {
    if (m.type === 'attributes') {
      return (m.target.tagName || '').toLowerCase() + '.' + m.attributeName + ' changed';
    }
    if (m.type === 'characterData') {
      return 'text content changed';
    }
    // childList
    const added = m.addedNodes ? m.addedNodes.length : 0;
    const removed = m.removedNodes ? m.removedNodes.length : 0;
    const parts = [];
    if (added) parts.push(added + ' added');
    if (removed) parts.push(removed + ' removed');
    return parts.join(', ') || 'children changed';
  }
```

**Step 6: Add MutationObserver setup**

Add after the bridge is assigned to `window.__svelte_devtools__` (after line 610):

```javascript
  // -- DOM MutationObserver for tracing --
  try {
    const domObserver = new MutationObserver(function(mutations) {
      for (let i = 0; i < mutations.length && traceDomMutations.length < 100; i++) {
        const m = mutations[i];
        traceDomMutations.push({
          type: m.type,
          targetTag: (m.target.tagName || '#text').toLowerCase(),
          targetId: m.target.id || null,
          targetClass: typeof m.target.className === 'string' ? m.target.className : null,
          attributeName: m.attributeName || null,
          summary: summarizeDomMutation(m),
        });
      }
    });
    if (document.body) {
      domObserver.observe(document.body, {
        childList: true, subtree: true,
        attributes: true, characterData: true,
      });
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        domObserver.observe(document.body, {
          childList: true, subtree: true,
          attributes: true, characterData: true,
        });
      });
    }
  } catch(e) {}
```

**Step 7: Add trace flush scheduler**

Add right after the chain building function:

```javascript
  function scheduleTraceFlush() {
    if (traceFlushScheduled) return;
    traceFlushScheduled = true;
    queueMicrotask(function() {
      traceFlushScheduled = false;
      if (tracePending.length === 0) return;

      // Build one trace per root mutation
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
            },
            chain: chain,
            domMutations: domSnap,
          },
        });
      }
    });
  }
```

**Step 8: Build and verify**

Run: `cd packages/extension && npx vite build`
Expected: Successful build, no errors.

Run: `npx vitest run`
Expected: ALL PASS

**Step 9: Commit**

```bash
git add packages/vite-plugin/src/runtime-inject.ts
git commit -m "feat(bridge): add always-on update tracing with stack capture, chain building, and MutationObserver"
```

---

### Task 4: Create tracer store

**Files:**
- Create: `packages/extension/src/panel/lib/tracer.svelte.ts`

**Step 1: Create the store file**

```typescript
import type { UpdateTrace, NodeId, BridgeToPanelMessage } from '@svelte-devtools/shared';

const MAX_TRACES = 200;

// -- Reactive state --

let traces: UpdateTrace[] = $state([]);
let selectedTraceId: NodeId | null = $state(null);

// -- Exported accessors --

export function getTraces(): UpdateTrace[] {
	return traces;
}

export function getSelectedTraceId(): NodeId | null {
	return selectedTraceId;
}

export function getSelectedTrace(): UpdateTrace | null {
	if (!selectedTraceId) return null;
	return traces.find((t) => t.id === selectedTraceId) ?? null;
}

// -- Actions --

export function selectTrace(id: NodeId | null): void {
	selectedTraceId = id;
}

export function clearTraces(): void {
	traces = [];
	selectedTraceId = null;
}

// -- Message processing --

export function processTraceMessage(message: BridgeToPanelMessage): void {
	if (message.type !== 'trace:update') return;
	// Ring buffer: evict oldest when full
	if (traces.length >= MAX_TRACES) {
		traces = [...traces.slice(-(MAX_TRACES - 1)), message.trace];
	} else {
		traces = [...traces, message.trace];
	}
}

// -- Reset --

export function resetTracerState(): void {
	traces = [];
	selectedTraceId = null;
}
```

**Step 2: Verify build**

Run: `cd packages/extension && npx vite build`
Expected: Successful build.

**Step 3: Commit**

```bash
git add packages/extension/src/panel/lib/tracer.svelte.ts
git commit -m "feat(panel): add tracer store with ring buffer"
```

---

### Task 5: Create UpdateTracer.svelte component

**Files:**
- Create: `packages/extension/src/panel/components/UpdateTracer.svelte`

**IMPORTANT:** Use `@svelte:svelte-code-writer` skill via the svelte-file-editor agent.

**Step 1: Create the component**

The component should:
- Display a scrollable timeline of traces (most recent first)
- Each trace row shows: relative timestamp, signal label, component name, chain length badge
- Clicking a trace expands it to show:
  - **Root Cause** section: signal name, component, stack trace (collapsible)
  - **Chain** section: list of propagation steps with signal labels and values
  - **DOM Mutations** section: list of DOM changes with summaries
- A "Clear" button to reset the buffer
- Color scheme matching the existing dark DevTools theme (#1e1e1e background, #ccc text, #ff3e00 Svelte orange)

Imports needed:
```typescript
import { getTraces, getSelectedTraceId, selectTrace, clearTraces } from '../lib/tracer.svelte.js';
```

Layout structure:
```
┌─────────────────────────────────────────┐
│ [Clear] button            trace count   │
├─────────────────────────────────────────┤
│ ▸ 0.3s ago  count → Counter  [3 steps] │  ← clickable rows
│ ▾ 1.2s ago  items → TodoList [5 steps] │  ← expanded
│   ┌ Root Cause ─────────────────────┐   │
│   │ Signal: items (TodoList)        │   │
│   │ ▸ Stack trace                   │   │
│   ├ Chain ──────────────────────────┤   │
│   │ → filtered (derived) = [...]    │   │
│   │ → render effect                 │   │
│   ├ DOM Changes ────────────────────┤   │
│   │ • 2 added, 1 removed           │   │
│   └─────────────────────────────────┘   │
│ ▸ 2.5s ago  name → UserCard [1 step]   │
└─────────────────────────────────────────┘
```

**Step 2: Run through svelte-autofixer**

Validate with `@svelte:svelte-code-writer` skill / svelte-autofixer tool.

**Step 3: Commit**

```bash
git add packages/extension/src/panel/components/UpdateTracer.svelte
git commit -m "feat(panel): add UpdateTracer component with timeline and trace detail view"
```

---

### Task 6: Wire everything together

**Files:**
- Modify: `packages/extension/src/panel/main.ts`
- Modify: `packages/extension/src/panel/App.svelte`

**Step 1: Wire tracer into main.ts**

Add imports and routing:

```typescript
import { processTraceMessage, resetTracerState } from './lib/tracer.svelte.js';

// Add after existing onMessage calls:
onMessage(processTraceMessage);

// Add after existing onDisconnect calls:
onDisconnect(resetTracerState);
```

**Step 2: Replace Tracer placeholder in App.svelte**

Add import:
```typescript
import UpdateTracer from './components/UpdateTracer.svelte';
```

Replace line 58:
```svelte
{:else}
  <div style="padding: 16px"><p>Update tracer will appear here</p></div>
```

With:
```svelte
{:else}
  <UpdateTracer />
```

**Step 3: Build and verify**

Run: `cd packages/extension && npx vite build`
Expected: Successful build.

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/extension/src/panel/main.ts packages/extension/src/panel/App.svelte
git commit -m "feat(panel): wire UpdateTracer into main routing and App tab"
```

---

### Task 7: Update PLAN.md and final commit

**Files:**
- Modify: `PLAN.md`

**Step 1: Update progress table**

Change Phase 7 row from `Pending` to `**Complete**` with branch `feat/phase-1-scaffolding`.

**Step 2: Add completion notes**

Add a "Phase 7: Update Tracing — Completion Notes" section at the end of PLAN.md documenting:
- Files created/modified
- Design decisions (always-on tracing, microtask batching, ring buffer)
- Any review fixes applied

**Step 3: Commit**

```bash
git add PLAN.md
git commit -m "docs: mark Phase 7 complete in PLAN.md"
```
