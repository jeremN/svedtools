/**
 * Element picker — crosshair "pick an element" mode, mirroring the top-left
 * picker in Chrome's Elements panel. While active, hovering the page
 * highlights the hovered element via the existing highlight overlay
 * (showHighlight, imported from ./highlight.js) and a single click resolves
 * the clicked element and reports it back through `onPick`, then stops.
 * Escape cancels (reports `null`). Listeners are installed on the CAPTURE
 * phase so the picker sees events before the page's own handlers, and the
 * whole mouse activation sequence (pointerdown through click) is swallowed
 * so the page never reacts to the pick.
 */

import { showHighlight } from './highlight.js';
import { getSvelteMetaFile } from './svelte-meta.js';

/** Walks up from `target` (self included) to the nearest element carrying Svelte dev-mode location info. */
function resolvePickableElement(target: EventTarget | null): Element | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (getSvelteMetaFile(el)) return el;
    el = el.parentElement;
  }
  return null;
}

let picking = false;
let onPick: ((el: Element | null) => void) | null = null;

// The full activation sequence (pointerdown → mousedown → pointerup →
// mouseup → click) must be swallowed while picking — a page handler on any
// of them would otherwise still fire during a pick (drag starts, focus,
// irreversible work). mousemove is deliberately NOT swallowed: the hover
// highlight rides on it, and pages tracking the cursor stay harmless.
const SWALLOWED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup'] as const;

function swallowEvent(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handleMouseMove(event: MouseEvent): void {
  const el = resolvePickableElement(event.target);
  showHighlight(el ? [el.getBoundingClientRect()] : null);
}

function handleClick(event: MouseEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
  onPick?.(resolvePickableElement(event.target));
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // Cancel is ours alone — the app's own Escape handlers must not fire.
  event.preventDefault();
  event.stopImmediatePropagation();
  onPick?.(null);
}

/**
 * Arms picking mode: installs capture-phase listeners on `document`
 * (mousemove for the hover highlight; click to resolve the pick; keydown
 * for Escape; plus swallow-only handlers for the rest of the mouse
 * activation sequence) and sets a crosshair cursor. `onPick` fires once —
 * on click (with the resolved element, or null if none resolves) or on
 * Escape (always null) — the caller is responsible for calling `stopPicker`
 * afterward (one pick per activation; see bridge/main.ts's picker:start
 * case). Calling while already picking restarts cleanly (no duplicate
 * listeners).
 */
export function startPicker(onPickCallback: (el: Element | null) => void): void {
  if (picking) stopPicker();
  picking = true;
  onPick = onPickCallback;
  document.documentElement.style.cursor = 'crosshair';
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
  for (const type of SWALLOWED_EVENTS) {
    document.addEventListener(type, swallowEvent, true);
  }
}

/** Disarms picking mode: removes listeners, clears the highlight, restores the cursor. Idempotent. */
export function stopPicker(): void {
  if (!picking) return;
  picking = false;
  onPick = null;
  document.documentElement.style.cursor = '';
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  for (const type of SWALLOWED_EVENTS) {
    document.removeEventListener(type, swallowEvent, true);
  }
  showHighlight(null);
}
