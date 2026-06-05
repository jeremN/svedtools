import type { BridgeToPanelMessage, NodeId, SerializedValue } from '@svelte-devtools/shared';
import { SvelteSet } from 'svelte/reactivity';
import { send } from './connection.svelte.js';

const REFRESH_DEBOUNCE_MS = 50;

type Entry = { status: 'loading' | 'ready' | 'error'; children?: Record<string, SerializedValue> };

// Cache key = rootId + path joined by the NUL char '\u0000', which can't appear
// in a property name, so keys never collide regardless of dotted/spaced keys.
const SEP = '\u0000';
function key(rootId: NodeId, path: string[]): string {
  return [rootId, ...path].join(SEP);
}

let cache: Record<string, Entry> = $state({});
// openKeys mirrors which (rootId,path) are expanded. SvelteSet keeps $derived(isOpen(…)) reactive.
const openKeys = new SvelteSet<string>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function isOpen(rootId: NodeId, path: string[]): boolean {
  return openKeys.has(key(rootId, path));
}

export function entry(rootId: NodeId, path: string[]): Entry | undefined {
  return cache[key(rootId, path)];
}

export function toggle(rootId: NodeId, path: string[]): void {
  const k = key(rootId, path);
  if (openKeys.has(k)) {
    openKeys.delete(k);
    const next = { ...cache };
    delete next[k];
    cache = next;
    return;
  }
  openKeys.add(k);
  cache = { ...cache, [k]: { status: 'loading' } };
  send({ type: 'state:expand', rootId, path });
}

export function processExpansionMessage(message: BridgeToPanelMessage): void {
  if (message.type !== 'state:expanded') return;
  const k = key(message.rootId, message.path);
  if (!openKeys.has(k)) return; // collapsed before the reply arrived
  cache = {
    ...cache,
    [k]: message.children === null ? { status: 'error' } : { status: 'ready', children: message.children },
  };
}

export function refreshAllOpen(): void {
  for (const k of openKeys) {
    const [rootId, ...path] = k.split(SEP);
    send({ type: 'state:expand', rootId, path });
  }
}

/** Debounced live refresh: re-inspect the selected component (top-level) + re-fetch open paths. */
export function scheduleLiveRefresh(selectedComponentId: NodeId | null): void {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (selectedComponentId) send({ type: 'inspect:component', id: selectedComponentId });
    refreshAllOpen();
  }, REFRESH_DEBOUNCE_MS);
}

export function resetExpansion(): void {
  openKeys.clear();
  cache = {};
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
