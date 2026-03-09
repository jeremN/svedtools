# Phase 7: "Why Did This Update?" Tracing — Design

## Goal

Enable developers to click any update and see the full causal chain from source mutation to DOM change. Always-on when DevTools panel is connected; ring buffer of 200 traces on the panel side.

## Existing Infrastructure

- `UpdateTrace`, `UpdateChainStep`, `DomMutation` types defined in `types.ts`
- `TraceUpdateMessage` protocol message defined in `protocol.ts`
- `onMutation()` already queues mutations in `pendingMutations[]` with signalId, label, componentId, timestamp
- `wrapEffect()` already wraps effect functions for profiling timing
- Service worker already routes `trace:update` messages
- Tracer tab placeholder exists in `App.svelte`

## Bridge Side Changes (`runtime-inject.ts`)

### 1. Enhance `onMutation()`

Capture stack trace and old/new values at the mutation site:

```javascript
onMutation(signal) {
  const meta = signalMap.get(signal);
  if (!meta) return;
  const stack = new Error().stack || null;
  const oldValue = safeSerialize(signal.v); // value before set completes
  // ... existing pendingMutations queue ...
  // Add: stack, oldValue fields to mutation entry
  // Schedule trace emission via queueMicrotask
}
```

Note: `onMutation` is called AFTER `$.set` completes (value already changed), so we need to capture `oldValue` BEFORE set. This requires adjusting the transform for `$.set` to capture pre-mutation value.

### 2. Add MutationObserver

Observe DOM changes and correlate with signal mutations:

```javascript
const domMutationQueue = [];
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (domMutationQueue.length >= 500) break;
    domMutationQueue.push({
      type: m.type,
      targetTag: m.target.tagName?.toLowerCase() || '#text',
      targetId: m.target.id || null,
      targetClass: m.target.className || null,
      attributeName: m.attributeName || null,
      summary: summarizeDomMutation(m),
    });
  }
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
  attributeOldValue: true,
  characterDataOldValue: true,
});
```

### 3. Build Propagation Chain via `wrapEffect`

When an effect re-runs, inspect its dirty dependencies:

```javascript
// Inside wrapEffect's wrappedEffect():
// Before fn.apply, snapshot current deps values
// After fn.apply, compare to find which deps changed
// Build UpdateChainStep[] entries
```

### 4. Emit Traces via Microtask

After a mutation, use `queueMicrotask` to batch:

1. Collect pending mutations from this tick
2. Collect effect chain steps built during this tick
3. Drain DOM mutation queue
4. Build `UpdateTrace` and emit `trace:update`

## Panel Side (New Files)

### `tracer.svelte.ts` — Trace store

- Ring buffer of 200 `UpdateTrace` entries
- `processTraceMessage(msg)` — push to buffer, evict oldest
- `resetTracerState()` — clear buffer
- Selection state for expanded trace detail
- Accessor functions following existing pattern

### `UpdateTracer.svelte` — UI component

- Timeline list: each trace shows timestamp, root cause signal name, component name
- Expandable detail: root cause (with stack trace), propagation chain steps, DOM mutations
- Color coding: mutations red, derived blue, effects green, DOM changes gray
- Clear button to reset buffer

## Data Flow

```
$.set(count, 5)
  -> transform captures oldValue before set
  -> onMutation: capture stack, queue mutation, schedule microtask
  -> Svelte reactivity propagates: effects re-run
  -> wrapEffect: detect dirty deps, build chain steps
  -> MutationObserver: captures DOM changes
  -> queueMicrotask fires: correlate all, emit trace:update
  -> Panel: push to ring buffer, render in timeline
```

## Files Changed

| File                  | Action                                                                   |
| --------------------- | ------------------------------------------------------------------------ |
| `runtime-inject.ts`   | Enhance onMutation, add MutationObserver, chain building, trace emission |
| `transform.ts`        | Adjust $.set instrumentation to capture pre-mutation value               |
| `tracer.svelte.ts`    | Create: trace store with ring buffer                                     |
| `UpdateTracer.svelte` | Create: tracer UI component                                              |
| `main.ts` (panel)     | Wire processTraceMessage + resetTracerState                              |
| `App.svelte`          | Replace Tracer placeholder with UpdateTracer                             |
