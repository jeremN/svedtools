# Testing Strategy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive testing (unit, integration, e2e), CI pipelines, and ESLint + Prettier to Svelte DevTools Pro.

**Architecture:** Layered testing — unit tests for pure logic, integration tests using Vite's JS API to verify plugin output, e2e tests split between fast runtime-only (Playwright, no extension) and a small set of real Chrome extension tests. A SvelteKit docs site serves as both documentation and e2e test target. GitHub Actions CI runs lint, type-check, and all test layers on PRs.

**Tech Stack:** Vitest, Playwright, ESLint (flat config) + eslint-plugin-svelte, Prettier + prettier-plugin-svelte, SvelteKit (static adapter), GitHub Actions

---

## Task 1: ESLint + Prettier Setup

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (add scripts + devDependencies)

**Step 1: Install dependencies**

```bash
pnpm add -Dw eslint @eslint/js typescript-eslint eslint-plugin-svelte eslint-config-prettier prettier prettier-plugin-svelte globals
```

**Step 2: Create ESLint config**

Create `eslint.config.js`:

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.svelte-kit/', 'pnpm-lock.yaml', 'packages/vite-plugin/src/runtime-inject.ts'],
  },
);
```

Note: `runtime-inject.ts` is ignored because it contains a raw JS string template that ESLint can't parse meaningfully.

**Step 3: Create Prettier config**

Create `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

Create `.prettierignore`:

```
dist/
node_modules/
.svelte-kit/
pnpm-lock.yaml
```

**Step 4: Add scripts to root package.json**

Add to `scripts`:

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

**Step 5: Run lint and format to verify setup**

```bash
pnpm run lint
pnpm run format:check
```

Fix any issues that arise from existing code. This is expected — the codebase was written without a linter.

**Step 6: Format existing codebase**

```bash
pnpm run format
pnpm run lint:fix
```

Review changes, ensure nothing is broken.

**Step 7: Commit**

```bash
git add eslint.config.js .prettierrc .prettierignore package.json pnpm-lock.yaml
git add -u  # staged formatting changes
git commit -m "chore: add ESLint + Prettier with Svelte support"
```

---

## Task 2: Unit Test Gaps — Protocol Validation (shared)

**Files:**

- Create: `packages/shared/src/protocol.test.ts`

**Step 1: Write the failing tests**

Create `packages/shared/src/protocol.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isDevToolsMessage, PROTOCOL_VERSION } from './protocol.js';

describe('isDevToolsMessage', () => {
  it('returns true for valid bridge-to-panel message', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'component:mounted', node: {} },
      }),
    ).toBe(true);
  });

  it('returns true for valid panel-to-bridge message', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'inspect:component', id: 'sdt-1' },
      }),
    ).toBe(true);
  });

  it('returns false for wrong source', () => {
    expect(
      isDevToolsMessage({
        source: 'other-extension',
        payload: { type: 'component:mounted' },
      }),
    ).toBe(false);
  });

  it('returns false for missing source', () => {
    expect(isDevToolsMessage({ payload: { type: 'component:mounted' } })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDevToolsMessage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDevToolsMessage(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isDevToolsMessage('hello')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isDevToolsMessage(42)).toBe(false);
  });

  it('returns false for missing payload', () => {
    expect(isDevToolsMessage({ source: 'svelte-devtools-pro' })).toBe(false);
  });

  it('returns false for null payload', () => {
    expect(isDevToolsMessage({ source: 'svelte-devtools-pro', payload: null })).toBe(false);
  });

  it('returns false for payload without type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { id: 'sdt-1' },
      }),
    ).toBe(false);
  });

  it('returns false for unknown message type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'unknown:message' },
      }),
    ).toBe(false);
  });

  it('returns false for numeric type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 42 },
      }),
    ).toBe(false);
  });

  it('validates all bridge-to-panel message types', () => {
    const bridgeTypes = [
      'component:mounted',
      'component:unmounted',
      'component:updated',
      'component:tree',
      'state:snapshot',
      'graph:snapshot',
      'graph:update',
      'profiler:data',
      'trace:update',
      'bridge:ready',
    ];
    for (const type of bridgeTypes) {
      expect(
        isDevToolsMessage({
          source: 'svelte-devtools-pro',
          payload: { type },
        }),
      ).toBe(true);
    }
  });

  it('validates all panel-to-bridge message types', () => {
    const panelTypes = [
      'inspect:component',
      'state:edit',
      'profiler:start',
      'profiler:stop',
      'graph:request',
      'highlight:component',
      'open-in-editor',
    ];
    for (const type of panelTypes) {
      expect(
        isDevToolsMessage({
          source: 'svelte-devtools-pro',
          payload: { type },
        }),
      ).toBe(true);
    }
  });
});

describe('PROTOCOL_VERSION', () => {
  it('is a positive integer', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they pass**

These tests should all pass immediately since they test existing, working code:

```bash
cd packages/shared && pnpm test
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add packages/shared/src/protocol.test.ts
git commit -m "test(shared): add protocol validation tests"
```

---

## Task 3: Unit Test Gaps — Service Worker Routing (extension)

**Files:**

- Create: `packages/extension/src/service-worker.test.ts`
- Modify: `packages/extension/package.json` (add test script + vitest dep)
- Create: `packages/extension/vitest.config.ts`

The service worker uses Chrome APIs (`chrome.runtime`, `chrome.tabs`, `chrome.action`) which must be mocked. We'll extract the pure routing logic into testable functions.

**Step 1: Add vitest to extension package**

Add to `packages/extension/package.json` scripts:

```json
{
  "test": "vitest run"
}
```

Create `packages/extension/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 2: Refactor service-worker.ts to export testable functions**

