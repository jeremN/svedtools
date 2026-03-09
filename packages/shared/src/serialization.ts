import type {
  SerializedValue,
  SerializedObject,
  SerializedArray,
  SerializedDomNode,
  SerializedCircularRef,
  SerializedTruncated,
} from './types.js';

export interface SerializeOptions {
  /** Maximum depth before truncating (default: 3) */
  maxDepth?: number;
  /** Maximum array items to preview (default: 5) */
  maxArrayPreview?: number;
  /** Maximum object keys to preview (default: 5) */
  maxObjectPreview?: number;
  /** Maximum string length before truncating (default: 200) */
  maxStringLength?: number;
  /** Current path for lazy expansion references */
  basePath?: string;
}

const DEFAULT_OPTIONS: Required<SerializeOptions> = {
  maxDepth: 3,
  maxArrayPreview: 5,
  maxObjectPreview: 5,
  maxStringLength: 200,
  basePath: '',
};

/**
 * Safely serialize a value for transport over postMessage.
 * Handles Svelte Proxies, circular references, DOM nodes, and deep objects.
 */
export function serialize(value: unknown, options: SerializeOptions = {}): SerializedValue {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const seen = new WeakSet<object>();
  return serializeInner(value, 0, opts, seen, opts.basePath);
}

/**
 * Serialize a value at a specific path for lazy expansion.
 * Used by the panel to fetch children of dehydrated objects/arrays.
 */
export function serializeAtPath(
  root: unknown,
  path: string[],
  options: SerializeOptions = {},
): SerializedValue | Record<string, SerializedValue> {
  let current: unknown = root;

  // Navigate to the target
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { __type: 'truncated', reason: `Invalid path at "${key}"` };
    }
    const obj = unwrapProxy(current as Record<string | symbol, unknown>);
    if (Array.isArray(obj)) {
      const idx = Number(key);
      if (Number.isNaN(idx) || idx < 0 || idx >= obj.length) {
        return { __type: 'truncated', reason: `Array index "${key}" out of bounds` };
      }
      current = obj[idx];
    } else {
      current = (obj as Record<string, unknown>)[key];
    }
  }

  // Serialize all children at this level
  const unwrapped =
    current && typeof current === 'object' ? unwrapProxy(current as Record<string | symbol, unknown>) : current;

  if (Array.isArray(unwrapped)) {
    const result: Record<string, SerializedValue> = {};
    for (let i = 0; i < unwrapped.length; i++) {
      result[String(i)] = serialize(unwrapped[i], { ...options, maxDepth: 2 });
    }
    return result;
  }

  if (unwrapped && typeof unwrapped === 'object') {
    const result: Record<string, SerializedValue> = {};
    let keys: string[];
    try {
      keys = Object.keys(unwrapped);
    } catch {
      return { __type: 'truncated', reason: 'Failed to enumerate keys' };
    }
    for (const key of keys) {
      result[key] = serialize((unwrapped as Record<string, unknown>)[key], { ...options, maxDepth: 2 });
    }
    return result;
  }

  return serialize(current, options);
}

