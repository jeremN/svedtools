/**
 * Highlight overlay — draws an orange rectangle over the bounding box of
 * DOM elements belonging to a component. Used by the panel's component
 * tree hover-to-highlight feature.
 */

const HIGHLIGHT_CACHE_TTL = 500; // ms
const MAX_ELEMENTS = 10000;

let overlay: HTMLDivElement | null = null;
let cache: { componentId: string | null; elements: Element[]; timestamp: number } = {
  componentId: null,
  elements: [],
  timestamp: 0,
};

export function showHighlight(rects: DOMRect[] | null): void {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'svelte-devtools-highlight';
    overlay.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #ff3e00;background:rgba(255,62,0,0.1);transition:all 0.15s;';
    document.body.appendChild(overlay);
  }
  if (!rects || rects.length === 0) {
    overlay.style.display = 'none';
    return;
  }
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  for (const r of rects) {
    if (r.top < top) top = r.top;
    if (r.left < left) left = r.left;
    if (r.bottom > bottom) bottom = r.bottom;
    if (r.right > right) right = r.right;
  }
  overlay.style.display = 'block';
  overlay.style.top = top + 'px';
  overlay.style.left = left + 'px';
  overlay.style.width = right - left + 'px';
  overlay.style.height = bottom - top + 'px';
}

/**
 * Walks the DOM looking for elements whose `__svelte_meta.file` matches
 * the given filename. Results are cached briefly because hover events
 * fire fast and full-DOM walks aren't cheap.
 */
export function findDomElementsByFilename(componentId: string, filename: string | null): Element[] {
  if (!filename) return [];
  const now = performance.now();
  if (cache.componentId === componentId && now - cache.timestamp < HIGHLIGHT_CACHE_TTL) {
    return cache.elements;
  }
  const elements: Element[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let el: Node | null;
  let count = 0;
  while ((el = walker.nextNode()) && count < MAX_ELEMENTS) {
    count++;
    const meta = (el as Element).__svelte_meta;
    if (!meta || !meta.file) continue;
    if (meta.file === filename || meta.file.endsWith('/' + filename)) {
      elements.push(el as Element);
    }
  }
  cache = { componentId, elements, timestamp: now };
  return elements;
}