Extract `isValidMessage` and the message type sets as named exports so tests can import them without needing Chrome APIs.

Add to the top of `packages/extension/src/service-worker.ts` (keep existing code):

```ts
export { isValidMessage, VALID_BRIDGE_TYPES, VALID_PANEL_TYPES };
```

**Step 3: Write the tests**

Create `packages/extension/src/service-worker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidMessage, VALID_BRIDGE_TYPES, VALID_PANEL_TYPES } from './service-worker.js';

describe('isValidMessage', () => {
  it('accepts valid bridge message types', () => {
    for (const type of VALID_BRIDGE_TYPES) {
      expect(isValidMessage({ type }, VALID_BRIDGE_TYPES)).toBe(true);
    }
  });

  it('accepts valid panel message types', () => {
    for (const type of VALID_PANEL_TYPES) {
      expect(isValidMessage({ type }, VALID_PANEL_TYPES)).toBe(true);
    }
  });

  it('rejects message with unknown type', () => {
    expect(isValidMessage({ type: 'unknown' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidMessage(null, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidMessage(undefined, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects string', () => {
    expect(isValidMessage('hello', VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects message without type field', () => {
    expect(isValidMessage({ id: 'sdt-1' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects message with numeric type', () => {
    expect(isValidMessage({ type: 42 }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('does not accept panel types when checking bridge types', () => {
    expect(isValidMessage({ type: 'inspect:component' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('does not accept bridge types when checking panel types', () => {
    expect(isValidMessage({ type: 'component:mounted' }, VALID_PANEL_TYPES)).toBe(false);
  });
});

describe('message type sets', () => {
  it('VALID_BRIDGE_TYPES contains expected types', () => {
    expect(VALID_BRIDGE_TYPES.has('component:mounted')).toBe(true);
    expect(VALID_BRIDGE_TYPES.has('bridge:ready')).toBe(true);
    expect(VALID_BRIDGE_TYPES.has('trace:update')).toBe(true);
  });

  it('VALID_PANEL_TYPES contains expected types', () => {
    expect(VALID_PANEL_TYPES.has('inspect:component')).toBe(true);
    expect(VALID_PANEL_TYPES.has('state:edit')).toBe(true);
    expect(VALID_PANEL_TYPES.has('profiler:start')).toBe(true);
  });
});
```

**Step 4: Run tests**

