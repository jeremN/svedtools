# Product

## Register

product

## Users

Svelte 5 developers debugging their own apps, mid-session, inside Chrome DevTools. In
practice this is the author and a handful of coworkers: a private, internal tool, not
published to npm or the Chrome Web Store. They reach for it when fine-grained reactivity
gets confusing and `console.log` stops scaling: _why did this `$derived` recompute, what
does this `$state` hold right now, which `$effect` fired, what re-rendered and how often._
They work alongside Chrome's own Console / Elements / Network panels, under time pressure,
and expect a tool that behaves like the panels next to it.

## Product Purpose

A Svelte 5 DevTools suite. A Vite plugin instruments the app at compile time and injects a
runtime bridge; a Chrome extension renders a DevTools panel that reads that bridge and
makes Svelte's reactivity legible at runtime: the component tree, `$state` / `$derived` /
`$effect` inspection with drill-down into nested values, a reactivity dependency graph, a
profiler, and an update tracer. Success is measured against `console.log`: a developer can
answer _"what changed, why, and how expensive was it"_ faster, without the panel ever
getting in the way.

Two surfaces share one identity:

- **Panel** (`packages/extension/src/panel/`) — the primary surface and this document's
  register (`product`). Dark, dense, native to DevTools.
- **Docs site** (`apps/docs/`) — secondary, **brand** register. A light SvelteKit site on
  GitHub Pages that explains, demos, and onboards coworkers to the tool. When designing the
  docs site specifically, treat it as `brand`.

## Brand Personality

**Precise, native, unobtrusive.** It should feel like a first-class Chrome DevTools panel,
as if it shipped with the browser, not a third-party add-on bolted on. Quiet by default;
the inspected data is the hero. Svelte's flame orange (`#ff3e00`) is the single accent,
spent only where it earns attention (active tab, focus ring, "Svelte detected"), never as
decoration. UI copy is terse, technical, and accurate.

## Anti-references

- **Generic SaaS dashboards.** No card grids, gradient hero-metrics, or marketing chrome
  wrapped around a developer tool.
- **Loud / over-branded UI.** No large colored surfaces or flame-orange splashes competing
  with the data. Brand is carried by one accent plus typography, not by drenching.
- **Foreign-feeling custom themes.** It must dock naturally beside Chrome's Elements /
  Console panels. Nothing that looks alien when sat next to them.
- **Cluttered, low-contrast tool UIs.** No gray-on-gray, no redundant borders and dividers,
  no visual noise that makes a dense panel hard to scan.

## Design Principles

- **Data is the hero.** Chrome stays out of the way; every pixel of ink should help read
  state, dependencies, or timing. When in doubt, remove the divider, not the data.
- **Native by imitation, not by theme.** Match DevTools' density, control sizing, and
  dark-panel conventions so the tool feels built in. Borrow the platform's grammar before
  inventing new grammar.
- **One accent, earned.** Flame orange marks exactly one thing in view at a time
  (active / selected / focused / detected). If everything is orange, nothing is.
- **Legible density.** Pack information tightly _and_ keep every text-on-background pair
  scannable. Density is never an excuse for low contrast.
- **Tokens, not hex.** The redesign replaces inline hardcoded colors with one semantic
  token layer, shared across the panel (and the docs site where it makes sense), so the
  whole tool can be re-themed and stays internally consistent.

## Accessibility & Inclusion

_(Derived from the conversation and a pass over the current code; adjust to taste.)_

- **WCAG 2.1 AA.** Body / UI text ≥ 4.5:1, large or bold text ≥ 3:1 against panel
  backgrounds. The current dark palette has gaps to fix in the redesign, e.g. inactive tabs
  render `#888` on `#1e1e1e` (~3.5:1, below AA for small text).
- **Color-blind-safe status.** Connection status currently uses red / amber / orange dots,
  hard to separate under red-green color blindness. Pair every status with a shape or label,
  never color alone.
- **Respect `prefers-reduced-motion`.** Reactivity-graph, profiler, and any reveal motion
  need an instant or crossfade fallback.
- **Don't fight forced-colors / high-contrast mode.** Dark-first to match the DevTools
  default, but degrade gracefully under OS high-contrast.
- **Keyboard-complete.** Tree expansion, tab switching, and value drill-down must be fully
  operable from the keyboard, for a keyboard-heavy developer audience.
