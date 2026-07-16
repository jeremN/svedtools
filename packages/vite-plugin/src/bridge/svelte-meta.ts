/**
 * Shared reader for the `__svelte_meta` filename Svelte's dev-mode
 * instrumentation stamps on rendered elements. Used by both directions of
 * the element↔component mapping: highlight.ts (componentId → elements) and
 * picker.ts (element → componentId) — keep them consistent by always going
 * through this helper.
 *
 * Shape tolerance: the currently-tested Svelte range (see compat.ts
 * TESTED_SVELTE_RANGE) nests the location as `{ parent, loc: { file, line,
 * column } }` — the source of truth is svelte/src/internal/client/dev/
 * elements.js `assign_location`. Older emissions used the flat
 * `{ file, line, column }` form, so read `loc.file` first and fall back to
 * the flat `file`.
 */
export function getSvelteMetaFile(el: Element): string | null {
  const meta = el.__svelte_meta;
  if (!meta) return null;
  return meta.loc?.file ?? meta.file ?? null;
}
