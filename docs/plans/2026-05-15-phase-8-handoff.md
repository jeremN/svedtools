# Phase 8 Handoff — 2026-05-15

## Where the project is

| Surface          | State                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `main` branch    | 6 commits ahead of pre-session state, all CI green                                                   |
| Docs site        | Live at https://jeremn.github.io/svedtools/                                                          |
| Compat matrix CI | Installed, fires Mondays 06:00 UTC against Svelte `[5.0.0, 5.10.0, 5.20.0, 5.x]` — **never run yet** |
| Privacy posture  | Private/coworker-only (no npm publish, no Chrome Web Store)                                          |
| Hands-on demo    | `scripts/launch-extension-demo.mjs` committed; uses isolated Chrome profile                          |

## What got shipped in phase 8 (commits, top → bottom)

```
85cac67 chore(scripts): add hands-on extension demo launcher
27f0e89 fix(playground): break effect_update_depth_exceeded cycle in EffectChain
fb22993 ci(docs): auto-enable GitHub Pages on first workflow run
353ab19 ci: add weekly Svelte version compat matrix
cb4b9f5 refactor(bridge): extract page-context runtime to TS modules with Svelte compat layer
bec3d1a ci: deploy docs site to GitHub Pages
```

Key change: the 782-line stringified bridge in `runtime-inject.ts` is now a real TypeScript module set under `packages/vite-plugin/src/bridge/` (`types`, `compat`, `serializer`, `highlight`, `main`). `Compat.*` in `compat.ts` is the single place that touches Svelte 5 internals (signal.v, reactions, rv/wv, ctx.function, the two symbols). `tsup` builds it as `dist/bridge.js`; `runtime-inject.ts` reads it at plugin init.

A version probe runs once at bridge boot — if the running Svelte is outside `TESTED_SVELTE_RANGE` (`>=5.0.0 <5.40.0`), `bridge:ready` carries `untested: true` and the panel shows a yellow banner.

## Three things to do next, in priority order

### 1. Manually validate the compat matrix before its first scheduled run

It's installed but never executed. `pin-svelte-version.mjs` could have a bug, `--no-frozen-lockfile` could resolve something pathological — better to find out now than from Monday's CI email.

```bash
gh workflow run compat.yml
gh run watch
```

Expected: 4 matrix rows, each installing a different Svelte minor, all green on build + unit + integration. Red rows mean either a real compat issue (interesting) or a workflow bug (boring, fix immediately).

### 2. Write a root `README.md` for coworker onboarding

A landing page on GitHub currently shows zero orientation. Minimum useful content:

- One-paragraph "what this is" (link to docs site).
- Install steps for coworkers:
  ```bash
  git clone …
  pnpm install
  pnpm --filter vite-plugin-svelte-devtools build
  pnpm --filter @svelte-devtools/extension build
  # chrome://extensions → Developer mode → Load unpacked → packages/extension/dist
  ```
- Pointer to `scripts/launch-extension-demo.mjs` for hands-on testing without touching real Chrome.
- Known gotcha: `--config.verify-deps-before-run=false` flag if pnpm 11 complains about ignored builds.

### 3. Document (or fix) the deployed-docs UX trap

The public docs at `jeremn.github.io/svedtools/` are a **prod** build. The Vite plugin has `apply: 'serve'`, so the bridge is NOT injected there. A coworker who installs the extension and opens it on the live docs URL gets "Waiting for Svelte..." forever and assumes the tool is broken.

Pick one:

- **(a)** Add a one-line banner on the docs landing page: _"The panel won't activate on this static site — clone the repo and run `pnpm dev:docs` (or the playground) to see it work."_
- **(b)** Build the docs site with the bridge always injected (drop `apply: 'serve'` or use a special prod-demo mode). More invasive; not recommended unless coworker friction proves real.

Bet: (a) is the right call. Five minutes of work, prevents a silent first-impression failure.

## Smaller things worth knowing

- **`enablement: true` in `docs.yml`** is now a harmless no-op (Pages is enabled). Safe to remove in a future cleanup; not worth a dedicated commit.
- **CI compat matrix skips e2e** by design (slower; transform + bridge are already exercised by unit + integration). If you ever see a panel-rendering regression on a new Svelte version, the matrix won't catch it — manual e2e on the affected version is needed.
- **`registerEffect` in `bridge/main.ts` pushes to `node.stateIds`** (line ~233). Inherited from pre-phase-8 code, but it looks wrong — effect IDs probably belong in `node.effectIds`. Worth a quick verification when next touching that file. Low impact (purely cosmetic data routing in the panel).
- **The playground's `EffectChain.svelte` was a latent bug** (effect cycle via `Array.push`) that all 92+ tests missed because the playground isn't covered by e2e. A grep for `\$state\(\[\]\).*\$effect.*push\(` in the playground/docs would surface siblings if any. Worth a one-time pass.

## Memory entries written

Saved under `~/.claude/projects/-Users-jeremienehlil-Documents-Code-Personal-svedtools/memory/`:

- `user-git-identity` — `jeremne@gmail.com` (user qualified with "if i remember") + the env-var workaround for committer.
- `user-concurrent-projects` — viamichelin work on port 5173; never `pkill -f "vite"`.
- `project-privacy-posture` — no publish, coworker-only.
- `project-svelte-compat-strategy` — `Compat.*` discipline + the weekly matrix.
- `project-hands-on-demo` — two-terminal launcher flow with pnpm + Chrome quirks.
- `feedback-test-with-real-browser` — green CI doesn't mean working feature.
- `feedback-commit-granularity` — per-area commits; explicit push authorization.

## Resolution — 2026-06-03

All three "next" items above are **done** and landed on `main` (commits `26c425a..bb22e43`):

1. **Compat matrix validated** — the manual run surfaced two real issues, both fixed:
   - Signal naming needs the `$.tag` compiler helper (absent on Svelte ≤ 5.20); the integration assertions now skip on versions that don't emit it.
   - The `copy-extension-assets` Vite plugin was masking a real Svelte-5.10 `esrap` compile error in `App.svelte` behind an ENOENT — it now bails when `dist/` is absent so the real error surfaces.
   - Root insight: the matrix was rebuilding the prebuilt extension UI against old Svelte (tests nothing real). It now builds/tests only the transform + bridge packages. All four rows (5.0.0 / 5.10.0 / 5.20.0 / 5.x) are green.
2. **Root `README.md`** added for coworker onboarding.
3. **Static-docs banner** added (`{#if !dev}` on the home page) and verified live on the deployed site.

Also checked from "Smaller things worth knowing":

- The suspected `registerEffect → node.stateIds` mis-routing is **not present** in current code — `registerEffect` correctly pushes to `node.effectIds` (`bridge/main.ts:272`). Likely resolved in the phase-8 bridge-to-TS refactor (`cb4b9f5`).
