# Value Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users expand nested objects/arrays in the State inspector and Reactivity Graph by lazily fetching children from the page, with expanded sub-trees that refresh live on mutation.

**Architecture:** The panel holds only shallow previews; live values live in the page bridge. The panel requests children for a `(rootId, path)` via a new `state:expand` message; the bridge navigates the live value and returns one level via `state:expanded`. Both views key off the same bridge-tracked reactive ids, so one mechanism (`expansion.svelte.ts` store + reusable `ValueTree.svelte`) serves both.

**Tech Stack:** TypeScript, Svelte 5 runes, Vite plugin (acorn/magic-string transform + page bridge), Chrome MV3 extension, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-04-value-drill-down-design.md`

**Verification note:** `packages/extension` has **no unit-test harness** (no vitest/Svelte-runtime setup — confirmed). By the approved spec, extension code (Tasks 4–8) is verified by `svelte-check` + manual real-browser checks (Task 9), not unit tests. Tasks 1–2 are TDD with Vitest. Run all commands from the repo root `/Users/jeremienehlil/Documents/Code/Personal/svedtools`.

---

## Task 1: Protocol messages + service-worker allowlists

**Files:**

- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/extension/src/service-worker-utils.ts`
- Test: `packages/shared/src/protocol.test.ts`

- [ ] **Step 1: Write failing tests** — append to `packages/shared/src/protocol.test.ts`:

```ts
import { isDevToolsMessage } from './protocol.js';

describe('isDevToolsMessage — state:expand drill-down', () => {
  it('accepts a state:expand request envelope', () => {
    const wire = {
      source: 'svelte-devtools-pro',
      payload: { type: 'state:expand', rootId: 'sdt-1', path: ['a', '0'] },
    };
    expect(isDevToolsMessage(wire)).toBe(true);
  });
  it('accepts a state:expanded response envelope', () => {
    const wire = {
      source: 'svelte-devtools-pro',
      payload: { type: 'state:expanded', rootId: 'sdt-1', path: [], children: {} },
    };
    expect(isDevToolsMessage(wire)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @svelte-devtools/shared test`
Expected: FAIL — `state:expand`/`state:expanded` not in `VALID_MESSAGE_TYPES`.

- [ ] **Step 3: Add the interfaces and wire them in** — in `packages/shared/src/protocol.ts`:

Add the request interface after `StateEditRequest` (around line 115):

```ts
export interface StateExpandRequest {
  type: 'state:expand';
  /** Any bridge-tracked signal/derived id (shared between the State snapshot and the graph). */
  rootId: NodeId;
  /** Keys/indices from the root value down to the node being opened. */
  path: string[];
}
```

Add the response interface after `StateSnapshotMessage` (around line 40):

```ts
export interface StateExpandedMessage {
  type: 'state:expanded';
  rootId: NodeId;
  path: string[];
  /** One level of children keyed by key/index; null when the root/path can't be resolved. */
  children: Record<string, SerializedValue> | null;
}
```

Add `StateExpandedMessage` to the `BridgeToPanelMessage` union and `StateExpandRequest` to the `PanelToBridgeMessage` union. Add both discriminants to `VALID_MESSAGE_TYPES`:

```ts
  'state:expand',
  'state:expanded',
```

- [ ] **Step 4: Add to the service-worker allowlists** — in `packages/extension/src/service-worker-utils.ts`, add `'state:expanded'` to `VALID_BRIDGE_TYPES` and `'state:expand'` to `VALID_PANEL_TYPES`.

- [ ] **Step 5: Run — expect PASS + typecheck**

Run: `pnpm --filter @svelte-devtools/shared test && pnpm --filter @svelte-devtools/shared check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts packages/extension/src/service-worker-utils.ts
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(shared): add state:expand/state:expanded drill-down protocol"
```

---

## Task 2: Bridge `serializeChildrenAtPath` (page-context path navigation)

