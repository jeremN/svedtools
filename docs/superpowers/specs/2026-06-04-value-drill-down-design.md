# Lazy-expand value drill-down — design

**Date:** 2026-06-04
**Status:** Approved (pending written-spec review)
**Scope:** State inspector **and** Reactivity Graph, with expanded sub-trees that auto-refresh on mutation.

## Problem

Serialized component state is sent to the panel as a **shallow one-level preview** (`SerializedValue` markers — `{__type:'object', preview, childCount}` etc.). Nested objects/arrays render as a single preview string with no way to drill in. The serializer types already carry optional `childCount`/`path` fields and `shared/src/serialization.ts` has a half-wired `serializeAtPath`, but nothing wires it to a UI, and the page-context bridge (the actual producer of live state) has no path-navigation entry point. This feature finishes that drill-down.

## Approach

**Truly lazy, request-per-expansion.** Live values live in the page (the bridge); the panel holds only previews. So the panel cannot expand locally — it requests children for a specific `(rootId, path)` and the bridge navigates the **live** value and serializes one level back.

**One mechanism, two views.** Both views reference the _same_ bridge-tracked reactive ids: a source signal's id is identical in the State snapshot (`signalMap` meta id) and in the graph (`buildGraph` uses that same id for source nodes). Deriveds in the graph use reaction ids. So a single `rootId`-keyed expand mechanism serves both the State inspector and the Reactivity Graph. Effect nodes carry no value → not expandable.

This is the design the existing scaffolding (`SerializedObject.path`, `SerializeOptions.basePath`, `serializeAtPath`) was built for.

## Trust / safety

- The bridge `state:expand` handler reuses the existing listener's 3-layer validation (`event.origin === location.origin`, `event.source === window`, `data.source === 'svelte-devtools-pro'`).
- `serializeChildrenAtPath` wraps every property read in try/catch so a hostile getter degrades to a `truncated` marker instead of throwing (matches the existing serializer posture).
- Output remains descriptive-only (strings + markers); no live objects cross the wire, no re-hydration in the panel.

## Components & data flow

```
StateInspector ─┐                              ┌─ signalMap (live .v)
                ├─ ValueTree ─ expansion store ─ state:expand ─▶ bridge ─ resolve rootId ─┤
Graph detail ───┘   (panel)        │            ◀─ state:expanded ─        navigate path  └─ idToReaction (derived .v)
                                   └─ childrenCache / openKeys              serialize 1 level
```

### 1. Protocol — `shared/src/protocol.ts`

```ts
// panel → bridge
export interface StateExpandRequest {
  type: 'state:expand';
  rootId: NodeId; // any bridge-tracked signal/derived id (shared across both views)
  path: string[]; // keys/indices from the root value to the node being opened
}

// bridge → panel
export interface StateExpandedMessage {
  type: 'state:expanded';
  rootId: NodeId;
  path: string[];
  children: Record<string, SerializedValue> | null; // null = unresolvable root / invalid path / error
}
```

- Add to `PanelToBridgeMessage` / `BridgeToPanelMessage` unions and to `VALID_MESSAGE_TYPES`.
- **Add to `extension/src/service-worker-utils.ts`**: `state:expand` → `VALID_PANEL_TYPES`, `state:expanded` → `VALID_BRIDGE_TYPES`. (The service worker drops unknown types — easy to forget.)
- The panel constructs `path` from the tree structure (parent path + child key); children are returned keyed by key with no embedded paths.

### 2. Bridge — `vite-plugin/src/bridge/serializer.ts`

Add `serializeChildrenAtPath(root: unknown, path: string[]): Record<string, SerializedValue> | null`:

- Navigate `root` along `path`, calling `Compat.unwrapStateProxy` at each object level (so live Svelte `$state` proxies unwrap). Array indices via `Number(key)` with bounds checks.
- At the target, return one level of children keyed by key, each via `safeSerialize(child)` (shallow preview — drilling deeper triggers another request).
- Return `null` if the path is invalid / navigation hits a non-object.
- Every property read in try/catch → a `{__type:'truncated'}` child rather than a throw.
- Mirrors shared's `serializeAtPath` but uses the bridge's `Compat` unwrap + `safeSerialize` (the bridge intentionally does not import `shared`).

### 3. Bridge — `vite-plugin/src/bridge/main.ts`

- Reverse lookups: `idToSignal: Map<NodeId, Value>` maintained in `registerSignal`; `idToReaction: Map<NodeId, Reaction>` maintained wherever graph/chain ids are minted (`buildGraph`, `buildChainFromSignal`, `stableReactionIds`).
- `resolveLiveValue(rootId): { ok: boolean; value: unknown }`: try `idToSignal` → `Compat.getValue(signal)`; else `idToReaction` → derived → `Compat.getDerivedValue(reaction)`; else not found.
- `state:expand` case in the message listener: `resolveLiveValue(rootId)` → `serializeChildrenAtPath(value, path)` → `emit({ type:'state:expanded', rootId, path, children })` (children `null` when unresolved).

