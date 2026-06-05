---
name: Svelte 5 DevTools
description: A precise, native-feeling Svelte 5 inspector. Dark tool panel, light docs, one flame.
colors:
  flame: 'oklch(0.66 0.24 36)'
  flame-strong: 'oklch(0.55 0.21 32)'
  flame-text: 'oklch(0.74 0.17 45)'
  panel-sunken: 'oklch(0.2 0.006 255)'
  panel-base: 'oklch(0.245 0.006 255)'
  panel-raised: 'oklch(0.285 0.007 255)'
  panel-overlay: 'oklch(0.325 0.008 255)'
  panel-ink: 'oklch(0.965 0.003 255)'
  panel-text: 'oklch(0.86 0.004 255)'
  panel-muted: 'oklch(0.705 0.006 255)'
  docs-bg: 'oklch(0.985 0.001 255)'
  docs-surface: 'oklch(0.968 0.002 255)'
  docs-ink: 'oklch(0.27 0.02 265)'
  docs-muted: 'oklch(0.5 0.015 265)'
  docs-border: 'oklch(0.9 0.004 255)'
  val-string: 'oklch(0.78 0.1 150)'
  val-number: 'oklch(0.82 0.07 215)'
  val-boolean: 'oklch(0.75 0.09 250)'
  val-key: 'oklch(0.76 0.1 310)'
  status-ok: 'oklch(0.74 0.13 150)'
  status-warn: 'oklch(0.8 0.12 85)'
  status-danger: 'oklch(0.66 0.18 25)'
  code-bg: 'oklch(0.21 0.006 255)'
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: 'clamp(2.4rem, 6vw, 3.4rem)'
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: '-0.03em'
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 'normal'
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'system-ui, -apple-system, sans-serif'
    fontSize: '10px'
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: '0.1em'
rounded:
  sm: '3px'
  md: '4px'
  docs-sm: '6px'
  docs-md: '10px'
  pill: '999px'
spacing:
  '1': '2px'
  '2': '4px'
  '3': '6px'
  '4': '8px'
  '5': '12px'
  '6': '16px'
components:
  panel-tab-active:
    textColor: '{colors.panel-ink}'
    padding: '8px 16px'
  panel-tab-idle:
    textColor: '{colors.panel-muted}'
    padding: '8px 16px'
  signal-badge:
    backgroundColor: '{colors.panel-overlay}'
    textColor: '{colors.panel-muted}'
    rounded: '{rounded.sm}'
    padding: '1px 6px'
    typography: '{typography.mono}'
  button-primary:
    backgroundColor: '{colors.flame-strong}'
    textColor: '#ffffff'
    rounded: '{rounded.docs-sm}'
    padding: '0.6rem 1.3rem'
  button-ghost:
    textColor: '{colors.docs-ink}'
    rounded: '{rounded.docs-sm}'
    padding: '0.6rem 1.3rem'
  topic-card:
    backgroundColor: '{colors.docs-bg}'
    textColor: '{colors.docs-ink}'
    rounded: '{rounded.docs-md}'
    padding: '1.15rem 1.25rem'
  code-block:
    backgroundColor: '{colors.code-bg}'
    textColor: '{colors.panel-text}'
    rounded: '{rounded.docs-md}'
    padding: '1.25rem 1.4rem'
    typography: '{typography.mono}'
---

# Design System: Svelte 5 DevTools

## 1. Overview

**Creative North Star: "The Built-In Instrument"**

This system has one job: make Svelte's runtime reactivity legible without ever pulling focus from the data it reveals. The tool should feel like it shipped inside Chrome DevTools, an instrument that was always there, not a third-party add-on bolted on. Everything chrome-like recedes; the inspected state, dependency graph, and timing are the only things meant to be looked at.

It spans two surfaces that read as one product. The **panel** (the Chrome DevTools extension) is dark, dense, and native to the browser's bottom dock. The **docs site** is light, calm, and editorial-clean, but it carries the same flame identity and renders its code in the panel's own dark surface, so the marketing site and the tool never look like strangers. The unifying move is restraint: a single Svelte-flame accent spent only where it earns attention, neutral identifiers carried by weight rather than hue, and a calm functional palette reserved for the values themselves.

It explicitly rejects the generic-SaaS dashboard (card grids, gradient hero-metrics, marketing chrome around a developer tool), loud over-branding (large flame surfaces competing with the data), anything that clashes when docked beside Chrome's own Elements and Console panels, and the cluttered gray-on-gray low-contrast look that makes dense tools hard to scan.

**Key Characteristics:**

- Data is the hero; chrome is silent.
- One flame accent, spent on exactly one thing in view at a time.
- Identifiers are neutral; meaning comes from weight, position, and shape, not a color zoo.
- Every text/background pair clears WCAG AA (≥ 4.5:1); status and type never rely on color alone.
- One token layer per surface; no raw hex in component styles.

## 2. Colors

A near-monochrome system in OKLCH, lit by a single Svelte-flame accent and a calm, desaturated palette reserved strictly for inspected values.

### Primary

