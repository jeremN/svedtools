# svedtools — Svelte 5 DevTools

A **Vite plugin + Chrome extension** for inspecting Svelte 5 internals: the component
tree, fine-grained reactivity (`$state` / `$derived` / `$effect`), profiling, and update
tracing. The Vite plugin instruments your app at compile time and injects a runtime
bridge; the extension renders a DevTools panel that talks to that bridge.

📖 **Docs site:** https://jeremn.github.io/svedtools/

> [!NOTE]
> This is a **private, coworker-testing** project. It is intentionally **not** published to
> npm and **not** on the Chrome Web Store — you install it from source (below).

## Prerequisites

- **Node** ≥ 24 (see `.nvmrc`)
- **pnpm** ≥ 11 (`corepack enable` will pick up the version pinned in `package.json`)
- **Google Chrome** (the extension loads as an unpacked extension)

## Install & build

```bash
git clone https://github.com/jeremN/svedtools.git
cd svedtools
pnpm install
pnpm build          # builds every workspace package (pnpm -r build)
```

`pnpm build` builds all packages in dependency order, including the two you need to use
the tool:

- `vite-plugin-svelte-devtools` → the Vite plugin
- `@svelte-devtools/extension` → the Chrome extension, output to `packages/extension/dist/`

## Load the extension in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and select **`packages/extension/dist`**

## Try it

The panel only activates against a **dev server** running the Vite plugin (see the gotcha
below). Two ways to get one:

**Playground** (fastest):

```bash
pnpm dev            # playground dev server at http://localhost:5173/
```

Then open the page, launch Chrome DevTools (`Cmd+Option+I`), and select the **Svelte** tab.

**Hands-on demo launcher** — spins up an _isolated_ Chromium with the extension preloaded,
so you don't touch your everyday Chrome profile:

```bash
pnpm dev                              # terminal 1: playground at :5173
node scripts/launch-extension-demo.mjs   # terminal 2: opens Chrome at the playground
```

(Requires the extension to be built — `pnpm build` or
`pnpm --filter @svelte-devtools/extension build` — so `packages/extension/dist` exists.)

To browse the documentation locally instead:

```bash
pnpm dev:docs       # docs site dev server (panel works here too)
```

## Repository layout

```
packages/
  vite-plugin/   vite-plugin-svelte-devtools — compile-time instrumentation + runtime bridge
  extension/     @svelte-devtools/extension  — Chrome DevTools panel
  shared/        @svelte-devtools/shared     — types & protocol shared across the two
apps/
  docs/          @svelte-devtools/docs       — SvelteKit docs site (deployed to GitHub Pages)
playground/      sample Svelte app for manual testing
scripts/         launch-extension-demo.mjs, pin-svelte-version.mjs
tests/           integration + e2e (Playwright)
```

## Common scripts

| Command                     | What it does                                                    |
| --------------------------- | --------------------------------------------------------------- |
| `pnpm build`                | Build all packages                                              |
| `pnpm dev`                  | Playground dev server (:5173)                                   |
| `pnpm dev:docs`             | Docs site dev server                                            |
| `pnpm test`                 | Unit tests across packages                                      |
| `pnpm test:integration`     | Integration tests (`tests/`)                                    |
| `pnpm test:e2e`             | Playwright runtime + playground e2e                             |
| `pnpm test:e2e:extension`   | Playwright against the built extension panel                    |
| `pnpm test:all`             | build + every test suite (unit, integration, both e2e projects) |
| `pnpm check`                | `svelte-check` / `tsc` across packages                          |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                               |
| `pnpm format:check`         | what the CI lint job runs; must pass before pushing             |

## Gotchas

- **The panel won't activate on the deployed docs site.** https://jeremn.github.io/svedtools/
  is a static production build. The Vite plugin is `apply: 'serve'` (dev-only by design), so
  the bridge is never injected into the shipped HTML — the panel will sit on "Waiting for
  Svelte…" forever. Run a dev server (`pnpm dev` or `pnpm dev:docs`) to see it work.
- **pnpm blocking install build scripts.** If pnpm refuses to run a dependency's build
  script (e.g. on pnpm 10/11), allow it with
  `pnpm install --config.verify-deps-before-run=false` or approve the build when prompted.

## Compatibility

The bridge runtime is verified against Svelte `>=5.0.0 <5.40.0`. A weekly CI matrix
([`.github/workflows/compat.yml`](.github/workflows/compat.yml)) re-tests against several
Svelte minors every Monday; the single place that touches Svelte internals is
`Compat.*` in `packages/vite-plugin/src/bridge/compat.ts`.

> **Named signals require newer Svelte.** Labeling `$state` / `$derived` values by their
> source name relies on the compiler emitting the `$.tag(signal, label)` dev helper, which
> is absent on early Svelte 5 (≤ 5.20). On those versions the component tree and update
> tracing still work — only signal _names_ are unavailable.