**Files:**

- Modify: `packages/vite-plugin/src/bridge/serializer.ts`
- Test: `packages/vite-plugin/src/bridge/serializer.test.ts`

- [ ] **Step 1: Write failing tests** — append to `packages/vite-plugin/src/bridge/serializer.test.ts`:

```ts
import { serializeChildrenAtPath } from './serializer.js';

describe('serializeChildrenAtPath', () => {
  it('returns one level of object children keyed by key', () => {
    const out = serializeChildrenAtPath({ a: { b: 1 }, c: 2 }, []) as Record<string, { __type?: string }>;
    expect(Object.keys(out)).toEqual(['a', 'c']);
    expect(out.c).toBe(2);
    expect(out.a.__type).toBe('object');
  });
  it('navigates into a nested object path', () => {
    const out = serializeChildrenAtPath({ a: { b: { x: 1 } } }, ['a', 'b']) as Record<string, unknown>;
    expect(out).toEqual({ x: 1 });
  });
  it('navigates into an array index', () => {
    const out = serializeChildrenAtPath({ list: [{ v: 1 }, { v: 2 }] }, ['list', '1']) as Record<string, unknown>;
    expect(out).toEqual({ v: 2 });
  });
  it('navigates into a Map by key and lists Map entries', () => {
    const m = new Map<string, unknown>([['k', { n: 1 }]]);
    expect(serializeChildrenAtPath(m, [])).toHaveProperty('k');
    expect(serializeChildrenAtPath(m, ['k'])).toEqual({ n: 1 });
  });
  it('returns null for an out-of-bounds index or invalid path', () => {
    expect(serializeChildrenAtPath({ list: [1] }, ['list', '5'])).toBeNull();
    expect(serializeChildrenAtPath({ a: 1 }, ['a', 'b'])).toBeNull(); // a is a primitive
  });
  it('does not throw on a hostile getter — yields a truncated child', () => {
    const obj = {
      get boom() {
        throw new Error('no');
      },
      ok: 1,
    };
    const out = serializeChildrenAtPath(obj, []) as Record<string, { __type?: string }>;
    expect(out.ok).toBe(1);
    expect(out.boom.__type).toBe('truncated');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter vite-plugin-svelte-devtools test`
Expected: FAIL — `serializeChildrenAtPath` is not exported.

- [ ] **Step 3: Implement** — in `packages/vite-plugin/src/bridge/serializer.ts`, add a constant near the other limits and the function (it uses the existing `Compat` import and `safeSerialize`):