```bash
cd packages/extension && pnpm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add packages/extension/src/service-worker.ts packages/extension/src/service-worker.test.ts packages/extension/package.json packages/extension/vitest.config.ts
git commit -m "test(extension): add service worker message routing tests"
```

---

## Task 4: SvelteKit Docs Site Scaffold

**Files:**

- Create: `apps/docs/` (full SvelteKit project)
- Modify: `pnpm-workspace.yaml` (add `apps/*`)

**Step 1: Update workspace config**

Modify `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'playground'
```

**Step 2: Scaffold SvelteKit project**

```bash
cd apps && pnpm create svelte@latest docs
```

Select: Skeleton project, TypeScript, no additional options.

Then configure:

```bash
cd apps/docs && pnpm add -D @sveltejs/adapter-static vite-plugin-svelte-devtools
```

**Step 3: Configure for static site + devtools plugin**

Update `apps/docs/svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: '404.html' }),
  },
};
```

Update `apps/docs/vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), svelteDevtools()],
});
```

**Step 4: Add prerender config**

Create `apps/docs/src/routes/+layout.ts`:

```ts
export const prerender = true;
```

**Step 5: Verify it builds and runs**

```bash
cd apps/docs && pnpm dev
```

Expected: SvelteKit dev server starts on localhost.

**Step 6: Commit**

```bash
git add pnpm-workspace.yaml apps/docs/
git commit -m "feat(docs): scaffold SvelteKit docs site with devtools plugin"
```

---

## Task 5: Docs Site — Layout and Documentation Pages

**Files:**

- Create: `apps/docs/src/routes/+layout.svelte`
- Create: `apps/docs/src/routes/+page.svelte`
- Create: `apps/docs/src/routes/docs/+page.svelte`
- Create: `apps/docs/src/routes/docs/installation/+page.svelte`
- Create: `apps/docs/src/routes/docs/vite-plugin/+page.svelte`
- Create: `apps/docs/src/routes/docs/extension/+page.svelte`
- Create: `apps/docs/src/routes/docs/architecture/+page.svelte`

Use @svelte:svelte-code-writer for all `.svelte` files.

**Step 1: Create the layout**

Create `apps/docs/src/routes/+layout.svelte` with a sidebar nav linking to Docs and Demos sections.

**Step 2: Create the home page**

Create `apps/docs/src/routes/+page.svelte` with a project overview and quick-start instructions.

**Step 3: Create documentation pages**

Create each docs page with relevant content:

- `installation/+page.svelte` — how to install the Vite plugin + Chrome extension
- `vite-plugin/+page.svelte` — plugin options, API reference
- `extension/+page.svelte` — loading, usage, panel overview
- `architecture/+page.svelte` — how the system works (bridge, transforms, messaging)

**Step 4: Verify pages render**

```bash
cd apps/docs && pnpm dev
```

Navigate to each page, verify routing works.

**Step 5: Commit**

```bash
git add apps/docs/src/routes/
git commit -m "feat(docs): add layout, home page, and documentation pages"
```

---

## Task 6: Docs Site — Feature Demo Pages

**Files:**

- Create: `apps/docs/src/routes/demos/+page.svelte`
- Create: `apps/docs/src/routes/demos/counter/+page.svelte`
- Create: `apps/docs/src/routes/demos/nested-state/+page.svelte`
- Create: `apps/docs/src/routes/demos/effect-chain/+page.svelte`
- Create: `apps/docs/src/routes/demos/todo-list/+page.svelte`
- Create: `apps/docs/src/routes/demos/context/+page.svelte`
- Create: `apps/docs/src/lib/demos/Counter.svelte`
- Create: `apps/docs/src/lib/demos/NestedState.svelte`
- Create: `apps/docs/src/lib/demos/EffectChain.svelte`
- Create: `apps/docs/src/lib/demos/TodoList.svelte`
- Create: `apps/docs/src/lib/demos/ContextParent.svelte`
- Create: `apps/docs/src/lib/demos/ContextChild.svelte`

Use @svelte:svelte-code-writer for all `.svelte` files.