function serializeInner(
  value: unknown,
  depth: number,
  opts: Required<SerializeOptions>,
  seen: WeakSet<object>,
  path: string,
): SerializedValue {
  // Primitives pass through directly
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'boolean' || t === 'number') return value as number | boolean;
  if (t === 'bigint') return `${value}n`;

  if (t === 'string') {
    const s = value as string;
    if (s.length > opts.maxStringLength) {
      return s.slice(0, opts.maxStringLength) + '...';
    }
    return s;
  }

  if (t === 'symbol') return `Symbol(${(value as symbol).description ?? ''})`;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  if (t === 'function') return `fn ${(value as Function).name || 'anonymous'}()`;

  // From here on, value is an object
  const obj = value as Record<string | symbol, unknown>;

  // Unwrap Svelte Proxy if present
  const raw = unwrapProxy(obj);

  // Circular reference detection
  if (seen.has(raw)) {
    return { __type: 'circular', path } satisfies SerializedCircularRef;
  }
  seen.add(raw);

  // DOM Node
  if (isDomNode(raw)) {
    return serializeDomNode(raw as unknown as Element);
  }

  // Depth limit
  if (depth >= opts.maxDepth) {
    return {
      __type: 'truncated',
      reason: `Max depth (${opts.maxDepth}) reached`,
    } satisfies SerializedTruncated;
  }

  // Array
  if (Array.isArray(raw)) {
    return serializeArray(raw, depth, opts, seen, path);
  }

  // Map
  if (raw instanceof Map) {
    const entries = Array.from(raw.entries()).slice(0, opts.maxObjectPreview);
    const preview = `Map(${raw.size}) {${entries.map(([k, v]) => `${String(k)} => ${previewValue(v)}`).join(', ')}}`;
    return {
      __type: 'object',
      preview,
      childCount: raw.size,
      path: path || undefined,
    } satisfies SerializedObject;
  }

  // Set
  if (raw instanceof Set) {
    const items = Array.from(raw).slice(0, opts.maxArrayPreview);
    const preview = `Set(${raw.size}) {${items.map(previewValue).join(', ')}}`;
    return {
      __type: 'object',
      preview,
      childCount: raw.size,
      path: path || undefined,
    } satisfies SerializedObject;
  }

  // Date
  if (raw instanceof Date) {
    return raw.toISOString();
  }

  // RegExp
  if (raw instanceof RegExp) {
    return raw.toString();
  }

  // Error
  if (raw instanceof Error) {
    return `${raw.name}: ${raw.message}`;
  }

  // Plain object
  return serializeObject(raw, depth, opts, seen, path);
}

function serializeArray(
  arr: unknown[],
  depth: number,
  opts: Required<SerializeOptions>,
  seen: WeakSet<object>,
  path: string,
): SerializedArray {
  const preview = arr.slice(0, opts.maxArrayPreview).map(previewValue).join(', ');

  return {
    __type: 'array',
    length: arr.length,
    preview: `[${preview}${arr.length > opts.maxArrayPreview ? ', ...' : ''}]`,
    path: path || undefined,
  };
}

function serializeObject(
  obj: Record<string | symbol, unknown>,
  depth: number,
  opts: Required<SerializeOptions>,
  seen: WeakSet<object>,
  path: string,
): SerializedObject | SerializedTruncated {
  let keys: string[];
  try {
    keys = Object.keys(obj);
  } catch {
    return { __type: 'truncated', reason: 'Failed to enumerate keys' };
  }
  const previewKeys = keys.slice(0, opts.maxObjectPreview);
  let preview: string;
  try {
    preview = previewKeys.map((k) => `${k}: ${previewValue(obj[k])}`).join(', ');
  } catch {
    preview = '{...}';
  }

  return {
    __type: 'object',
    preview: `{${preview}${keys.length > opts.maxObjectPreview ? ', ...' : ''}}`,
    childCount: keys.length,
    path: path || undefined,
  };
}

function serializeDomNode(el: Element): SerializedDomNode {
  return {
    __type: 'dom',
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: el.className || null,
  };
}

/** Quick one-line preview of a value (no recursion) */
function previewValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const t = typeof value;
  if (t === 'string') {
    const s = value as string;
    return `"${s.length > 30 ? s.slice(0, 30) + '...' : s}"`;
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'function') return `fn()`;
  if (t === 'symbol') return `Symbol()`;

  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isDomNode(value)) return `<${(value as Element).tagName.toLowerCase()}>`;

  return '{...}';
}

/** Unwrap Svelte 5 Proxy using the _RAW symbol or $.unwrap */
function unwrapProxy(obj: Record<string | symbol, unknown>): Record<string | symbol, unknown> {
  // Svelte uses Symbol.for('state') or the _RAW symbol internally
  const STATE_SYMBOL = Symbol.for('state');
  if (STATE_SYMBOL in obj) {
    const raw = obj[STATE_SYMBOL];
    if (raw && typeof raw === 'object') return raw as Record<string | symbol, unknown>;
  }
  return obj;
}

function isDomNode(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).nodeType === 'number';
}