```ts
const MAX_CHILDREN = 100;

/**
 * Navigate a LIVE value along `path` and serialize one level of children.
 * Used by the bridge's state:expand handler for lazy drill-down. Unwraps Svelte
 * state proxies at each step via Compat. Returns null when the path can't be
 * navigated; a throwing getter degrades to a `truncated` child rather than
 * aborting the whole expansion.
 */
export function serializeChildrenAtPath(root: unknown, path: string[]): Record<string, unknown> | null {
  let current: unknown = root;

  for (const key of path) {
    if (current === null || typeof current !== 'object') return null;
    const container = Compat.unwrapStateProxy(current as object);
    try {
      if (Array.isArray(container)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= container.length) return null;
        current = container[idx];
      } else if (container instanceof Map) {
        if (!container.has(key)) return null;
        current = container.get(key);
      } else if (container instanceof Set) {
        const idx = Number(key);
        const items = Array.from(container);
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return null;
        current = items[idx];
      } else {
        current = (container as Record<string, unknown>)[key];
      }
    } catch {
      return null;
    }
  }

  if (current === null || typeof current !== 'object') return null;
  const container = Compat.unwrapStateProxy(current as object);
  const result: Record<string, unknown> = {};
  const truncated = { __type: 'truncated', reason: 'getter threw' };

  if (Array.isArray(container)) {
    for (let i = 0; i < Math.min(container.length, MAX_CHILDREN); i++) {
      try {
        result[String(i)] = safeSerialize(container[i]);
      } catch {
        result[String(i)] = truncated;
      }
    }
    return result;
  }
  if (container instanceof Map) {
    let i = 0;
    for (const [k, v] of container) {
      if (i++ >= MAX_CHILDREN) break;
      try {
        result[String(k)] = safeSerialize(v);
      } catch {
        result[String(k)] = truncated;
      }
    }
    return result;
  }
  if (container instanceof Set) {
    let i = 0;
    for (const v of container) {
      if (i >= MAX_CHILDREN) break;
      try {
        result[String(i)] = safeSerialize(v);
      } catch {
        result[String(i)] = truncated;
      }
      i++;
    }
    return result;
  }
  let keys: string[];
  try {
    keys = Object.keys(container as object);
  } catch {
    return null;
  }
  for (const k of keys.slice(0, MAX_CHILDREN)) {
    try {
      result[k] = safeSerialize((container as Record<string, unknown>)[k]);
    } catch {
      result[k] = truncated;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run — expect PASS + typecheck**

Run: `pnpm --filter vite-plugin-svelte-devtools test && pnpm --filter vite-plugin-svelte-devtools check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/bridge/serializer.ts packages/vite-plugin/src/bridge/serializer.test.ts
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(vite-plugin): add serializeChildrenAtPath for lazy drill-down"
```

---

## Task 3: Bridge — id resolver + `state:expand` handler

**Files:**

- Modify: `packages/vite-plugin/src/bridge/main.ts`

No unit test (the bridge is a page-context IIFE with no harness; covered by Task 2's serializer tests and Task 9's manual verification). Verification is `tsc` + the build.

- [ ] **Step 1: Import the navigator** — in `main.ts`, extend the serializer import:

```ts
import { safeSerialize, summarizeDomMutation, serializeChildrenAtPath } from './serializer.js';
```

- [ ] **Step 2: Add reverse-lookup maps** — next to `const signalMap = ...` / `const stableReactionIds = ...` (around lines 61–63):

```ts
const idToSignal = new Map<string, Value>();
const idToReaction = new Map<string, Reaction>();
```

- [ ] **Step 3: Populate `idToSignal` in `registerSignal`** — in `registerSignal`, right after `signalMap.set(signal, { ... })` (around line 248), add:

```ts
idToSignal.set(id, signal);
```

- [ ] **Step 4: Centralize reaction-id minting** — add a helper near `buildGraph` so both `buildGraph` and `buildChainFromSignal` register reaction ids. Add:

```ts
function getStableReactionId(reaction: Reaction): string {
  let rid = stableReactionIds.get(reaction);
  if (!rid) {
    rid = genId();
    stableReactionIds.set(reaction, rid);
  }
  idToReaction.set(rid, reaction);
  return rid;
}
```

Then in `buildGraph` replace the inline mint (lines ~413–417):

```ts
const reactionId = getStableReactionId(reaction);
```

…and in `buildChainFromSignal` replace the inline mint (lines ~530–534):

```ts
const reactionSignalId = getStableReactionId(r);
```

(Remove the now-redundant `let rid = stableReactionIds.get(...) ... stableReactionIds.set(...)` blocks at both sites.)

- [ ] **Step 5: Add `resolveLiveValue`** — add near `buildGraph`:

```ts
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
  const reaction = idToReaction.get(rootId);
  if (reaction && Compat.isDerived(reaction)) {
    try {
      return { ok: true, value: Compat.getDerivedValue(reaction) };
    } catch {
      return { ok: false, value: null };
    }
  }
  return { ok: false, value: null };
}
```

- [ ] **Step 6: Handle `state:expand`** — add a case to the `switch (msg.type)` in the postMessage listener (after the `highlight:component` case, around line 651):

```ts
      case 'state:expand': {
        const rootId = msg.rootId;
        const path = Array.isArray(msg.path) ? msg.path : [];
        const resolved = resolveLiveValue(rootId);
        const children = resolved.ok ? serializeChildrenAtPath(resolved.value, path) : null;
        emit({ type: 'state:expanded', rootId, path, children });
        break;
      }