- **Svelte Flame** (`oklch(0.66 0.24 36)`, #ff3e00): The brand. On the dark panel it marks exactly one thing at a time, selection, focus ring, active-tab underline, the dirty-node ring in the graph, the "Svelte detected" dot. On the light docs it carries large headings and the logo mark.
- **Flame Strong** (`oklch(0.55 0.21 32)`, #d02200): The legible flame for small text on light surfaces, docs links, primary buttons, body emphasis. Raw flame fails AA as small text on near-white; this is the same flame, darkened just enough to clear 4.5:1.
- **Flame Text** (`oklch(0.74 0.17 45)`): The legible flame for small text on dark surfaces, tracer signal labels, root-cause emphasis. The dark-surface mirror of Flame Strong.

### Secondary — The Functional Value Palette

A unified, low-chroma palette used **only** to type inspected values (in the state inspector, value tree, tracer, and tooltips). It is editor-adjacent so a Svelte developer reads it on reflex, and it is calmed so it never vibrates against the neutral chrome.

- **String Green** (`oklch(0.78 0.1 150)`): string values.
- **Number Cyan** (`oklch(0.82 0.07 215)`): numeric values and all profiler timings.
- **Boolean Blue** (`oklch(0.75 0.09 250)`): boolean values.
- **Key Violet** (`oklch(0.76 0.1 310)`): object keys and DOM identifiers.

### Tertiary — Semantic Status

- **OK Green** (`oklch(0.74 0.13 150)`): connected, new-value-after-change, idle record button.
- **Warn Amber** (`oklch(0.8 0.12 85)`): waiting-for-Svelte, untested-version banner, mid render-cost heat.
- **Danger Red** (`oklch(0.66 0.18 25)`): disconnected, removed-value, high render-cost heat.

### Neutral

Two ramps, one per surface, both faintly cool (hue 255–265), near-zero chroma.

- **Panel Ramp (dark)** — `panel-sunken` (`oklch(0.2 …)`, status bar/frame) → `panel-base` (`0.245`, the main surface) → `panel-raised` (`0.285`, tab bar/toolbars) → `panel-overlay` (`0.325`, tooltips/inputs/selected). Text: `panel-ink` (`0.965`, names/headings), `panel-text` (`0.86`, body/values), `panel-muted` (`0.705`, labels/empty states).
- **Docs Ramp (light)** — `docs-bg` (`oklch(0.985 …)`) → `docs-surface` (`0.968`, sidebar) → inline-code surface (`0.935`). Text: `docs-ink` (`0.27`), `docs-muted` (`0.5`). Border `docs-border` (`0.9`). Code blocks on docs use the panel's `code-bg` (`0.21`) so they read as the tool.

### Named Rules

**The One Flame Rule.** The flame marks exactly one thing in the current view at a time (active / selected / focused / detected / dirty). If everything is flame, nothing is. Accent coverage stays under ~10% of any surface.

**The Neutral-Identifier Rule.** Component names, signal names, and headings are neutral ink, never a brand or secondary color. Their prominence comes from weight and position. The retired tan accent (`#e8ab6a`) is forbidden.

**The Shape-Not-Hue Rule.** In the reactivity graph, node type is encoded by shape (circle = source, diamond = derived, square = effect), never by color. This keeps the graph colour-blind-safe and preserves flame-only.

## 3. Typography

**Display Font:** system-ui sans (docs hero only)
**Body / UI Font:** system-ui sans (`system-ui, -apple-system, 'Segoe UI', sans-serif`)
**Mono Font:** `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`

**Character:** Honest, system-native, engineered. No display typeface dresses up the tool, the panel reads like the browser it lives in, and the docs lean on weight and scale contrast rather than a novelty face. Monospace is load-bearing, not decorative: it carries every component name, value, and timing where digit alignment and code-likeness matter.

### Hierarchy

- **Display** (800, `clamp(2.4rem, 6vw, 3.4rem)`, 1.05, `-0.03em`, `text-wrap: balance`): docs hero headline only.
- **Headline** (700, 1.4rem, docs `h2` / 600, 14px panel section headers): section breaks.
- **Title** (600, 13–14px): component/signal names, table headers, card heads.
- **Body** (400, 13px panel / `clamp(1.05rem, 2.2vw, 1.25rem)` docs lead, 1.65): prose and value rows. Docs prose capped at ~40–54rem measure.
- **Label** (600, 10px, `0.1em`, UPPERCASE): sidebar section labels, panel detail-section titles. Reserved for ≤ 2-word labels.

### Named Rules

**The Mono-For-Data Rule.** Anything that is code, a value, an identifier, or a timing is set in the mono font with `tabular-nums` on numeric columns. UI labels and prose are set in the UI sans. Never mix the two roles.

**The Sentence-Case Rule.** Headings and UI copy are sentence case. Uppercase is reserved for short labels only; never set a sentence or a value in caps.

## 4. Elevation

The system is **flat by doctrine**. Depth is conveyed by tonal layering on the neutral ramp (a half-step lighter surface = "raised"), not by shadows. The panel has no drop shadows anywhere; toolbars, tooltips, and selected rows are distinguished purely by their step on the ramp and, sparingly, a 1px hairline border. This is deliberate: shadows read as "app chrome," and the panel must read as "instrument."

The docs site allows two restrained exceptions, both functional: a subtle `blur(10px)` on the sticky topbar (so content reading underneath stays legible) and a 2px `translateY` lift on topic-card hover (a state response, not ambient decoration).

### Named Rules

**The Tonal-Depth Rule.** Layer surfaces with the neutral ramp, not with shadow. If two surfaces need separating, move one a step on the ramp before reaching for a border; reach for a border before reaching for a shadow.

**The State-Only Motion Rule.** Shadow, lift, and blur appear only as a response to state (hover, focus, sticky-scroll) or to convey reactivity (the dirty-node flame pulse). Nothing animates for decoration, and every animation has a `prefers-reduced-motion` fallback that resolves to a static end state.

## 5. Components

### Buttons

- **Shape:** gently rounded (panel `3–4px`; docs `6px`).
- **Primary (docs):** Flame-Strong fill (`#d02200`) with white text (5.4:1), `0.6rem 1.3rem` padding. Hover darkens the flame.
- **Ghost (docs):** transparent fill, `border-strong` outline, ink text; hover shifts the border to flame and the text to Flame-Strong.
- **Panel buttons (Record / Clear / Refresh):** `panel-overlay` fill, `border-default` hairline, `panel-text` label. The Record button is the one tinted exception, a low-opacity status wash (OK green idle, Danger red recording) so its state is unmistakable.
- **Hover / Focus:** 120–140ms ease-out on color only. Focus-visible is always a 2px flame outline.

### Chips (type & status badges)

- **Style:** `panel-overlay` background, `panel-muted` mono text, `3px` radius, `1px 6px` padding. One neutral chip vocabulary across the whole panel.
- **State:** the keyword inside the chip (`$state`, `$derived`, `$props`, `derived`, `effect`, `children`) carries the meaning. Badges are never color-coded by kind, that color zoo is retired.

### Cards / Containers (docs)

- **Corner Style:** `10px` radius.
- **Background:** `docs-bg`; the primary topic card uses a 10% flame wash.
- **Shadow Strategy:** none at rest (see Elevation). Hover lifts 2px and shifts the border to flame.
- **Border:** 1px `docs-border`.
- **Internal Padding:** `1.15rem 1.25rem`.

### Inputs / Fields

- **Style:** `panel-overlay`/`surface` fill, `border-default` 1px stroke, `3px` radius, mono or UI text.
- **Focus:** border shifts to flame; no glow. Placeholder text uses `panel-muted` / `docs-muted` (AA, never a faint gray).

### Navigation

- **Panel tabs:** idle tabs are `panel-muted`; the active tab is `panel-ink` + 600 weight + a 2px flame underline (the native DevTools pattern). Never flame text on a small tab label.
- **Docs sidebar:** muted ink links, uppercase label headers, hover fills with the inline-code surface. Topbar carries a flame logo mark + neutral wordmark.

### Signature Component — The Value Tree

The recursive value inspector is the system's centerpiece. Collapsed previews show object/array shape in neutral ink; expanding reveals children indented under a 1px neutral rail (a tree guide, never a colored side-stripe). Each value is typed by the Functional Value Palette; keys are Key Violet; `null`/truncated are faint italic. Toggling is keyboard-operable and live-refreshes on mutation.

## 6. Do's and Don'ts

### Do:

- **Do** keep the flame to one role in view at a time; accent coverage stays under ~10% of the surface (The One Flame Rule).
- **Do** render identifiers (component/signal/heading) in neutral ink and let weight carry prominence.
- **Do** encode reactivity-graph node type by shape (circle/diamond/square), and pair every status with a shape or label, never color alone.
- **Do** verify every text/background pair at ≥ 4.5:1 (≥ 3:1 for large/bold); bump muted grays toward ink before they dip below.
- **Do** set values, identifiers, and timings in the mono font with `tabular-nums` on numeric columns.
- **Do** convey depth with the neutral ramp first, a 1px hairline second, a shadow never (on the panel).
- **Do** give every animation a `prefers-reduced-motion` fallback that lands on a static, visible end state.

### Don't:

- **Don't** make it look like a generic SaaS dashboard, no card grids, gradient hero-metrics, or marketing chrome wrapped around a developer tool.
- **Don't** over-brand it, no large flame surfaces or splashes competing with the data; brand is one accent plus typography, not drenching.
- **Don't** ship a theme that clashes when docked beside Chrome's Elements / Console panels.
- **Don't** clutter, no gray-on-gray, redundant borders, or low-contrast noise that makes a dense panel hard to scan.
- **Don't** use `border-left`/`border-right` greater than 1px as a colored accent stripe on cards, callouts, or list items.
- **Don't** use gradient text (`background-clip: text`), the hero-metric template, or identical icon-heading-text card grids.
- **Don't** reintroduce the retired tan identifier color (`#e8ab6a`) or color-code type badges by kind.
- **Don't** use em dashes in interface copy; use commas, colons, periods, or parentheses.
