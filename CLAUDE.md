# CLAUDE.md

Svelte 5 DevTools — a Vite plugin (compile-time instrumentation + runtime bridge) plus a Chrome extension panel. pnpm workspace.

## Toolchain

- **Node ≥ 24 (LTS), pnpm ≥ 11.** pnpm version is sourced from the `packageManager` field — workflows use `pnpm/action-setup@v4` with **no `version:` input** (setting both errors).
- **Build-script allowlist lives in `pnpm-workspace.yaml` under `allowBuilds:` (pnpm 11 key), _not_ `package.json` `onlyBuiltDependencies` (pnpm ≤10).** Only `esbuild` is approved. A new dep with a postinstall will fail CI with `ERR_PNPM_IGNORED_BUILDS` until added there.

## Before you push (CI gates that bite)

- `pnpm format` before committing — the `lint` job runs `prettier --check .` and fails on any unformatted file. The Svelte MCP autofixer checks correctness, not Prettier style.
- `pnpm install --frozen-lockfile` to catch lockfile / build-approval issues. Plain `pnpm install` can pass locally via a warm store or a global pnpm build approval that CI doesn't have — `--frozen-lockfile` is what CI runs.

## Architecture

- **All Svelte 5 internal access goes through `Compat.*` in `packages/vite-plugin/src/bridge/compat.ts`** — the single chokepoint for version compatibility. Keep `TESTED_SVELTE_RANGE` there in sync with the compat matrix.
- The transform (`packages/vite-plugin/src/transform.ts`) is a **post-compile AST pass** that wraps emitted `$.method()` calls. It can only instrument helpers the compiler emits — e.g. signal _naming_ needs `$.tag`, which Svelte ≤ 5.20 doesn't emit (the integration test skips that assertion when absent).
- The plugin is **`apply: 'serve'` (dev-only)**. The panel is intentionally inert on prod/static builds — the deployed docs site shows a banner explaining this. Run a dev server to use the tool.
- Extension UI is shipped as a prebuilt `packages/extension/dist/` (loaded unpacked). Its build-time Svelte version is irrelevant to user compatibility.

## CI

- `compat.yml` (weekly, Mon 06:00 UTC) builds/tests **only `vite-plugin` + `shared`** (the transform/bridge — the real cross-version surface), not the prebuilt extension UI. It skips e2e by design.
- Dependabot (`.github/dependabot.yml`) groups minor/patch into one weekly PR; majors come individually.

## Commands

```bash
pnpm dev            # playground dev server (:5173) — main way to exercise the tool
pnpm dev:docs       # docs site dev server
pnpm build          # build all packages
pnpm check          # svelte-check / tsc across packages
pnpm test           # unit (all packages)
pnpm test:integration
pnpm test:e2e       # Playwright (runtime); needs browsers installed
node scripts/launch-extension-demo.mjs   # hands-on: isolated Chrome with the extension preloaded
```

## Conventions

- Conventional-commits subject lines, short, no multi-paragraph body.
- Private/coworker project: **not** published to npm or the Chrome Web Store — install from source.
- TS 6: `ignoreDeprecations: "6.0"` in `tsconfig.base.json` silences tsup's internal `baseUrl`. This is a TS-7 time-bomb (TS 7 removes `baseUrl`) — revisit on the next tsup bump.