```

- [ ] **Step 7: Verify typecheck + build**

Run: `pnpm --filter vite-plugin-svelte-devtools check && pnpm --filter vite-plugin-svelte-devtools build`
Expected: no type errors; build succeeds (the build bundles the bridge).

- [ ] **Step 8: Commit**

```bash
git add packages/vite-plugin/src/bridge/main.ts
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(vite-plugin): resolve rootId to live value and handle state:expand"
```

---

## Task 4: Panel expansion store

**Files:**

- Create: `packages/extension/src/panel/lib/expansion.svelte.ts`

Verification: `svelte-check` + Task 9. No unit test (no extension harness).

- [ ] **Step 1: Create the store** — `packages/extension/src/panel/lib/expansion.svelte.ts`:

```ts
import type { BridgeToPanelMessage, NodeId, SerializedValue } from '@svelte-devtools/shared';
import { send } from './connection.svelte.js';

const REFRESH_DEBOUNCE_MS = 50;

type Entry = { status: 'loading' | 'ready' | 'error'; children?: Record<string, SerializedValue> };

// key = rootId + NUL + path joined by NUL (NUL can't occur in a property name)
function key(rootId: NodeId, path: string[]): string {
  return [rootId, ...path].join('\u0000');
}

let cache: Record<string, Entry> = $state({});
// openKeys mirrors which (rootId,path) are expanded. Plain Set is fine — reads go through cache.
const openKeys = new Set<string>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function isOpen(rootId: NodeId, path: string[]): boolean {
  return openKeys.has(key(rootId, path));
}

export function entry(rootId: NodeId, path: string[]): Entry | undefined {
  return cache[key(rootId, path)];
}

export function toggle(rootId: NodeId, path: string[]): void {
  const k = key(rootId, path);
  if (openKeys.has(k)) {
    openKeys.delete(k);
    const next = { ...cache };
    delete next[k];
    cache = next;
    return;
  }
  openKeys.add(k);
  cache = { ...cache, [k]: { status: 'loading' } };
  send({ type: 'state:expand', rootId, path });
}

export function processExpansionMessage(message: BridgeToPanelMessage): void {
  if (message.type !== 'state:expanded') return;
  const k = key(message.rootId, message.path);
  if (!openKeys.has(k)) return; // collapsed before the reply arrived
  cache = {
    ...cache,
    [k]: message.children === null ? { status: 'error' } : { status: 'ready', children: message.children },
  };
}

export function refreshAllOpen(): void {
  for (const k of openKeys) {
    const [rootId, ...path] = k.split('\u0000');
    send({ type: 'state:expand', rootId, path });
  }
}

/** Debounced live refresh: re-inspect the selected component (top-level) + re-fetch open paths. */
export function scheduleLiveRefresh(selectedComponentId: NodeId | null): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (selectedComponentId) send({ type: 'inspect:component', id: selectedComponentId });
    refreshAllOpen();
  }, REFRESH_DEBOUNCE_MS);
}