### 4. Panel — store `extension/src/panel/lib/expansion.svelte.ts` (new, focused unit)

- State: `openKeys: Set<string>`; `cache: Record<string, { status: 'loading'|'ready'|'error'; children?: Record<string, SerializedValue> }>`. Key = `` `${rootId}\u0000${path.join('\u0000')}` `` joined by the NUL character `\u0000`, which cannot appear in a property name, so cache keys never collide regardless of dotted/spaced keys.
- Actions:
  - `toggle(rootId, path)`: if closed → add to `openKeys`, set `loading`, `connection.send({type:'state:expand', rootId, path})`; if open → remove from `openKeys` and drop its cache entry.
  - `applyExpanded(msg)`: write `children`/status `ready` (or `error` when `children === null`).
  - `refreshAllOpen()`: re-send `state:expand` for every entry in `openKeys` (used on mutation).
  - `reset()`: clear all (called on component/node re-selection and on the connection `disconnect` reset listeners already wired in `main.ts`).
- Accessors: `isOpen(rootId, path)`, `entry(rootId, path)`.

### 5. Panel — reusable `components/ValueTree.svelte` (new)

- Props: `rootId: NodeId`, `value: SerializedValue`, internal `path: string[] = []`.
- Renders a `SerializedValue` (absorbs the current `valueDisplay` logic from `StateInspector`). For `object`/`array` with `childCount`/`length > 0`, render a ▶/▼ toggle bound to `expansion.toggle(rootId, path)`.
- When open: read `expansion.entry(rootId, path)`; show a `loading…` row, an `error` row, or recurse — for each child key render `<ValueTree {rootId} value={child} path={[...path, key]} />`.
- Pure presentational + store calls; no message logic of its own.

### 6. Panel — view integrations

- `StateInspector.svelte`: replace the inline `valueDisplay` snippet with `<ValueTree rootId={signal.id} value={signal.value} />` per signal row. On `selectComponent` change → `expansion.reset()`.
- `ReactivityGraph.svelte`: add a **selected-node detail panel** (bottom strip or side panel) shown when `selectedNodeId` is set; for `source`/`derived` nodes host `<ValueTree rootId={node.id} value={node.value} />`. The existing hover tooltip stays for quick peeks. On `selectGraphNode` change → reset that root's expansions.

### 7. Auto-refresh & invalidation (live trees)

- Trigger: on `component:updated` for the selected component, and on graph refresh/update, call `expansion.refreshAllOpen()` **debounced ~50ms** (coalesce mutation bursts). Open-path count is bounded by what the user manually expanded, so re-requesting all open paths is cheap and uniform across both views.
- **Top-level liveness (included):** on the same debounced trigger, re-send `inspect:component` for the selected component so the root previews refresh too (otherwise children update but the root preview goes stale). The graph's top-level node values refresh via its existing `graph:request` path.
- Invalidation: re-selection and `disconnect` reset listeners call `expansion.reset()`. Cache entries are dropped on collapse to bound memory.

## Testing

- `vite-plugin` (`serializer.test.ts`): `serializeChildrenAtPath` — nested object, nested array, Map navigation, out-of-bounds index, invalid path → `null`, hostile getter → `truncated` (no throw).
- `vite-plugin`: bridge `resolveLiveValue` via a small pure helper where feasible; the `state:expand` listener wiring gets lighter coverage, consistent with existing bridge code.
- `extension`: no unit harness (typecheck + e2e). Add a `playground` fixture component with a nested-object `$state` and a `Map`, so the e2e/demo exercises expand + live-refresh in a real browser.
- All existing gates stay green: `pnpm check`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `prettier --check`.

## Implementation units (one plan step each)

1. Protocol additions + service-worker allowlists.
2. Bridge `serializeChildrenAtPath` + unit tests.
3. Bridge reverse lookups + `resolveLiveValue` + `state:expand` handler.
4. `expansion.svelte.ts` store.
5. `ValueTree.svelte` (extract preview rendering from StateInspector).
6. StateInspector integration.
7. Graph selected-node detail panel + integration.
8. Auto-refresh wiring + debounce + top-level re-inspect.
9. Playground nested-state fixture + e2e assertion.

## Non-goals (this iteration)

- Editing values (`state:edit` exists in the protocol but stays unimplemented).
- Drill-down in the Update Tracer (old/new values are historical snapshots — no live root to navigate; would need eager-deeper serialization instead).
- Bridge-push subscriptions (the panel pulls open paths on change; the bridge stays stateless beyond the reverse-lookup maps).
