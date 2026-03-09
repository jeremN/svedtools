# Svelte DevTools Pro — Implementation Plan

## Context

Svelte 5's DevTools story is fundamentally broken. The old `SvelteRegisterComponent` event system was removed and nothing has replaced it ([sveltejs/svelte#11389](https://github.com/sveltejs/svelte/issues/11389)). The official extension doesn't work with Svelte 5 ([sveltejs/svelte-devtools#193](https://github.com/sveltejs/svelte-devtools/issues/193)). Community tools (Sveltick, Svisualize, Svelcro) are either dormant, Svelte 4-only, or don't hook into Svelte internals at all.

We're building a **complete Svelte 5 DevTools suite** — a new standalone project with two parts:
1. **Vite plugin** — compile-time instrumentation injected after `vite-plugin-svelte`
2. **Chrome extension** — DevTools panel built with Svelte 5 (dogfooding)

Dev-mode only (prod support deferred).

---

## Progress

| Phase | Status | Branch |
|-------|--------|--------|
| Phase 1: Scaffolding & Shared Infrastructure | **Complete** | `feat/phase-1-scaffolding` |
| Phase 2: Vite Plugin Core | **Complete** | `feat/phase-1-scaffolding` |
| Phase 3: Extension Shell | **Complete** | `feat/phase-1-scaffolding` |
| Phase 4: Component Tree + State Inspection | **Complete** | `feat/phase-1-scaffolding` |
| Phase 5: Reactivity Graph Visualization | **Complete** | `feat/phase-1-scaffolding` |
| Phase 6: Performance Profiler | **Complete** | `feat/phase-1-scaffolding` |
| Phase 7: "Why Did This Update?" Tracing | **Complete** | `feat/phase-1-scaffolding` |

---

## Landscape Analysis

### What Exists Today (and why it's insufficient)

| Tool | Type | Svelte 5? | Hooks into internals? | Status |
|------|------|-----------|----------------------|--------|
| [svelte-devtools](https://github.com/sveltejs/svelte-devtools) | Browser extension | No — broken | Yes (Svelte 4 events) | Official, stalled |
| [Sveltick](https://github.com/Adam014/sveltick) | npm library | Works (framework-agnostic) | No — pure Web Vitals | Active but limited |
| [Svisualize](https://github.com/oslabs-beta/Svisualize) | VS Code extension | No — misses `$props()` | No — static file parser | Dormant ~2 years |
| [Svelcro](https://github.com/oslabs-beta/Svelcro) | Browser extension | No — Svelte 4 only | Yes (old event system) | Pre-Svelte 5 |
| [svelte-grab](https://github.com/HeiCg/svelte-grab) | Runtime library | Yes | Partially (`__svelte_meta` + MutationObserver) | Active |
| [svelte-runes-devtools](https://github.com/unlocomqx/svelte-runes-devtools) | Redux DevTools bridge | Yes (via `$inspect`) | Via `$inspect().with()` only | Active but narrow |

**Key insight**: No tool provides component tree inspection, reactivity graph visualization, performance profiling, OR update tracing for Svelte 5.

---

## Svelte 5 Instrumentation Surface

What we can hook into (dev mode only):

| Surface | Access Method | What It Provides |
|---------|--------------|-------------------|
| `$.push(props, runes, fn)` / `$.pop()` | Vite post-transform | Component boundary markers — tree building + render timing |
| `__svelte_meta` on DOM elements | DOM traversal | Source location (file, line, column, parent hierarchy) |
| `Value.reactions[]` / `Reaction.deps[]` | Runtime graph walk | Bidirectional reactive dependency graph |
| Dev fields: `label`, `created`, `updated`, `trace` | Signal metadata | Signal names + creation/mutation stack traces |
| `Effect.ctx`, `Effect.deps`, `Effect.component_function` | Effect internals | Effect-to-component mapping + dependency tracking |
| `tag()` / `trace()` from `svelte/internal/client/dev/tracing.js` | Import (dev only) | Signal labeling + dependency tracing |
| `$inspect().with(callback)` | Compiler rune | Reactive value change notifications |
| Chrome Performance Extensibility API | `console.timeStamp()` | Custom tracks in Performance panel (near-zero overhead) |

### What Svelte 5 Removed (vs Svelte 4)
- `SvelteRegisterComponent` / `SvelteUnregisterComponent` events
- `SvelteRegisterBlock` events
- `SvelteDOMInsert` / `SvelteDOMRemove` events
- `create_fragment` with `m`/`p`/`d` lifecycle methods
- `capture_state` / `set_state` component methods

### Key Svelte 5 Internal Types
```typescript
// Source signal ($state)
interface Value<V> {
  v: V;                          // current value
  reactions: Reaction[] | null;  // dependents (effects/deriveds)
  equals: (a: V, b: V) => boolean;
  rv: number; wv: number;       // read/write versions
  // DEV: label, created, updated, trace
}

// Derived ($derived)
interface Derived<V> extends Value<V>, Reaction {
  fn: () => V;
  effects: Effect[] | null;
  parent: Effect | Derived | null;
}

// Effect ($effect)
interface Effect extends Reaction {
  ctx: ComponentContext;
  deps: Value[] | null;
  fn: () => void | (() => void);
  teardown: (() => void) | null;
  // DEV: component_function, dev_stack
}
```

---

## Architecture

```
┌──────────────────────────────────────┐
│          Vite Plugin                 │
│  (compile-time transform + bridge)   │
│                                      │
│  1. Post-transform: wraps $.push,    │
│     $.pop, $.state, $.effect, $.set  │
│  2. Injects runtime bridge via       │
│     virtual module                   │
│  3. Dev server WebSocket middleware  │
└──────────┬───────────────────────────┘
           │ window.postMessage
┌──────────▼───────────────────────────┐
│       Content Script (relay)         │
└──────────┬───────────────────────────┘
           │ chrome.runtime port
┌──────────▼───────────────────────────┐
│     Service Worker (router)          │
│     Maps tabId → panel port          │
└──────────┬───────────────────────────┘
           │ port.postMessage
┌──────────▼───────────────────────────┐
│      DevTools Panel (Svelte 5)       │
│                                      │
│  Tabs: Components | Reactivity |     │
│        Profiler | Update Tracer      │
└──────────────────────────────────────┘
```

### Reference Architectures Studied
- **React DevTools**: `__REACT_DEVTOOLS_GLOBAL_HOOK__` → fiber tree walking → compact "operations" arrays → lazy element inspection. Profiler defers all computation until recording stops.
- **Vue DevTools**: `__VUE_DEVTOOLS_GLOBAL_HOOK__` → `setupDevtoolsPlugin` public API → custom inspectors + timeline layers. Rich plugin system.
- **Chrome Performance Extensibility API**: `console.timeStamp(label, start, end, trackName, trackGroup, color)` for framework-specific tracks in Chrome Performance panel.

---

## Monorepo Structure

```
svelte-devtools-pro/
├── package.json                    # pnpm workspace root (vitest)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
│
├── packages/
│   ├── shared/                     # Protocol types + serialization
│   │   ├── package.json            # @svelte-devtools/shared
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   └── src/
│   │       ├── index.ts            # Barrel export
│   │       ├── types.ts            # ComponentNode, ReactiveGraphNode, RenderTiming, UpdateTrace, serialization types
│   │       ├── protocol.ts         # 17 message types, WireMessage, isDevToolsMessage(), PROTOCOL_VERSION
│   │       ├── serialization.ts    # serialize(), serializeAtPath(), Proxy unwrap, hostile getter protection
│   │       └── serialization.test.ts  # 35 unit tests (vitest)
│   │
│   ├── vite-plugin/                # vite-plugin-svelte-devtools
│   │   ├── package.json            # deps: acorn, estree-walker, magic-string (externalized in tsup)
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts          # ESM, DTS, externals → 14KB bundle
│   │   └── src/
│   │       ├── index.ts            # Plugin factory: bridgePlugin + transformPlugin (apply: 'serve')
│   │       ├── transform.ts        # AST post-transform: 6 patterns (push/pop/effect/set/update/tag)
│   │       ├── transform.test.ts   # 10 unit tests (vitest)
│   │       ├── runtime-inject.ts   # Bridge code: window.__svelte_devtools__ (15 API methods)
│   │       └── middleware.ts       # WebSocket: open-in-editor + source fetch (realpath validation)
│   │
│   └── extension/                  # Chrome DevTools extension
│       ├── package.json            # @svelte-devtools/extension (@types/chrome)
│       ├── tsconfig.json
│       ├── vite.config.ts          # base:'', modulePreload:false, multi-entry self-contained
│       ├── manifest.json           # MV3, action badge, no special permissions
│       └── src/
│           ├── devtools.html       # DevTools page entry
│           ├── devtools.ts         # Svelte detection (inspectedWindow.eval) + panel creation
│           ├── service-worker.ts   # Tab↔port routing, message validation, badge mgmt
│           ├── content-script.ts   # Page↔extension relay (postMessage ↔ chrome.runtime)
│           └── panel/
│               ├── index.html      # Panel HTML entry
│               ├── main.ts         # Port connection + Svelte mount
│               ├── App.svelte      # Tab layout + connection status bar
│               ├── components/     # [Phase 4+]
│               │   ├── ComponentTree.svelte
│               │   ├── StateInspector.svelte
│               │   ├── ReactivityGraph.svelte
│               │   ├── Profiler.svelte
│               │   └── UpdateTracer.svelte
│               └── lib/
│                   ├── connection.svelte.ts  # Reactive port connection ($state)
│                   ├── graph-layout.ts       # [Phase 5+]
│                   └── flamegraph.ts         # [Phase 6+]
│
└── playground/                     # Test Svelte 5 app
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts              # Uses svelte() + svelteDevtools()
    ├── index.html
    └── src/
        ├── main.ts
        ├── App.svelte              # Renders all test components
        ├── Counter.svelte          # $state + $derived chain
        ├── TodoList.svelte         # $state arrays, {#each}, keyed list
        ├── NestedState.svelte      # Deep reactive objects, proxy mutation
        ├── EffectChain.svelte      # $effect → $state → $derived → $effect
        ├── ContextPair.svelte      # setContext provider
        └── ContextChild.svelte     # getContext consumer
```

---

## Implementation Phases

### Phase 1: Scaffolding & Shared Infrastructure ✅

**Goal**: Working monorepo with build pipeline and test app.

**Status**: Complete. All packages build clean, 35 unit tests pass, playground dev server starts with bridge injected.

**What was built:**

- pnpm workspace with 5 workspaces (`packages/shared`, `packages/vite-plugin`, `packages/extension`, `playground`)
- `packages/shared/src/types.ts` — all data types:
  - `ComponentNode` (id, name, filename, children, parentId, meta, stateIds, effectIds, renderDuration)
  - `ReactiveGraphNode` (id, type: source|derived|effect, label, value, dirty, componentId)
  - `ReactiveGraphEdge` (from, to, active)
  - `RenderTiming` (componentId, name, startTime, duration, isRerender)
  - `UpdateTrace` (id as NodeId, timestamp, rootCause, chain, domMutations)
  - `DomMutation`, `UpdateChainStep` — sub-types for update tracing
  - 6 serialization value types: `SerializedObject`, `SerializedArray`, `SerializedDomNode`, `SerializedCircularRef`, `SerializedTruncated`, and primitives
- `packages/shared/src/protocol.ts` — typed message protocol (discriminated union):
  - Bridge→Panel (10 types): `component:mounted`, `component:unmounted`, `component:updated`, `component:tree` (full snapshot), `state:snapshot`, `graph:snapshot`, `graph:update`, `profiler:data`, `trace:update`, `bridge:ready`
  - Panel→Bridge (7 types): `inspect:component`, `state:edit`, `profiler:start`, `profiler:stop`, `graph:request`, `highlight:component`, `open-in-editor`
  - `WireMessage` wrapper with `source: 'svelte-devtools-pro'`
  - `isDevToolsMessage()` type guard with full payload validation (checks source + payload.type against whitelist)
  - `PROTOCOL_VERSION` constant for version negotiation; `BridgeReadyMessage` includes `protocolVersion`
- `packages/shared/src/serialization.ts` — safe serializer:
  - Unwrap Svelte Proxy via `Symbol.for('state')`
  - Handle circular references (WeakSet tracking)
  - Truncate DOM nodes to tag + id/class
  - Dehydrate deep objects (preview + path for lazy expansion)
  - `serializeAtPath()` for lazy child expansion — navigates path, returns serialized children
  - try/catch guards around `Object.keys()` and property access to protect against hostile getters/prototype pollution
- `packages/vite-plugin/src/index.ts` — plugin stub:
  - `svelteDevtools()` factory returning `bridgePlugin` + `transformPlugin`
  - Respects `enabled` option (returns `[]` when `false`)
  - Virtual module `virtual:svelte-devtools-bridge` with resolveId/load
  - `transformIndexHtml` injects bridge in `<head>`
  - Transform hook stub (`enforce: 'post'`) for `.svelte` files
- `packages/extension/` — extension shell:
  - `manifest.json` (Manifest V3) with paths matching build output
  - `vite.config.ts` — multi-entry build with `copyExtensionAssets` plugin to copy manifest to `dist/`
  - `@types/chrome` in devDependencies
  - Stub files: `devtools.ts`, `service-worker.ts`, `content-script.ts`, `panel/main.ts`
  - `panel/App.svelte` — tab navigation (Components, Reactivity, Profiler, Tracer) with dark theme
- Playground app with 6 test components:
  - `Counter.svelte` — `$state` + `$derived` chain
  - `TodoList.svelte` — `$state` arrays, `{#each}`, keyed list, `bind:value`/`bind:checked`
  - `NestedState.svelte` — deep reactive objects, proxy mutation
  - `EffectChain.svelte` — `$effect` → `$state` → `$derived` → `$effect`
  - `ContextPair.svelte` + `ContextChild.svelte` — `setContext`/`getContext` with reactive getter
- Build: tsup for shared + vite-plugin, Vite for extension
- Testing: vitest at workspace root, 35 unit tests in `packages/shared/src/serialization.test.ts`

**Review findings addressed:**

| Category | Issue | Resolution |
|----------|-------|------------|
| Critical | `isDevToolsMessage` only checked `source` field — any page script could forge messages | Added `payload` validation: must be object with `type` string from whitelist of 17 valid message types |
| Critical | Prototype pollution via hostile getters in `serializeObject` | Added try/catch around `Object.keys()` and property preview — returns `truncated` on failure |
| Important | No `serializeAtPath` for lazy child expansion | Added `serializeAtPath(root, path[], opts)` — navigates to target, serializes all children |
| Important | Extension manifest paths (`src/...`) didn't match build output (`dist/...`) | Changed manifest to use relative paths; added `copyExtensionAssets` Vite plugin |
| Important | Missing `@types/chrome` | Added to extension devDependencies |
| Important | `enabled` option was ignored | Now returns `[]` when `false` |
| Important | `UpdateTrace.id` typed as `string` | Changed to `NodeId` for consistency |
| Important | No unit tests | 35 tests covering primitives, truncation, depth, circular refs, DOM, proxy unwrap, hostile getters, `serializeAtPath`, `isDevToolsMessage` |
| Architecture | No protocol version negotiation | Added `protocolVersion` to `BridgeReadyMessage` + `PROTOCOL_VERSION` constant |
| Architecture | No full tree snapshot for panel reconnection | Added `ComponentTreeSnapshotMessage` (`component:tree`) |

**Known limitations (deferred):**
- Service worker chunk-splitting: MV3 service workers can't import from chunks — will address in Phase 3 with self-contained IIFE build
- `SerializedFunction`/`SerializedSymbol` as distinct types (currently returned as plain strings) — add when panel needs distinct rendering
- Circular ref `path` field records detection point, not first-seen point (WeakSet, not Map) — acceptable for preview mode
- DAG convergence may false-positive as circular ref — document and revisit when graph visualization needs it

### Phase 2: Vite Plugin Core ✅

**Goal**: Instrumented Svelte 5 app with `window.__svelte_devtools__` bridge emitting component events.

**Status**: Complete. All 4 plugin modules implemented, 10 transform tests pass, E2E verified in browser — all 7 playground components detected with correct names, filenames, parent-child tree, and render timings.

**What was built:**

**`transform.ts`** — AST-based post-transform (acorn + estree-walker + magic-string):
- Quick bail check: requires `.push(` + (`svelte/internal/client` OR `svelte_internal_client`)
- Detects `$` namespace from `ImportNamespaceSpecifier` (supports both original and Vite-resolved import paths)
- Instruments 6 patterns via comma expressions:
  - `$.push(props, runes, Counter)` → prepends `onPush("Counter", props, Counter)` — name baked as string literal via `JSON.stringify` to survive HMR wrapper reassignment
  - `$.pop(exports)` → prepends `onPop()`
  - `$.user_effect(fn)` → prepends `registerEffect(fn)`
  - `$.set(signal, value)` → appends `onMutation(signal)` AFTER set (avoids double evaluation of value expression)
  - `$.update(signal)` → prepends `onMutation(signal)` (signal arg is always a simple identifier, safe to evaluate before)
  - `$.tag($.state(0), 'count')` → IIFE wrapper that captures signal, calls `registerSignal(signal, label)`, returns signal
- Error boundary: entire walk+magic-string wrapped in try/catch (logs warning, returns null on failure)
- Uses optional chaining (`window.__svelte_devtools__?.onPush(...)`) so instrumented code is safe even if bridge fails

**`runtime-inject.ts`** — Virtual module `virtual:svelte-devtools-bridge`:
- Creates `window.__svelte_devtools__` with 15 API methods
- Component stack tracking: `onPush()` builds tree with parent-child relationships, `onPop()` computes render duration
- `removeComponent(id)` — recursive cleanup of component + descendants from maps/arrays (for HMR/unmount)
- Signal registry: `registerSignal(signal, label)` links signals to current component
- Effect registry: `registerEffect(fn)` links effects to current component
- Mutation tracking: `onMutation(signal)` queues mutations (capped at 1000 entries)
- `wrapEffect(fn, effectId)` — effect profiling wrapper (wired in Phase 6)
- `getTree()` — returns full component tree for panel reconnection
- Profiling: `startProfiling()`/`stopProfiling()` with `MAX_PROFILING_ENTRIES = 10000` cap
- Chrome Performance API: `console.timeStamp()` for custom tracks (opt-in, only when `profilingActive`)
- `postMessage` with `window.location.origin` (not wildcard `'*'`)
- Listens for messages FROM extension (profiler:start/stop, inspect:component, highlight:component)
- Emits `bridge:ready` with svelteVersion and protocolVersion

**`index.ts`** — Plugin entry wiring:
- `svelteDevtools(options)` factory returns `[bridgePlugin, transformPlugin]`
- `bridgePlugin`: `apply: 'serve'`, virtual module resolve/load, `transformIndexHtml` injects `<script src="/@id/__x00__virtual:svelte-devtools-bridge">`, `configureServer` for middleware
- `transformPlugin`: `enforce: 'post'`, strips query params from ID, skips `type=style`/`type=template` sub-requests

**`middleware.ts`** — Dev server WebSocket:
- `svelte-devtools:open-in-editor` → validates path within project root via `realpath()`, then delegates to Vite's `__open-in-editor`
- `svelte-devtools:get-source` → same `realpath()` + path boundary validation, reads file, sends content
- `isWithinRoot()` helper: resolves symlinks to prevent traversal, checks `resolvedPath + '/'` boundary

**E2E verification results (Playwright):**
- Bridge initializes: `window.__svelte_devtools__` present with 15 methods
- 7 components detected: App, Counter, TodoList, NestedState, EffectChain, ContextPair, ContextChild
- Correct tree structure: App → 5 children, ContextPair → 1 child (ContextChild)
- Correct filenames: `src/App.svelte`, `src/Counter.svelte`, etc.
- Render timings captured: App 1.3ms, Counter 0.1ms, TodoList 0.3ms, etc.
- 2 effects registered from EffectChain component
- All 7 components instrumented by transform (confirmed via server logs)

**Review findings addressed:**

| Category | Issue | Resolution |
|----------|-------|------------|
| Critical | XSS via unescaped component name in string interpolation | Use `JSON.stringify()` for safe string literal in `instrumentPush` |
| Critical | Double evaluation of `$.set` value expression (side effects run twice) | Moved `onMutation` to AFTER `$.set` completes; pass signal only, bridge reads new value |
| Critical | `\|\| true` debug leftover forced `console.timeStamp` on every render | Removed — profiling is now properly opt-in via `profilingActive` flag |
| Important | Memory leak: componentMap/rootComponents/pendingMutations grow unbounded | Added `removeComponent()` with recursive cleanup; capped `pendingMutations` at 1000 |
| Important | Symlink bypass + path boundary flaw in middleware traversal check | Use `realpath()` to resolve symlinks; check `resolvedPath + '/'` boundary |
| Important | Missing path validation on `open-in-editor` handler | Added same `isWithinRoot()` check as `get-source` |
| Important | `$.state()` not instrumented — signalMap always empty | Added `$.tag()` instrumentation: IIFE captures signal, calls `registerSignal(signal, label)` |
| Important | `postMessage` uses wildcard `'*'` origin | Changed to `window.location.origin` |
| Important | Transform hook matches style/template sub-requests | Strip query params from ID; skip `type=style` and `type=template` |
| Suggestion | No error boundary around AST walk/magic-string ops | Wrapped walk+magic-string in try/catch; logs warning and returns null |
| Suggestion | Profiling arrays (`renderTimings`, `effectTimings`) unbounded | Added `MAX_PROFILING_ENTRIES = 10000` cap with shift eviction |

**Known limitations (deferred):**
- `wrapEffect` in bridge is defined but not yet called by transform — will be wired in Phase 6 when profiling mode is complete
- Bridge code is a template literal string (no type checking or linting) — accepted tradeoff for simplicity; could extract to separate file at build time
- `onPop` timing measures from `onPush` to `onPop`, excluding work done inside `$.pop()` itself — intentional, measures component render time not Svelte internals
- `$.tag_proxy()` (used for proxied state like arrays) is not yet instrumented — signals created via `$.tag_proxy($.proxy([]), 'effectLog')` won't be registered; add when needed

### Phase 3: Extension Shell ✅

**Goal**: Chrome extension that detects Svelte and shows an empty panel.

**Status**: Complete. Full MV3 message relay chain implemented — content script, service worker routing, devtools detection, panel with reactive connection state. Extension builds clean with all entries self-contained.

**What was built:**

**`content-script.ts`** — Page↔extension relay:
- Runs in isolated world, listens for `postMessage` from bridge (source: `svelte-devtools-pro`)
- Lazily connects `chrome.runtime.Port` to service worker on first message
- Relays messages bidirectionally: page→extension and extension→page
- Uses `'/'` target origin for postMessage (same-origin only, not wildcard)
- Retry-once pattern for disconnected ports

**`service-worker.ts`** — Tab↔port routing + badge:
- Manages two port maps: `contentPorts` (tabId → port) and `panelPorts` (tabId → port)
- Message validation: `VALID_BRIDGE_TYPES` and `VALID_PANEL_TYPES` sets checked before forwarding
- Caches full `bridge:ready` data (`svelteVersion` + `protocolVersion`) in `svelteTabs` Map for late-connecting panels
- `panel:init` tabId validated as finite number before storing
- Badge: orange `✓` on Svelte detection, cleared on tab close/navigation
- Cleanup: `tabs.onRemoved` and `tabs.onUpdated` (status: loading) handlers

**`devtools.ts`** — Svelte detection + panel creation:
- Uses `chrome.devtools.inspectedWindow.eval` to check for `__svelte_devtools__` or `__svelte`
- Polls 10× at 500ms intervals (5s total) for bridge initialization
- Creates "Svelte" panel via `chrome.devtools.panels.create` once detected
- Re-detects on `chrome.devtools.network.onNavigated`

**`panel/lib/connection.svelte.ts`** — Reactive Svelte 5 connection module:
- `$state` runes: `connected`, `svelteDetected`, `svelteVersion`, `messages[]`
- `connect()` — creates port, sends `panel:init` with tabId
- `send(message)` — forwards `PanelToBridgeMessage` to bridge
- `disconnect()` — full cleanup including detection state reset
- Auto-reconnect on disconnect (1s delay) for service worker restarts
- Message array: direct `push()` + `splice()` for efficient reactivity (no full copies)

**`panel/App.svelte`** — Updated with status bar:
- Footer showing connection state: red "Disconnected" / yellow "Waiting for Svelte..." / orange "Svelte {version}"
- Existing tab navigation preserved (Components, Reactivity, Profiler, Tracer)

**`manifest.json`** — MV3 configuration:
- `action` key for badge API, no special permissions needed
- `devtools_page: "src/devtools.html"` matching build output paths
- Content script on `<all_urls>` at `document_start`
- Service worker with `"type": "module"`

**`vite.config.ts`** — Build configuration:
- `base: ''` for relative asset paths (required for Chrome extension context)
- `modulePreload: false` to eliminate polyfill chunk
- All entry files self-contained (content-script 0.47KB, devtools 0.44KB, service-worker 1.68KB, panel 35KB)

**`protocol.ts`** — Added `PanelInitMessage` interface for extension-internal messaging

**Review findings addressed:**

| Category | Issue | Resolution |
|----------|-------|------------|
| Critical | HTML used absolute `/` paths — broken in extension context | Set `base: ''` → relative paths (`../devtools.js`) |
| Critical | `devtools.js` imported modulepreload polyfill chunk | Set `modulePreload: false` → all entries self-contained |
| Critical | Content script relayed with wildcard `'*'` origin | Changed to `'/'` (same-origin only) |
| Critical | No message validation in service worker | Added `VALID_BRIDGE_TYPES` / `VALID_PANEL_TYPES` sets + `isValidMessage()` |
| Important | `panel:init` tabId not validated | Added `typeof === 'number' && Number.isFinite()` |
| Important | Cached `bridge:ready` missing version data | Changed `svelteTabs` from Set to Map with full `{svelteVersion, protocolVersion}` |
| Important | Detection state not reset on disconnect | `handleDisconnect` resets `svelteDetected`, `svelteVersion`, `messages` |
| Important | Messages array created full copies on each push | Changed to `push()` + `splice()` (Svelte 5 mutation tracking) |
| Important | `panel:init` missing from protocol types | Added `PanelInitMessage` interface |
| Important | Unused `activeTab` permission | Removed — no permissions needed |
| Important | No reconnection on disconnect | Added `scheduleReconnect()` with 1s delay |

**Known limitations (deferred):**
- No icon files yet — manifest references icons but `icons/` directory is empty; add when creating extension assets
- Detection polling capped at 5s — very slow Svelte apps may be missed; could improve by listening for `bridge:ready` via port instead
- Content script connects eagerly on any matching postMessage — acceptable for dev tool, Chrome cleans up on tab close

### Phase 4: Component Tree + State Inspection ✅

**Goal**: Fully working component tree with state viewing and editing.

**Status**: Complete. Split-pane Components tab with collapsible tree (left) and state inspector (right). Bridge handles `inspect:component` → `state:snapshot` flow and `highlight:component` → DOM overlay. Message routing wired via subscriber pattern.

**What was built:**

**`panel/lib/components.svelte.ts`** — Reactive component store:
- `$state` Record for component map (not Map, for Svelte 5 reactivity)
- `processMessage()` handles 5 message types: `component:mounted`, `component:unmounted`, `component:updated`, `component:tree`, `state:snapshot`
- Recursive `removeRecursive(id)` for unmount cleanup — prevents orphaned children on out-of-order messages
- `component:tree` validates children references (filters IDs pointing to missing nodes)
- `component:updated` only overwrites `renderDuration` when `> 0` (mutation-triggered updates send 0)
- `resetState()` clears all state on disconnect/reconnect
- Exported accessors: `getComponentMap()`, `getRootIds()`, `getSelectedId()`, `getSearchFilter()`, `getStateSnapshot()`

**`panel/components/ComponentTree.svelte`** — Collapsible tree UI:
- Recursive `{#snippet treeNode(id, depth)}` with `{@render}` (no `svelte:self`)
- Expand/collapse chevrons stored in `$state` Record (default expanded)
- Component name in Svelte orange (#e8ab6a), basename filename in muted gray
- Render duration badge: green < 8ms, orange 8-16ms, red > 16ms
- Click → `selectComponent(id)` + `send({ type: 'inspect:component', id })`
- Hover → `send({ type: 'highlight:component', id })` / `send({ type: 'highlight:component', id: null })`
- Search filter: case-insensitive name match, flat view when filtering
- Accessibility: `role="tree"/"treeitem"`, `aria-selected`, `aria-expanded`, keyboard (Enter/Space)

**`panel/components/StateInspector.svelte`** — State inspector panel:
- Shows selected component name or "Select a component" placeholder
- Signal list with type badges: `$state` (green), `$derived` (yellow), `$props` (blue)
- `{#snippet valueDisplay(value, depth)}` handles all `SerializedValue` variants:
  - Strings (green, quoted), numbers (blue), booleans (dark blue), null/undefined (gray italic)
  - Objects/arrays (preview text), DOM nodes (purple `<tag#id.class>`), circular refs (orange), truncated (gray)
- Empty states for no selection and no reactive state

**`panel/App.svelte`** — Updated Components tab:
- Split-pane layout: search bar + ComponentTree (left) | StateInspector (right)
- Pane divider, both panes scrollable independently
- Other tabs retain padding via inline style wrappers

**`panel/lib/connection.svelte.ts`** — Enhanced with subscribers:
- `onMessage(listener)` — returns unsubscribe function, iterates `[...listeners]` copy for mutation safety
- `onDisconnect(listener)` — fires when port disconnects (for state reset)

**`panel/main.ts`** — Wiring:
- `onMessage(processMessage)` — routes bridge messages to component store
- `onDisconnect(resetState)` — clears stale data on reconnect

**`runtime-inject.ts`** — Bridge inspect + highlight handlers:
- `inspect:component`: walks `signalMap` for signals owned by selected component, reads `signal.v` (untracked reactive read, documented), serializes via inline `safeSerialize()`, emits `state:snapshot`
- `registerSignal()` now tracks `signalType` ('state' | 'derived' | 'props') as 4th parameter
- Inline `safeSerialize()` / `previewVal()`: handles primitives, bigint, symbol, Date, RegExp, Error, arrays, objects, DOM nodes, circular refs, Svelte Proxy unwrap — simplified version of shared serializer for page context
- `highlight:component`: finds DOM elements via `__svelte_meta` filename matching, renders fixed-position overlay (orange border + tinted background)
- `findDomElements()`: tree walker with 10k element limit, 500ms cache, prefers full path match before basename fallback
- Highlight overlay: lazy-created div with `z-index: 2147483647`, computes union bounding rect of all matched elements

**Review findings addressed:**

| Category | Issue | Resolution |
|----------|-------|------------|
| Critical | Unmount doesn't recursively clean children — orphaned nodes on out-of-order messages | Added `removeRecursive(id)` that deletes node + all descendants |
| Important | `component:updated` from `onMutation` overwrites `renderDuration` with 0 | Only update when `message.renderDuration > 0` |
| Important | `findDomElements` had dead `data-svelte-component-id` branch (never set) + unbounded DOM walk | Removed dead branch, added 10k element limit + 500ms cache |
| Important | Filename matching by basename only — false matches for same-named components in different dirs | Full path match first, basename fallback only |
| Important | Highlight overlay never cleaned up | Cache with TTL; overlay hidden when `id: null` sent |
| Important | `onMessage` listeners not cleared on reconnect — stale component data | Added `onDisconnect()` subscriber, `main.ts` calls `resetState()` |
| Important | Listener array mutated during iteration | Iterate `[...listeners]` copy |
| Important | `component:tree` trusts children arrays — broken refs if IDs missing | Added validation pass filtering children to existing IDs |
| Important | Inline serializer missing Date/RegExp/Error/bigint/symbol handling | Added handling matching shared serializer coverage |
| Suggestion | Unused `getMessages` import in components.svelte.ts | Removed |
| Suggestion | `signal.v` read is untracked reactive access | Added comment documenting design choice |

**Known limitations (deferred):**
- State editing (`$.set(signal, newValue)`) — protocol message exists but bridge handler not implemented
- Lazy expansion of dehydrated objects/arrays — inline serializer omits `path` field
- HMR tree rebuild — no listener for Vite HMR invalidation events
- Reverse element picking (click DOM → expand tree to component) — not implemented
- `__svelte_meta` enrichment on nodes — DOM walk exists for highlighting but doesn't enrich ComponentNode.meta
- `depth` parameter in StateInspector valueDisplay snippet is unused (scaffolded for future recursive expansion)
- Arrow key navigation in ComponentTree (Up/Down/Left/Right per WAI-ARIA TreeView) — only Enter/Space supported
- Search filter has no debounce — may cause lag on fast typing with large trees

### Phase 5: Reactivity Graph Visualization ✅

**Goal**: Interactive dependency graph showing the full signal→derived→effect chain.

**Status**: Complete. Bridge walks Svelte 5 reactive graph (`signal.reactions[]`), panel renders interactive D3 force-directed SVG with color-coded nodes, pan/zoom, component filtering, and dirty signal animation.

**What was built:**

**Bridge `buildGraph(filterComponentId)`** — in `runtime-inject.ts`:
- Walks all registered signals in `signalMap`
- For each signal, traverses `signal.reactions[]` to find dependent deriveds and effects
- Type detection: `!('teardown' in reaction)` — deriveds lack `teardown`, effects have it (matches Svelte 5 internals)
- Dirty detection: `signal.wv > signal.rv` (write version > read version)
- Serializes values via inline `safeSerialize()`
- Component ownership lookup: `reaction.ctx.function` matched against componentMap, fallback to effectMap
- `stableReactionIds` Map persists reaction→ID mappings across rebuilds (stable node identities)
- Filter mode: only includes nodes owned by filtered component; edges only added when both endpoints exist (`addedNodeIds` set)
- `graph:request` message handler emits `graph:snapshot` with complete `{ nodes, edges }`

**`panel/lib/graph.svelte.ts`** — Reactive graph store:
- `$state` arrays for `graphNodes` and `graphEdges`
- `processGraphMessage()` handles `graph:snapshot` (full replace) and `graph:update` (merge by ID with composite edge key)
- Selection state: `selectedNodeId`, `selectGraphNode()`
- Component filter: `componentFilter`, `setComponentFilter()`
- `resetGraphState()` on disconnect
- Wired into `main.ts` via `onMessage(processGraphMessage)` + `onDisconnect(resetGraphState)`

**`panel/components/ReactivityGraph.svelte`** — D3 force-directed SVG visualization:
- D3 simulation via `$effect` watching `graphNodes`/`graphEdges` — creates `forceSimulation` with link, charge (-200), center, and collide (30) forces
- Position preservation: carries forward existing node positions across rebuilds; uses lower alpha (0.3) for gentle adjustments
- Tick throttling: only triggers Svelte reactivity every 3rd tick, reducing DOM reconciliation from ~300 to ~100 per layout
- SVG node shapes by type: circle = `$state` (#ff3e00), diamond = `$derived` (#cca700), square = `$effect` (#4ec960)
- Dirty nodes: pulsing red ring via CSS `@keyframes pulse` animation
- Selected node: white stroke outline + highlighted edges (#ff3e00)
- Edge arrows: SVG `<defs><marker>` with arrowheads
- Pan: mousedown/mousemove/mouseup on SVG translates `<g>` wrapper
- Zoom: wheel event adjusts scale (0.1–5x) centered on mouse position
- Tooltip: `position: fixed` div showing label, type, value preview, dirty status
- Toolbar: component filter `<select>`, Refresh button, node/edge count badge
- Keyboard: Escape deselects, Enter/Space on focused nodes selects
- `onMount` sends initial `graph:request`
- ResizeObserver tracks SVG dimensions

**Review findings addressed:**

| Category | Issue | Resolution |
|----------|-------|------------|
| Critical | Dangling edges when component filter active — edges added for filtered-out nodes | Track `addedNodeIds` set; only add edge when both endpoints present |
| Critical | Derived vs effect detection unreliable (`reaction.reactions !== undefined`) | Changed to `!('teardown' in reaction)` — effects have teardown, deriveds don't |
| Critical | `genId()` creates new IDs for same reactions across `buildGraph()` calls | Added `stableReactionIds` Map at bridge scope — persists across calls |
| Important | Simulation recreated from scratch losing node positions | Preserve positions via `oldPositions` Map; use lower alpha for existing layouts |
| Important | Tick handler creates new arrays on every frame (~300 DOM reconciliations) | Throttle to every 3rd tick or at final settling |
| Important | Tooltip `position: absolute` misaligned with `clientX/clientY` | Changed to `position: fixed` |
| Important | Unused `d3-selection` dependency | Removed |
| Important | `graph:update` merge doesn't remove stale edges | Documented as additive-only; full refresh via `graph:request` |

**Known limitations (deferred):**
- No live push updates / flash animation on signal change — currently request/response only
- No minimap for navigation
- No `graph-layout.ts` extraction (all layout logic in component)
- No touch support for pan/zoom
- ResizeObserver doesn't update `forceCenter` on dimension changes
- `selectedConnectedIds` derived computed but not yet consumed in template (available for future highlighting)
- Arrow key navigation between graph nodes not implemented

### Phase 6: Performance Profiler

**Goal**: Record and visualize component render times and effect execution.

**Data Collection (opt-in):**
- Panel "Start Profiling" → message → bridge sets `profilingActive = true`
- Component renders: timing from push/pop wrapping (already captured)
- Effect execution: wrap effect functions with `performance.now()` timing
- Track render count per component

**Chrome Performance Integration:**
- `console.timeStamp(label, start, end, trackName, trackGroup, color)`:
  - Track group: "Svelte DevTools Pro"
  - Track "Component Renders": entries per component render (color: primary)
  - Track "Effect Execution": entries per effect run (color: secondary)
- `chrome.devtools.performance.onProfilingStarted` → activate bridge profiling lazily

**Panel Profiler (`Profiler.svelte`):**
- Start/Stop recording button
- Flamegraph: nested component renders by parent-child, colored by self-time
- Component table: name, render count, total time, avg time, self time, sorted by total
- Effect table: label, execution count, total duration, avg duration, deps count
- Highlight: components exceeding configurable threshold get red indicator
- Commit view: group renders by reactive batch (like React's commit view)

### Phase 7: "Why Did This Update?" Tracing

**Goal**: Click any update and see the full causal chain from source mutation to DOM change.

**Mutation Capture (bridge):**
- Wrap `$.set()` calls: record signal label, component, stack trace, timestamp
- Queue in `pendingMutations[]`

**Chain Building:**
- When effects re-run: check `Effect.deps[]` for dirty signals (wv changed since last known)
- Record: which deps were dirty, old value vs new value
- Build chain: Source mutation → dirty reactions → effect execution
- Leverage dev-mode `created`/`updated` Error stack traces for precise locations

**DOM Correlation:**
- `MutationObserver` on `document.body` (childList, subtree, attributes, characterData)
- Correlate DOM mutations with current update chain (same microtask batch)

**Panel UI (`UpdateTracer.svelte`):**
- Timeline of update events (newest first)
- Each entry shows: signal name → N effects re-ran → M DOM updates
- Click to expand:
  - Root cause: signal label + component + stack trace
  - Propagation: each effect with its dirty deps (old → new values)
  - DOM changes: element + mutation type + attribute
- "Jump to source" links via open-in-editor

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transform approach | AST (acorn + estree-walker) | Regex is fragile; AST reliably finds `$.push` etc. |
| Bridge injection | Vite virtual module | Clean, auto-removed in prod, no manual setup |
| Graph visualization | D3 force-directed | Battle-tested, handles large graphs, interactive |
| Profiling overhead | Opt-in via panel toggle | Base tree instrumentation is lightweight; profiling adds timing |
| Svelte version compat | Abstraction layer + `window.__svelte.v` | Private APIs may change; version-specific accessors isolate breakage |
| Panel framework | Svelte 5 | Dogfooding, proves the ecosystem |
| Performance API | `console.timeStamp` | Near-zero overhead (no timeline entries when DevTools closed) |
| Serialization | Lazy/dehydrated | Large reactive state trees need progressive loading |

---

## Svelte Version Compatibility Strategy

Since we rely on private `svelte/internal` APIs:

```typescript
// packages/vite-plugin/src/compat.ts
function getCompatLayer(version: string) {
  // Abstract field access so version changes only break here
  return {
    getSignalValue: (signal) => signal.v,
    getSignalLabel: (signal) => signal.label,
    getEffectDeps: (effect) => effect.deps,
    getEffectContext: (effect) => effect.ctx,
    isSignalDirty: (signal) => signal.wv > signal.rv,
    // ... version-specific accessors
  };
}
```

Test against: Svelte 5.0, 5.10, 5.20, 5.37+ in CI matrix.

---

## Testing & Verification

| Level | Tool | What | Status |
|-------|------|------|--------|
| Unit | Vitest | Serialization edge cases, protocol validation, type guards | ✅ 35 tests passing |
| Unit | Vitest | Transform correctness (fixture files, 6 instrumentation patterns) | ✅ 10 tests passing |
| Integration | Playwright | Load playground + plugin, verify bridge, tree, names, timings | ✅ Manual E2E verified |
| Extension E2E | Puppeteer `--load-extension` | Full panel lifecycle: tree renders, graph shows, profiler records | Phase 4+ |
| Compatibility | CI matrix | Svelte 5.0, 5.10, 5.20, 5.37+ | Phase 3+ |
| Playground | Manual | Counter, TodoList, NestedState, EffectChain, ContextPair, ContextChild | ✅ All components built + instrumented |

---

## Distribution

| Target | Package | Deps |
|--------|---------|------|
| npm | `vite-plugin-svelte-devtools` | Peer: `vite ^5\|\|^6`, `svelte ^5` |
| Chrome Web Store | Svelte DevTools Pro | — |
| GitHub Actions | On tag push | Build → npm publish + Chrome Web Store upload |

**Usage:**
```typescript
// vite.config.ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';

export default defineConfig({
  plugins: [
    svelte(),
    svelteDevtools()  // Add after svelte()
  ]
});
```

---

## Phase 6: Performance Profiler — Completion Notes

**Files created:**
- `packages/extension/src/panel/lib/profiler.svelte.ts` — Reactive profiler store with session tokens, aggregation functions
- `packages/extension/src/panel/components/Profiler.svelte` — Profiler UI with start/stop toggle, elapsed timer, component & effect tables

**Files modified:**
- `packages/vite-plugin/src/transform.ts` — `instrumentUserEffect` now wraps effect functions through `wrapEffect` for timing instrumentation
- `packages/vite-plugin/src/runtime-inject.ts` — `wrapEffect` uses lazy reaction lookup for accurate `depsCount`, effect timings match protocol shape
- `packages/extension/src/panel/main.ts` — Added `processProfilerMessage` + `resetProfilerState` routing
- `packages/extension/src/panel/App.svelte` — Replaced Profiler placeholder with `<Profiler />`
- `packages/shared/src/protocol.ts` — `ProfilerDataMessage` with `effectTimings` array

**Review fixes applied:**
- Critical: `depsCount` now reads actual `reaction.deps.length` via lazy cached lookup (was `fn.length`)
- Critical: Session token + `pendingStopToken` prevents race condition on stop-then-start cycles
- Critical: Transform now generates IIFE that calls both `registerEffect` AND `wrapEffect` (was missing `wrapEffect`)
- Important: `clearData` guards against clearing during active recording
- Important: Effect label aggregation updates from later entries when earlier ones are null
- Important: Panel-side cap of 10,000 entries prevents unbounded memory growth

---

## Phase 7: "Why Did This Update?" Tracing — Completion Notes

**Files created:**
- `packages/extension/src/panel/lib/tracer.svelte.ts` — Reactive trace store with ring buffer of 200 entries
- `packages/extension/src/panel/components/UpdateTracer.svelte` — Timeline UI with expandable trace detail view

**Files modified:**
- `packages/vite-plugin/src/transform.ts` — $.set now calls `preMutation` before and `onMutation` after; $.update uses IIFE pattern to preserve return value while capturing both
- `packages/vite-plugin/src/runtime-inject.ts` — Added preMutation/preCapture, enhanced onMutation with stack traces and old/new value capture, MutationObserver for DOM changes, buildChainFromSignal for reactive graph walking, queueMicrotask-based trace flush
- `packages/shared/src/types.ts` — Added `oldValue`/`newValue` to `UpdateTrace.rootCause`
- `packages/extension/src/panel/main.ts` — Added processTraceMessage + resetTracerState routing
- `packages/extension/src/panel/App.svelte` — Replaced Tracer placeholder with `<UpdateTracer />`

**Architecture decisions:**
- Always-on tracing (no start/stop toggle) — captures every mutation when DevTools panel is connected
- Microtask batching — mutations in the same synchronous cycle are grouped into a single flush
- DOM mutations attributed to the entire batch (per-signal attribution would require Svelte-internal integration)
- Chain building walks the reactive graph from the mutated signal through its reactions

**Review fixes applied:**
- Switched trace timestamps from `performance.now()` to `Date.now()` for correct cross-context display
- Switched `preCapture` to `WeakMap` to prevent memory leaks on orphaned signals
- Forwarded `oldValue`/`newValue` through rootCause to panel (core "Why?" diagnostic info)
- Added `MAX_TRACE_PENDING` cap on tracePending array
- Removed dead `.type-state` CSS class