export function resetExpansion(): void {
  openKeys.clear();
  cache = {};
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @svelte-devtools/extension check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/panel/lib/expansion.svelte.ts
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(extension): add expansion store for lazy value drill-down"
```

---

## Task 5: Reusable `ValueTree.svelte`

**Files:**

- Create: `packages/extension/src/panel/components/ValueTree.svelte`

- [ ] **Step 1: Create the component** (recursive via a self-referencing snippet + nested `<ValueTree>` for children):

```svelte
<script lang="ts">
  import type { SerializedValue, SerializedObject, SerializedArray, NodeId } from '@svelte-devtools/shared';
  import { isOpen, entry, toggle } from '../lib/expansion.svelte.js';
  import Self from './ValueTree.svelte';

  let { rootId, value, path = [] }: { rootId: NodeId; value: SerializedValue; path?: string[] } = $props();

  let open = $derived(isOpen(rootId, path));
  let loaded = $derived(entry(rootId, path));

  function isComplex(v: SerializedValue): v is Exclude<SerializedValue, string | number | boolean | null | undefined> {
    return typeof v === 'object' && v !== null && '__type' in v;
  }
  function expandable(v: SerializedValue): boolean {
    if (!isComplex(v)) return false;
    if (v.__type === 'object') return (v.childCount ?? 0) > 0;
    if (v.__type === 'array') return v.length > 0;
    return false;
  }
  function preview(v: SerializedValue): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v.__type === 'object') return (v as SerializedObject).preview;
    if (v.__type === 'array') return `Array(${(v as SerializedArray).length})`;
    if (v.__type === 'dom') return `<${v.tag}${v.id ? '#' + v.id : ''}>`;
    if (v.__type === 'circular') return '[Circular]';
    if (v.__type === 'truncated') return v.reason;
    return '';
  }
</script>