Each demo component targets a specific DevTools feature:

| Demo         | Component                                      | DevTools Feature       | Key Svelte Patterns                                     |
| ------------ | ---------------------------------------------- | ---------------------- | ------------------------------------------------------- |
| Counter      | `Counter.svelte`                               | State inspection       | `$state`, `$derived`, button click                      |
| Nested State | `NestedState.svelte`                           | Deep object inspection | `$state` with nested objects, path-based editing        |
| Effect Chain | `EffectChain.svelte`                           | Reactivity graph       | `$state` → `$derived` → `$effect` chain                 |
| Todo List    | `TodoList.svelte`                              | Update tracing         | Array mutations (push, splice), `{#each}` with keys     |
| Context      | `ContextParent.svelte` + `ContextChild.svelte` | Component tree         | `setContext` / `getContext`, parent-child relationships |

**Step 1: Create demo components**

Each component should:

- Use the Svelte 5 patterns listed above
- Have interactive UI (buttons, inputs) for triggering state changes
- Add `data-testid` attributes on interactive elements and output elements for e2e targeting

Example for Counter:

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<div data-testid="counter-demo">
  <button data-testid="counter-decrement" onclick={() => count--}>-</button>
  <span data-testid="counter-value">{count}</span>
  <button data-testid="counter-increment" onclick={() => count++}>+</button>
  <p data-testid="counter-doubled">Doubled: {doubled}</p>
</div>
```

**Step 2: Create demo pages**

Each page imports the component and adds a brief description of what DevTools features to observe.

**Step 3: Create demo index page**

`demos/+page.svelte` — lists all demos with descriptions and links.

**Step 4: Verify all demos work**

```bash
cd apps/docs && pnpm dev
```

Navigate to each demo, interact with the UI, verify the Svelte patterns work.

**Step 5: Commit**

```bash
git add apps/docs/src/lib/demos/ apps/docs/src/routes/demos/
git commit -m "feat(docs): add feature demo components and pages"
```

---

## Task 7: Integration Tests — Plugin Output Verification

**Files:**

- Create: `tests/integration/fixtures/basic-counter.svelte`
- Create: `tests/integration/fixtures/derived-chain.svelte`
- Create: `tests/integration/fixtures/effect-component.svelte`
- Create: `tests/integration/fixtures/nested-reactivity.svelte`
- Create: `tests/integration/plugin-output.test.ts`
- Create: `tests/vitest.config.ts`

**Step 1: Create vitest config for integration tests**

Create `tests/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
  },
});
```

**Step 2: Create Svelte fixture files**

Create minimal `.svelte` files that exercise each transform pattern:

`tests/integration/fixtures/basic-counter.svelte`:

```svelte
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>{count}</button>
```

`tests/integration/fixtures/derived-chain.svelte`:

```svelte
<script>
  let input = $state(1);
  let doubled = $derived(input * 2);
  let quadrupled = $derived(doubled * 2);
</script>

<p>{quadrupled}</p>
```

`tests/integration/fixtures/effect-component.svelte`:

```svelte
<script>
  let count = $state(0);
  let log = $state('');

  $effect(() => {
    log = `count is ${count}`;
  });
</script>

<button onclick={() => count++}>Inc</button><p>{log}</p>
```

`tests/integration/fixtures/nested-reactivity.svelte`:

```svelte
<script>
  let user = $state({ name: 'Alice', address: { city: 'Paris' } });
</script>

<input bind:value={user.name} /><p>{user.address.city}</p>
```

**Step 3: Write integration tests**

Create `tests/integration/plugin-output.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

