import { Compat } from './compat.js';

/**
 * Lightweight serializer that runs in the page context. Mirrors the
 * panel-side `serialize()` in @svelte-devtools/shared but inlined here
 * to avoid cross-context imports.
 *
 * Output shapes match the SerializedValue union in shared/src/types.ts.
 */

const MAX_DEPTH = 3;
const MAX_STRING_LEN = 200;
const PREVIEW_KEYS = 5;
const PREVIEW_STRING_LEN = 30;

export function safeSerialize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'boolean' || t === 'number') return value;
  if (t === 'bigint') return (value as bigint) + 'n';
  if (t === 'string') {
    const s = value as string;
    return s.length > MAX_STRING_LEN ? s.slice(0, MAX_STRING_LEN) + '...' : s;
  }
  if (t === 'symbol') return 'Symbol(' + ((value as symbol).description || '') + ')';
  if (t === 'function') return 'fn ' + ((value as { name?: string }).name || 'anonymous') + '()';

  const raw = Compat.unwrapStateProxy(value as object);
  if (seen.has(raw as object)) return { __type: 'circular', path: '' };
  seen.add(raw as object);

  if (raw && typeof (raw as { nodeType?: number }).nodeType === 'number') {
    const el = raw as { tagName?: string; id?: string | null; className?: string | null };
    return {
      __type: 'dom',
      tag: (el.tagName || 'node').toLowerCase(),
      id: el.id || null,
      className: el.className || null,
    };
  }
  if (raw instanceof Date) return raw.toISOString();
  if (raw instanceof RegExp) return raw.toString();
  if (raw instanceof Error) return raw.name + ': ' + raw.message;
  if (depth >= MAX_DEPTH) return { __type: 'truncated', reason: 'Max depth reached' };

  if (Array.isArray(raw)) {
    const preview = raw.slice(0, PREVIEW_KEYS).map(previewVal).join(', ');
    return {
      __type: 'array',
      length: raw.length,
      preview: '[' + preview + (raw.length > PREVIEW_KEYS ? ', ...' : '') + ']',
    };
  }

  let keys: string[];
  try {
    keys = Object.keys(raw as object);
  } catch {
    return { __type: 'truncated', reason: 'Cannot enumerate' };
  }
  const previewKeys = keys.slice(0, PREVIEW_KEYS);
  const preview = previewKeys.map((k) => k + ': ' + previewVal((raw as Record<string, unknown>)[k])).join(', ');
  return {
    __type: 'object',
    preview: '{' + preview + (keys.length > PREVIEW_KEYS ? ', ...' : '') + '}',
    childCount: keys.length,
  };
}

export function previewVal(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') {
    const s = v as string;
    return '"' + (s.length > PREVIEW_STRING_LEN ? s.slice(0, PREVIEW_STRING_LEN) + '...' : s) + '"';
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
  if (t === 'symbol') return 'Symbol()';
  if (Array.isArray(v)) return 'Array(' + v.length + ')';
  if (t === 'function') return 'fn()';
  if (v instanceof Date) return (v as Date).toISOString();
  if (v instanceof Error) return (v as Error).name;
  return '{...}';
}

export function summarizeDomMutation(m: MutationRecord): string {
  if (m.type === 'attributes') {
    const tag = (m.target as Element).tagName?.toLowerCase() || '';
    return tag + '.' + m.attributeName + ' changed';
  }
  if (m.type === 'characterData') return 'text content changed';
  const added = m.addedNodes ? m.addedNodes.length : 0;
  const removed = m.removedNodes ? m.removedNodes.length : 0;
  const parts: string[] = [];
  if (added) parts.push(added + ' added');
  if (removed) parts.push(removed + ' removed');
  return parts.join(', ') || 'children changed';
}
