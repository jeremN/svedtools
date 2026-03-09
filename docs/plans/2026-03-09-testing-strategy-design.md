# Testing Strategy & CI Design

**Date:** 2026-03-09
**Status:** Approved

---

## Goals

Add comprehensive testing infrastructure, CI pipelines, and linting to Svelte DevTools Pro. The testing strategy uses a layered approach — unit tests for pure logic, integration tests for the plugin pipeline, and e2e tests split between fast runtime-only tests and a small set of real Chrome extension tests.

---

## Project Structure Changes

```
svedtools/
├── packages/                     (existing)
├── apps/
│   └── docs/                     SvelteKit docs site + feature demos
│       ├── src/routes/
│       │   ├── +page.svelte
│       │   ├── docs/             usage guide, API reference, architecture
│       │   └── demos/            one page per DevTools feature
│       │       ├── counter/      $state, $derived
│       │       ├── nested-state/ deep reactive objects
│       │       ├── effect-chain/ $effect propagation
│       │       ├── todo-list/    array mutations, keyed lists
│       │       └── context/      setContext/getContext
│       ├── svelte.config.js      static adapter
│       └── vite.config.ts        uses vite-plugin-svelte-devtools
├── tests/
│   ├── integration/
│   │   ├── fixtures/             minimal .svelte files for transform tests
│   │   ├── plugin-output.test.ts Vite JS API build → assert instrumented JS
│   │   └── bridge-messages.test.ts  browser context → assert bridge messages
│   ├── e2e/
│   │   ├── runtime/              Playwright, no extension
│   │   │   ├── component-tree.spec.ts
│   │   │   ├── state-inspection.spec.ts
│   │   │   ├── reactivity-graph.spec.ts
│   │   │   ├── profiler.spec.ts
│   │   │   └── update-tracer.spec.ts
│   │   └── extension/            Playwright + Chrome extension
│   │       ├── panel-renders.spec.ts
│   │       └── state-editing.spec.ts
│   └── playwright.config.ts
├── .github/workflows/
│   ├── pr.yml                    PR checks
│   └── main.yml                  main branch checks + artifacts
├── eslint.config.js
├── .prettierrc
└── playground/                   kept for quick manual testing
```

---

## Testing Layers

### Layer 1 — Unit Tests (vitest, no browser)

Existing: 35 serialization tests (shared), 10 transform tests (vite-plugin).

Gaps to fill:

| Package | Tests to Add |
|---------|-------------|
| shared | `protocol.test.ts` — message validation, `isDevToolsMessage()` edge cases |
| vite-plugin | `runtime-inject.test.ts` — bridge API surface, `middleware.test.ts` — WebSocket handler |
| extension | `service-worker.test.ts` — message routing logic (mocked Chrome APIs) |

### Layer 2 — Integration Tests (vitest + Vite API)

**`plugin-output.test.ts`:**
- Uses `import { build } from 'vite'` to compile fixture `.svelte` files with the plugin
- Asserts output JS contains expected instrumentation patterns ($.set wrappers, lifecycle hooks)
- Asserts bridge injection code is present
- Asserts no instrumentation when plugin is disabled

**`bridge-messages.test.ts`:**
- Spins up a Vite dev server programmatically
- Uses Playwright to load the page
- Asserts `window.__SVELTE_DEVTOOLS__` is populated
- Asserts component registration messages fire on mount

**Fixtures** (`tests/integration/fixtures/`):
- `basic-counter.svelte` — $.set instrumentation
- `derived-chain.svelte` — $.update instrumentation
- `effect-component.svelte` — $effect lifecycle hooks
- `nested-reactivity.svelte` — deep state + mutation tracing

### Layer 3a — E2E Runtime Tests (Playwright, no extension)

Run against the docs app dev server. Test the injected runtime via `window.__SVELTE_DEVTOOLS__`:

| Test | Verifies |
|------|----------|
| component-tree | `getComponentTree()` returns correct hierarchy |
| state-inspection | State reads/writes via bridge after UI interactions |
| reactivity-graph | Signal→derived→effect chains in graph data |
| profiler | Render timings captured after interactions |
| update-tracer | Mutation traces with correct source→effect chains |

### Layer 3b — E2E Extension Tests (Playwright + Chrome)

Launch Chrome with `--load-extension=packages/extension/dist`. Minimal set:

| Test | Verifies |
|------|----------|
| panel-renders | Extension loads, DevTools panel opens, component tree renders |
| state-editing | Edit value in StateInspector → app DOM updates |

---

## CI/CD

### PR Workflow (`.github/workflows/pr.yml`)

Trigger: `pull_request → main`

Five parallel jobs:

1. **lint** — `eslint .` + `prettier --check .`
2. **check** — `pnpm run check` (svelte-check + tsc --noEmit)
3. **test-unit** — build packages → `vitest run --project unit` + `vitest run --project integration`
4. **test-e2e** — build → start docs dev server → `playwright test --project runtime` (xvfb-run)
5. **test-e2e-extension** — build → start docs dev server → `playwright test --project extension` (xvfb-run)

All must pass for PR merge.

### Main Workflow (`.github/workflows/main.yml`)

Trigger: `push → main`

Same jobs as PR, plus:

- **build-extension** — upload `packages/extension/dist/` as GitHub artifact

### CI Details

- Node 22 (LTS)
- pnpm caching via `actions/setup-node` with `cache: 'pnpm'`
- Playwright browser caching (`~/.cache/ms-playwright`)
- xvfb-run for all Playwright tests
- 10 min timeout per job

---

## Linting & Formatting

### ESLint (flat config — `eslint.config.js`)

- `@eslint/js` — core JS rules
- `typescript-eslint` — TS-aware rules
- `eslint-plugin-svelte` — .svelte file parsing + rules
- `eslint-config-prettier` — disables rules that conflict with Prettier
- Ignores: `dist/`, `node_modules/`, `.svelte-kit/`, `pnpm-lock.yaml`
- Relaxed rules in test files (allow `any` in mocks)

### Prettier (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    { "files": "*.svelte", "options": { "parser": "svelte" } }
  ]
}
```

### Scripts (root `package.json`)

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

---

## Out of Scope

- Chrome Web Store publishing automation
- Test coverage reporting
- Visual regression testing
- Cross-browser e2e (Chromium only)