async function buildFixture(filename: string, enablePlugin = true): Promise<string> {
  const input = resolve(FIXTURES_DIR, filename);

  const result = await build({
    root: FIXTURES_DIR,
    plugins: [svelte(), ...(enablePlugin ? [svelteDevtools()] : [])],
    build: {
      write: false,
      lib: {
        entry: input,
        formats: ['es'],
      },
      rollupOptions: {
        external: ['svelte', 'svelte/internal/client'],
      },
    },
    logLevel: 'silent',
  });

  const output = Array.isArray(result) ? result[0] : result;
  const chunk = output.output.find((o: any) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('No chunk output');
  return chunk.code;
}

describe('plugin output verification', () => {
  it('injects bridge import in instrumented output', async () => {
    const code = await buildFixture('basic-counter.svelte');
    expect(code).toContain('__svelte_devtools__');
  });

  it('instruments $.push for component tracking', async () => {
    const code = await buildFixture('basic-counter.svelte');
    expect(code).toContain('onPush');
  });

  it('instruments $.pop for render timing', async () => {
    const code = await buildFixture('basic-counter.svelte');
    expect(code).toContain('onPop');
  });

  it('instruments signal registration for state', async () => {
    const code = await buildFixture('basic-counter.svelte');
    expect(code).toContain('registerSignal');
  });

  it('instruments derived chains', async () => {
    const code = await buildFixture('derived-chain.svelte');
    expect(code).toContain('registerSignal');
    // Should have multiple signal registrations
    const matches = code.match(/registerSignal/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('instruments $effect with registerEffect', async () => {
    const code = await buildFixture('effect-component.svelte');
    expect(code).toContain('registerEffect');
  });

  it('instruments $.set with preMutation/onMutation', async () => {
    const code = await buildFixture('basic-counter.svelte');
    expect(code).toContain('preMutation');
    expect(code).toContain('onMutation');
  });

  it('produces no instrumentation when plugin is disabled', async () => {
    const code = await buildFixture('basic-counter.svelte', false);
    expect(code).not.toContain('__svelte_devtools__');
    expect(code).not.toContain('onPush');
  });

  it('handles nested reactive objects', async () => {
    const code = await buildFixture('nested-reactivity.svelte');
    expect(code).toContain('__svelte_devtools__');
  });
});
```

**Step 4: Run integration tests**

```bash
cd tests && npx vitest run --config vitest.config.ts
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: add integration tests for plugin output verification"
```

---

## Task 8: Playwright Setup + E2E Runtime Tests

**Files:**

- Create: `tests/playwright.config.ts`
- Create: `tests/e2e/runtime/component-tree.spec.ts`
- Create: `tests/e2e/runtime/state-inspection.spec.ts`
- Create: `tests/e2e/runtime/reactivity-graph.spec.ts`
- Create: `tests/e2e/runtime/profiler.spec.ts`
- Create: `tests/e2e/runtime/update-tracer.spec.ts`
- Modify: `package.json` (add playwright deps + scripts)

**Step 1: Install Playwright**

```bash
pnpm add -Dw @playwright/test
npx playwright install chromium
```

**Step 2: Create Playwright config**

Create `tests/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'runtime',
      testDir: './e2e/runtime',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'extension',
      testDir: './e2e/extension',
      use: {
        ...devices['Desktop Chrome'],
        // Extension tests need special Chrome launch args
        launchOptions: {
          args: [
            `--disable-extensions-except=${process.cwd()}/../packages/extension/dist`,
            `--load-extension=${process.cwd()}/../packages/extension/dist`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter docs dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

**Step 3: Write e2e runtime tests**

Create `tests/e2e/runtime/component-tree.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Component Tree', () => {
  test('bridge initializes and exposes __svelte_devtools__', async ({ page }) => {
    await page.goto('/demos/counter');
    const bridge = await page.evaluate(() => !!window.__svelte_devtools__);
    expect(bridge).toBe(true);
  });

  test('bridge emits bridge:ready message', async ({ page }) => {
    const readyPromise = page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        window.addEventListener('message', (e) => {
          if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'bridge:ready') {
            resolve(true);
          }
        });
        setTimeout(() => resolve(false), 5000);
      });
    });

    await page.goto('/demos/counter');
    const ready = await readyPromise;
    expect(ready).toBe(true);
  });

  test('getTree returns component nodes after mount', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500); // wait for components to mount

    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__?.getTree() ?? [];
    });

    expect(tree.length).toBeGreaterThan(0);
    // Should find the Counter component in the tree
    const counter = tree.find((n: any) => n.name === 'Counter');
    expect(counter).toBeDefined();
  });

  test('component tree includes parent-child relationships', async ({ page }) => {
    await page.goto('/demos/context');
    await page.waitForTimeout(500);

    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__?.getTree() ?? [];
    });

    // Should have at least parent and child context components
    expect(tree.length).toBeGreaterThanOrEqual(2);
    // At least one node should have a parentId
    const hasChild = tree.some((n: any) => n.parentId !== null);
    expect(hasChild).toBe(true);
  });
});
```

Create `tests/e2e/runtime/state-inspection.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('State Inspection', () => {
  test('counter state updates on click', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Get initial state
    const initialTree = await page.evaluate(() => window.__svelte_devtools__?.getTree() ?? []);
    const counter = initialTree.find((n: any) => n.name === 'Counter');
    expect(counter).toBeDefined();

    // Click increment button
    await page.click('[data-testid="counter-increment"]');
    await page.waitForTimeout(200);

    // Verify DOM updated
    const value = await page.textContent('[data-testid="counter-value"]');
    expect(value).toBe('1');
  });

  test('state snapshot contains registered signals', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Request state snapshot via bridge
    const signals = await page.evaluate(() => {
      return new Promise<any[]>((resolve) => {
        const tree = window.__svelte_devtools__?.getTree() ?? [];
        const counter = tree.find((n: any) => n.name === 'Counter');
        if (!counter) {
          resolve([]);
          return;
        }

        window.addEventListener('message', function handler(e) {
          if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'state:snapshot') {
            window.removeEventListener('message', handler);
            resolve(e.data.payload.signals);
          }
        });

        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'inspect:component', id: counter.id },
          },
          '*',
        );

        setTimeout(() => resolve([]), 3000);
      });
    });

    expect(signals.length).toBeGreaterThan(0);
    const countSignal = signals.find((s: any) => s.label === 'count');
    expect(countSignal).toBeDefined();
  });
});
```

Create `tests/e2e/runtime/reactivity-graph.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Reactivity Graph', () => {
  test('buildGraph returns nodes and edges for effect chain', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);

    const graph = await page.evaluate(() => {
      return window.__svelte_devtools__?.buildGraph(null) ?? { nodes: [], edges: [] };
    });

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // Should have source nodes (signals)
    const sources = graph.nodes.filter((n: any) => n.type === 'source');
    expect(sources.length).toBeGreaterThan(0);
  });

  test('graph snapshot message is emitted on request', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);

    const snapshot = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('message', function handler(e) {
          if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'graph:snapshot') {
            window.removeEventListener('message', handler);
            resolve(e.data.payload);
          }
        });

        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'graph:request' },
          },
          '*',
        );

        setTimeout(() => resolve(null), 3000);
      });
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot.nodes.length).toBeGreaterThan(0);
  });
});
```

Create `tests/e2e/runtime/profiler.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Profiler', () => {
  test('captures render timings after profiling start', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const profilerData = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        // Start profiling
        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'profiler:start' },
          },
          '*',
        );

        // Trigger a re-render by clicking
        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLElement;
        if (btn) btn.click();

        // Wait a tick, then stop profiling
        setTimeout(() => {
          window.addEventListener('message', function handler(e) {
            if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'profiler:data') {
              window.removeEventListener('message', handler);
              resolve(e.data.payload);
            }
          });

          window.postMessage(
            {
              source: 'svelte-devtools-pro',
              payload: { type: 'profiler:stop' },
            },
            '*',
          );

          setTimeout(() => resolve(null), 3000);
        }, 200);
      });
    });

    expect(profilerData).not.toBeNull();
    // Profiler data should contain timings (may be empty if re-render was too fast to capture)
    expect(profilerData).toHaveProperty('timings');
    expect(profilerData).toHaveProperty('effectTimings');
  });
});
```

Create `tests/e2e/runtime/update-tracer.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Update Tracer', () => {
  test('emits trace:update on state mutation', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const trace = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('message', function handler(e) {
          if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'trace:update') {
            window.removeEventListener('message', handler);
            resolve(e.data.payload.trace);
          }
        });

        // Trigger a mutation
        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLElement;
        if (btn) btn.click();

        setTimeout(() => resolve(null), 3000);
      });
    });

    expect(trace).not.toBeNull();
    expect(trace).toHaveProperty('rootCause');
    expect(trace.rootCause).toHaveProperty('signalLabel');
    expect(trace).toHaveProperty('chain');
    expect(trace).toHaveProperty('timestamp');
  });

  test('trace includes old and new values', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const trace = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        window.addEventListener('message', function handler(e) {
          if (e.data?.source === 'svelte-devtools-pro' && e.data?.payload?.type === 'trace:update') {
            window.removeEventListener('message', handler);
            resolve(e.data.payload.trace);
          }
        });

        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLElement;
        if (btn) btn.click();

        setTimeout(() => resolve(null), 3000);
      });
    });

    expect(trace).not.toBeNull();
    expect(trace.rootCause.oldValue).toBeDefined();
    expect(trace.rootCause.newValue).toBeDefined();
  });
});
```

**Step 4: Add test scripts to root package.json**

```json
{
  "test:e2e": "playwright test --config tests/playwright.config.ts --project runtime",
  "test:e2e:extension": "playwright test --config tests/playwright.config.ts --project extension"
}
```

**Step 5: Add TypeScript global declarations for test files**

Create `tests/e2e/global.d.ts`:

```ts
interface Window {
  __svelte_devtools__?: {
    getTree(): any[];
    buildGraph(componentId: string | null): { nodes: any[]; edges: any[] };
    componentMap: Map<string, any>;
    signalMap: Map<any, any>;
    effectMap: Map<string, any>;
    startProfiling(): void;
    stopProfiling(): { timings: any[]; effectTimings: any[] };
  };
}
```

**Step 6: Run e2e runtime tests**

```bash
pnpm run test:e2e
```

Expected: tests pass (may need adjustments based on actual bridge behavior).

**Step 7: Commit**

```bash
git add tests/ package.json
git commit -m "test: add Playwright e2e runtime tests"
```

---

## Task 9: E2E Extension Tests

**Files:**

- Create: `tests/e2e/extension/panel-renders.spec.ts`
- Create: `tests/e2e/extension/state-editing.spec.ts`

These tests load the Chrome extension and verify the DevTools panel works.

**Step 1: Write extension tests**

Create `tests/e2e/extension/panel-renders.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Extension Panel', () => {
  test('extension loads and badge appears on Svelte page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/demos/counter');
    await page.waitForTimeout(1000);

    // Verify bridge initialized (extension should detect Svelte)
    const bridgeReady = await page.evaluate(() => !!window.__svelte_devtools__);
    expect(bridgeReady).toBe(true);
  });
});
```

Create `tests/e2e/extension/state-editing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('State Editing via Bridge', () => {
  test('editing state via bridge updates DOM', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Get counter component and its count signal
    const edited = await page.evaluate(() => {
      const tree = window.__svelte_devtools__?.getTree() ?? [];
      const counter = tree.find((n: any) => n.name === 'Counter');
      if (!counter) return false;

      // Find the count signal
      for (const [signal, meta] of window.__svelte_devtools__!.signalMap) {
        if (meta.label === 'count' && meta.componentId === counter.id) {
          // Direct state edit via bridge message
          window.postMessage(
            {
              source: 'svelte-devtools-pro',
              payload: {
                type: 'state:edit',
                signalId: meta.id,
                path: [],
                value: 42,
              },
            },
            '*',
          );
          return true;
        }
      }
      return false;
    });

    expect(edited).toBe(true);

    // Wait for DOM update
    await page.waitForTimeout(200);

    // Verify DOM reflects the edited value
    const value = await page.textContent('[data-testid="counter-value"]');
    expect(value).toBe('42');
  });
});
```

**Step 2: Run extension tests**

```bash
pnpm run test:e2e:extension
```

Expected: tests pass. Note: extension tests may need adjustment based on how Chrome loads the extension.

**Step 3: Commit**

```bash
git add tests/e2e/extension/
git commit -m "test: add e2e extension tests for panel rendering and state editing"
```

---

## Task 10: GitHub Actions CI

**Files:**

- Create: `.github/workflows/pr.yml`
- Create: `.github/workflows/main.yml`

**Step 1: Create PR workflow**

Create `.github/workflows/pr.yml`:

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run format:check

  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run check

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test
      - name: Run integration tests
        run: cd tests && npx vitest run --config vitest.config.ts

  test-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Install Playwright
        run: npx playwright install chromium --with-deps
      - name: Run e2e runtime tests
        run: xvfb-run pnpm run test:e2e

  test-e2e-extension:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Install Playwright
        run: npx playwright install chromium --with-deps
      - name: Run e2e extension tests
        run: xvfb-run pnpm run test:e2e:extension
```

**Step 2: Create main workflow**

Create `.github/workflows/main.yml`:

```yaml
name: Main Branch

on:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run format:check

  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run check

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test
      - name: Run integration tests
        run: cd tests && npx vitest run --config vitest.config.ts

  test-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Install Playwright
        run: npx playwright install chromium --with-deps
      - name: Run e2e runtime tests
        run: xvfb-run pnpm run test:e2e

  test-e2e-extension:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Install Playwright
        run: npx playwright install chromium --with-deps
      - name: Run e2e extension tests
        run: xvfb-run pnpm run test:e2e:extension

  build-extension:
    runs-on: ubuntu-latest
    needs: [lint, check, test-unit, test-e2e, test-e2e-extension]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Upload extension artifact
        uses: actions/upload-artifact@v4
        with:
          name: chrome-extension
          path: packages/extension/dist/
```

**Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflows for PR and main branch"
```

---

## Task 11: Root Package Scripts + Final Wiring

**Files:**

- Modify: `package.json` (consolidate all scripts)
- Modify: `.gitignore` (add Playwright artifacts)

**Step 1: Update root package.json scripts**

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter playground dev",
    "dev:docs": "pnpm --filter docs dev",
    "check": "pnpm -r check",
    "test": "pnpm -r test",
    "test:integration": "cd tests && npx vitest run --config vitest.config.ts",
    "test:e2e": "playwright test --config tests/playwright.config.ts --project runtime",
    "test:e2e:extension": "playwright test --config tests/playwright.config.ts --project extension",
    "test:all": "pnpm run test && pnpm run test:integration && pnpm run test:e2e",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

**Step 2: Update .gitignore**

Add:

```
test-results/
playwright-report/
blob-report/
```

**Step 3: Run the full test suite to verify everything works**

```bash
pnpm run build
pnpm run lint
pnpm run format:check
pnpm run check
pnpm run test
pnpm run test:integration
pnpm run test:e2e
```

**Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: consolidate scripts and add Playwright artifacts to gitignore"
```

---

## Task Summary

| Task | Description                             | Estimated Steps |
| ---- | --------------------------------------- | --------------- |
| 1    | ESLint + Prettier setup                 | 7               |
| 2    | Unit tests: protocol validation         | 3               |
| 3    | Unit tests: service worker routing      | 5               |
| 4    | SvelteKit docs site scaffold            | 6               |
| 5    | Docs site: layout + documentation pages | 5               |
| 6    | Docs site: feature demo pages           | 5               |
| 7    | Integration tests: plugin output        | 5               |
| 8    | Playwright + e2e runtime tests          | 7               |
| 9    | E2e extension tests                     | 3               |
| 10   | GitHub Actions CI                       | 3               |
| 11   | Root scripts + final wiring             | 4               |

**Dependencies:**

- Tasks 1-3 are independent, can run in parallel
- Task 4 must complete before Tasks 5-6
- Task 5 must complete before Task 6
- Tasks 4-6 must complete before Tasks 8-9 (e2e tests need the docs app)
- Task 7 is independent (uses fixtures, not docs app)
- Task 10 is independent (just workflow files)
- Task 11 depends on all other tasks