<span class="vt">
  {#if expandable(value)}
    <button class="vt-toggle" onclick={() => toggle(rootId, path)} aria-expanded={open}>
      {open ? '▼' : '▶'}
    </button>
  {:else}
    <span class="vt-spacer"></span>
  {/if}
  <span class="vt-preview" class:vt-complex={isComplex(value)}>{preview(value)}</span>

  {#if open}
    <div class="vt-children">
      {#if !loaded || loaded.status === 'loading'}
        <span class="vt-meta">loading…</span>
      {:else if loaded.status === 'error'}
        <span class="vt-meta vt-error">unavailable</span>
      {:else}
        {#each Object.entries(loaded.children ?? {}) as [k, child] (k)}
          <div class="vt-child">
            <span class="vt-key">{k}:</span>
            <Self {rootId} value={child} path={[...path, k]} />
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</span>

<style>
  .vt {
    font-family: monospace;
    font-size: 12px;
  }
  .vt-toggle {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 9px;
    padding: 0 2px;
    width: 14px;
  }
  .vt-spacer {
    display: inline-block;
    width: 14px;
  }
  .vt-preview {
    color: #ccc;
  }
  .vt-complex {
    color: #9cc;
  }
  .vt-children {
    margin-left: 14px;
    border-left: 1px solid #2a2a2a;
    padding-left: 6px;
  }
  .vt-child {
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .vt-key {
    color: #c586c0;
    flex-shrink: 0;
  }
  .vt-meta {
    color: #666;
    font-style: italic;
  }
  .vt-error {
    color: #ce9178;
  }
</style>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @svelte-devtools/extension check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/panel/components/ValueTree.svelte
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(extension): add reusable ValueTree drill-down component"
```

---

## Task 6: Wire `ValueTree` into the State inspector

**Files:**

- Modify: `packages/extension/src/panel/components/StateInspector.svelte`

- [ ] **Step 1: Replace the inline value display** — in `StateInspector.svelte`:
  1. Add import: `import ValueTree from './ValueTree.svelte';` and `import { resetExpansion } from '../lib/expansion.svelte.js';`
  2. Remove the `{#snippet valueDisplay(...)}…{/snippet}` block and the `isSerializedComplex`/`formatDomNode` helpers (now inside `ValueTree`).
  3. Replace the signal value cell:

```svelte
<span class="signal-value">
  <ValueTree rootId={signal.id} value={signal.value} />
</span>
```

4. Reset expansion when the selected component changes (add after the existing `$derived`s):

```svelte
  $effect(() => {
    selectedId; // track
    resetExpansion();
  });
```

- [ ] **Step 2: Relax the truncating value styles** — the existing `.signal-value` uses `white-space: nowrap; overflow: hidden`. Change it to allow the tree to wrap/expand: drop `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, and `max-width: 60%` on `.signal-value`, and set `.signal-row { align-items: flex-start; }` so multi-line trees align top.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @svelte-devtools/extension check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/extension/src/panel/components/StateInspector.svelte
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(extension): drill into nested state in the inspector"
```

---

## Task 7: Reactivity-graph selected-node detail panel

**Files:**

- Modify: `packages/extension/src/panel/components/ReactivityGraph.svelte`

- [ ] **Step 1: Add a detail panel that hosts `ValueTree`** — in `ReactivityGraph.svelte`:
  1. Imports: `import ValueTree from './ValueTree.svelte';` and `import { resetExpansion } from '../lib/expansion.svelte.js';`
  2. Derive the selected node and reset expansion when selection changes:

```svelte
  let selectedNode = $derived(simNodes.find((n) => n.id === selectedNodeId) ?? null);
  $effect(() => {
    selectedNodeId; // track
    resetExpansion();
  });
```

3. Add the panel markup just before the closing `</div>` of `.reactivity-graph` (after the tooltip block):

```svelte
{#if selectedNode && selectedNode.value !== null && selectedNode.value !== undefined}
  <div class="detail-panel">
    <div class="detail-header">
      <span class="detail-label">{selectedNode.label ?? selectedNode.type}</span>
      <span class="detail-type">{selectedNode.type}</span>
    </div>
    <div class="detail-value">
      <ValueTree rootId={selectedNode.id} value={selectedNode.value} />
    </div>
  </div>
{/if}
```

4. Add styles:

```svelte
  .detail-panel {
    position: absolute; right: 8px; bottom: 8px; max-width: 320px; max-height: 50%;
    overflow: auto; background: #222; border: 1px solid #444; border-radius: 4px;
    padding: 8px; z-index: 50;
  }
  .detail-header { display: flex; gap: 8px; align-items: baseline; margin-bottom: 6px; }
  .detail-label { font-weight: bold; color: #fff; font-family: monospace; }
  .detail-type { color: #888; font-size: 11px; font-family: monospace; }
```

Note: `derived` nodes resolve in the bridge via `Compat.getDerivedValue`; `effect` nodes have `value === null` so the panel is hidden for them — correct.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @svelte-devtools/extension check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/panel/components/ReactivityGraph.svelte
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(extension): expandable value panel for selected graph node"
```

---

## Task 8: Auto-refresh wiring (live trees + top-level)

**Files:**

- Modify: `packages/extension/src/panel/main.ts`

- [ ] **Step 1: Register the expansion store + auto-refresh subscriber** — update `main.ts`:

```ts
import { connect, onMessage, onDisconnect } from './lib/connection.svelte.js';
import { processMessage, resetState, getSelectedId } from './lib/components.svelte.js';
import { processGraphMessage, resetGraphState } from './lib/graph.svelte.js';
import { processProfilerMessage, resetProfilerState } from './lib/profiler.svelte.js';
import { processTraceMessage, resetTracerState } from './lib/tracer.svelte.js';
import { processExpansionMessage, scheduleLiveRefresh, resetExpansion } from './lib/expansion.svelte.js';

// Route incoming messages to stores
onMessage(processMessage);
onMessage(processGraphMessage);
onMessage(processProfilerMessage);
onMessage(processTraceMessage);
onMessage(processExpansionMessage);

// Live drill-down: when the inspected component or the graph changes, debounce a
// refresh of the selected component snapshot + all open sub-trees.
onMessage((m) => {
  if (
    (m.type === 'component:updated' && m.id === getSelectedId()) ||
    m.type === 'graph:update' ||
    m.type === 'graph:snapshot'
  ) {
    scheduleLiveRefresh(getSelectedId());
  }
});

// Reset state on disconnect (prevents stale data on reconnect)
onDisconnect(resetState);
onDisconnect(resetGraphState);
onDisconnect(resetProfilerState);
onDisconnect(resetTracerState);
onDisconnect(resetExpansion);
```

(`getSelectedId` is already exported from `components.svelte.ts`.)

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @svelte-devtools/extension check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/extension/src/panel/main.ts
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "feat(extension): live-refresh open drill-down paths on mutation"
```

---

## Task 9: Playground fixture + manual real-browser verification

**Files:**

- Create: `playground/src/lib/NestedState.svelte`
- Modify: a playground route/page to mount it (match the existing demo-page pattern — inspect `playground/src` to find how demo pages are registered, e.g. a routes list or `App.svelte`).

The extension panel can't be driven by the existing Playwright harness (it tests playground runtime pages, not the devtools panel). So Task 9 ships a fixture and a manual checklist (matches the project norm that CI-green ≠ feature-works).

- [ ] **Step 1: Create a nested-state fixture** — `playground/src/lib/NestedState.svelte`:

```svelte
<script lang="ts">
  let user = $state({
    name: 'Ada',
    address: { city: 'London', geo: { lat: 51.5, lng: -0.1 } },
    tags: ['admin', 'beta'],
  });
  let scores = $state(
    new Map<string, number>([
      ['math', 90],
      ['art', 75],
    ]),
  );

  function mutate() {
    user.address.geo.lat = Math.round((user.address.geo.lat + 0.1) * 10) / 10;
    scores.set('math', (scores.get('math') ?? 0) + 1);
  }
</script>

<section>
  <h2>Nested state</h2>
  <button onclick={mutate}>Mutate nested</button>
  <pre>{JSON.stringify(user)}</pre>
</section>
```

- [ ] **Step 2: Register the fixture on a demo page** — open `playground/src` and add `NestedState` to the demo list/page the same way the existing demos are wired (follow the pattern already present; do not invent a new routing system).

- [ ] **Step 3: Verify it builds and the page renders**

Run: `pnpm --filter playground build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification (real browser)** — rebuild the extension and exercise the feature:

```bash
pnpm --filter @svelte-devtools/extension build
pnpm --filter playground dev   # serves on :5173
node scripts/launch-extension-demo.mjs   # isolated Chrome with the extension preloaded
```

Confirm, with DevTools → the panel open on the Nested state page:

- [ ] State inspector shows `user` as an expandable object; clicking ▶ fetches and shows `name/address/tags`; expanding `address` → `geo` → `lat/lng` works (each level lazily loads).
- [ ] `scores` shows `Map(2)` and expands to `math/art`.
- [ ] Clicking "Mutate nested" updates the open `geo.lat` and `scores.math` **without collapsing** (live refresh), and the top-level `user`/`scores` previews update too.
- [ ] In the Reactivity Graph, selecting the `user`/`scores` source node shows the detail panel with the same expandable tree.
- [ ] Collapsing a node and re-expanding re-fetches; selecting a different component resets expansion.

- [ ] **Step 5: Run the full gate suite**

Run: `pnpm check && pnpm test && pnpm test:integration && pnpm format`
Expected: all green; `prettier --check` clean (run `pnpm format` to fix, then re-stage).

- [ ] **Step 6: Commit**

```bash
git add playground/
GIT_COMMITTER_NAME='Jérémie Néhlil' GIT_COMMITTER_EMAIL='jeremne@gmail.com' git commit --author='Jérémie Néhlil <jeremne@gmail.com>' -m "test(playground): nested-state fixture for drill-down verification"
```

---

## Final verification

- [ ] `pnpm check` — all packages typecheck.
- [ ] `pnpm test` + `pnpm test:integration` — unit + integration green.
- [ ] `pnpm lint` + `npx prettier --check .` — clean.
- [ ] Manual checklist in Task 9 Step 4 all ticked.
- [ ] Open a PR (base `main`) summarizing the six commits and linking the spec.
