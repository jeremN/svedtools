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

  // Svelte $state proxies enumerate transparently (reads/ownKeys forward to the
  // target, and they expose no detectable marker symbol — Svelte's own
  // $state.snapshot reads through them the same way), so we read the value
  // directly without unwrapping.
  const raw = value as object;
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
  if (raw instanceof Date) return isNaN(raw.getTime()) ? 'Invalid Date' : raw.toISOString();
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

  if (raw instanceof Map) {
    let size: number;
    try {
      size = raw.size;
    } catch {
      size = 0;
    }
    let body: string;
    try {
      const entries = Array.from(raw.entries()).slice(0, PREVIEW_KEYS);
      body = entries.map(([k, v]) => String(k) + ' => ' + previewVal(v)).join(', ');
    } catch {
      body = '...';
    }
    return {
      __type: 'object',
      preview: 'Map(' + size + ') {' + body + (size > PREVIEW_KEYS ? ', ...' : '') + '}',
      childCount: size,
    };
  }

  if (raw instanceof Set) {
    let size: number;
    try {
      size = raw.size;
    } catch {
      size = 0;
    }
    let body: string;
    try {
      const items = Array.from(raw).slice(0, PREVIEW_KEYS);
      body = items.map(previewVal).join(', ');
    } catch {
      body = '...';
    }
    return {
      __type: 'object',
      preview: 'Set(' + size + ') {' + body + (size > PREVIEW_KEYS ? ', ...' : '') + '}',
      childCount: size,
    };
  }

  let keys: string[];
  try {
    keys = Object.keys(raw as object);
  } catch {
    return { __type: 'truncated', reason: 'Cannot enumerate' };
  }
  const previewKeys = keys.slice(0, PREVIEW_KEYS);
  const preview = previewKeys
    .map((k) => {
      let v: unknown;
      try {
        v = (raw as Record<string, unknown>)[k];
      } catch {
        return k + ': [getter threw]';
      }
      return k + ': ' + previewVal(v);
    })
    .join(', ');
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
  if (v instanceof Date) return isNaN((v as Date).getTime()) ? 'Invalid Date' : (v as Date).toISOString();
  if (v instanceof Error) return (v as Error).name;
  if (v instanceof Map) return 'Map(' + v.size + ')';
  if (v instanceof Set) return 'Set(' + v.size + ')';
  return '{...}';
}

const MAX_CHILDREN = 100;

/**
 * Navigate a LIVE value along `path` and serialize one level of children.
 * Used by the bridge's state:expand handler for lazy drill-down. Svelte $state
 * proxies enumerate transparently, so navigation reads through them directly.
 * Returns null when `root` or the navigated value is not an object (e.g.
 * primitive, null) or when the path can't be navigated; a throwing getter
 * degrades to a `truncated` child rather than aborting the whole expansion.
 */
export function serializeChildrenAtPath(root: unknown, path: string[]): Record<string, unknown> | null {
  let current: unknown = root;

  for (const key of path) {
    if (current === null || typeof current !== 'object') return null;
    const container = current as object;
    try {
      if (Array.isArray(container)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= container.length) return null;
        current = container[idx];
      } else if (container instanceof Map) {
        if (!container.has(key)) return null;
        current = container.get(key);
      } else if (container instanceof Set) {
        const idx = Number(key);
        const items = Array.from(container);
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return null;
        current = items[idx];
      } else {
        current = (container as Record<string, unknown>)[key];
      }
    } catch {
      return null;
    }
  }

  if (current === null || typeof current !== 'object') return null;
  const container = current as object;
  const result: Record<string, unknown> = {};

  if (Array.isArray(container)) {
    for (let i = 0; i < Math.min(container.length, MAX_CHILDREN); i++) {
      try {
        result[String(i)] = safeSerialize(container[i]);
      } catch {
        result[String(i)] = { __type: 'truncated', reason: 'getter threw' };
      }
    }
    return result;
  }
  if (container instanceof Map) {
    let i = 0;
    for (const [k, v] of container) {
      if (i++ >= MAX_CHILDREN) break;
      try {
        result[String(k)] = safeSerialize(v);
      } catch {
        result[String(k)] = { __type: 'truncated', reason: 'getter threw' };
      }
    }
    return result;
  }
  if (container instanceof Set) {
    let i = 0;
    for (const v of container) {
      if (i >= MAX_CHILDREN) break;
      try {
        result[String(i)] = safeSerialize(v);
      } catch {
        result[String(i)] = { __type: 'truncated', reason: 'getter threw' };
      }
      i++;
    }
    return result;
  }
  let keys: string[];
  try {
    keys = Object.keys(container as object);
  } catch {
    return null;
  }
  for (const k of keys.slice(0, MAX_CHILDREN)) {
    try {
      result[k] = safeSerialize((container as Record<string, unknown>)[k]);
    } catch {
      result[k] = { __type: 'truncated', reason: 'getter threw' };
    }
  }
  return result;
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
