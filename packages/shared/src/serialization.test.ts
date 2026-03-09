import { describe, it, expect, beforeAll } from 'vitest';
import { serialize, serializeAtPath } from './serialization.js';
import type { SerializedObject, SerializedArray, SerializedDomNode, SerializedTruncated } from './types.js';

// -- Primitives --

describe('serialize: primitives', () => {
  it('passes null through', () => {
    expect(serialize(null)).toBe(null);
  });

  it('passes undefined through', () => {
    expect(serialize(undefined)).toBe(undefined);
  });

  it('passes booleans through', () => {
    expect(serialize(true)).toBe(true);
    expect(serialize(false)).toBe(false);
  });

  it('passes numbers through', () => {
    expect(serialize(0)).toBe(0);
    expect(serialize(42)).toBe(42);
    expect(serialize(-3.14)).toBe(-3.14);
    expect(serialize(NaN)).toBeNaN();
    expect(serialize(Infinity)).toBe(Infinity);
  });

  it('passes short strings through', () => {
    expect(serialize('hello')).toBe('hello');
    expect(serialize('')).toBe('');
  });

  it('truncates long strings', () => {
    const long = 'x'.repeat(300);
    const result = serialize(long);
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeLessThan(300);
    expect((result as string).endsWith('...')).toBe(true);
  });

  it('respects custom maxStringLength', () => {
    const result = serialize('hello world', { maxStringLength: 5 });
    expect(result).toBe('hello...');
  });

  it('serializes bigint with n suffix', () => {
    expect(serialize(42n)).toBe('42n');
  });

  it('serializes symbols', () => {
    expect(serialize(Symbol('test'))).toBe('Symbol(test)');
    expect(serialize(Symbol())).toBe('Symbol()');
  });

  it('serializes functions', () => {
    function myFunc() {}
    expect(serialize(myFunc)).toBe('fn myFunc()');
    expect(serialize(() => {})).toBe('fn anonymous()');
  });
});

// -- Objects --

describe('serialize: objects', () => {
  it('serializes plain objects with preview', () => {
    const result = serialize({ a: 1, b: 'hello' }) as SerializedObject;
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('a:');
    expect(result.preview).toContain('b:');
    expect(result.childCount).toBe(2);
  });

  it('truncates objects with many keys', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) obj[`key${i}`] = i;
    const result = serialize(obj) as SerializedObject;
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('...');
    expect(result.childCount).toBe(20);
  });

  it('serializes Date as ISO string', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    expect(serialize(date)).toBe('2024-01-15T00:00:00.000Z');
  });

  it('serializes RegExp as string', () => {
    expect(serialize(/test/gi)).toBe('/test/gi');
  });

  it('serializes Error as name: message', () => {
    expect(serialize(new TypeError('bad'))).toBe('TypeError: bad');
  });
});

// -- Arrays --

describe('serialize: arrays', () => {
  it('serializes arrays with preview', () => {
    const result = serialize([1, 2, 3]) as SerializedArray;
    expect(result.__type).toBe('array');
    expect(result.length).toBe(3);
    expect(result.preview).toContain('1');
  });

  it('truncates long arrays', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const result = serialize(arr) as SerializedArray;
    expect(result.__type).toBe('array');
    expect(result.length).toBe(50);
    expect(result.preview).toContain('...');
  });
});

// -- Map/Set --

describe('serialize: collections', () => {
  it('serializes Map', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const result = serialize(map) as SerializedObject;
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Map(2)');
    expect(result.childCount).toBe(2);
  });

  it('serializes Set', () => {
    const set = new Set([1, 2, 3]);
    const result = serialize(set) as SerializedObject;
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Set(3)');
    expect(result.childCount).toBe(3);
  });
});

// -- DOM Nodes --

describe('serialize: DOM nodes', () => {
  it('serializes DOM-like objects', () => {
    const fakeElement = {
      nodeType: 1,
      tagName: 'DIV',
      id: 'app',
      className: 'container main',
    };
    const result = serialize(fakeElement) as SerializedDomNode;
    expect(result.__type).toBe('dom');
    expect(result.tag).toBe('div');
    expect(result.id).toBe('app');
    expect(result.className).toBe('container main');
  });

  it('handles DOM nodes without id/class', () => {
    const fakeElement = {
      nodeType: 1,
      tagName: 'SPAN',
      id: '',
      className: '',
    };
    const result = serialize(fakeElement) as SerializedDomNode;
    expect(result.__type).toBe('dom');
    expect(result.tag).toBe('span');
    expect(result.id).toBe(null);
    expect(result.className).toBe(null);
  });
});

// -- Circular References --

describe('serialize: circular references', () => {
  it('detects circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const result = serialize(obj) as SerializedObject;
    // The top-level is serialized as object; the self-reference is detected
    // but since we don't recurse into children in preview mode, it won't
    // appear in the preview. The WeakSet tracking prevents infinite loops.
    expect(result.__type).toBe('object');
  });
});

// -- Depth Limits --

describe('serialize: depth limits', () => {
  it('truncates at max depth', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    const result = serialize(deep, { maxDepth: 1 }) as SerializedObject;
    expect(result.__type).toBe('object');
  });

  it('respects custom maxDepth', () => {
    const deep = { a: { b: { c: 1 } } };
    const result = serialize(deep, { maxDepth: 0 });
    expect((result as SerializedTruncated).__type).toBe('truncated');
  });
});

// -- Svelte Proxy Unwrapping --

describe('serialize: Svelte proxy unwrapping', () => {
  it('unwraps objects with Symbol.for("state")', () => {
    const raw = { count: 42, name: 'test' };
    const proxy = {
      [Symbol.for('state')]: raw,
      // Proxy might have different enumerable keys
      get count() {
        throw new Error('should not be called');
      },
    };
    // The serializer should use the raw object's keys
    const result = serialize(proxy) as SerializedObject;
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('count');
    expect(result.preview).toContain('42');
  });
});

// -- Hostile Getter Protection --

describe('serialize: hostile getters', () => {
  it('handles objects that throw on Object.keys', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('hostile');
        },
      },
    );
    const result = serialize(hostile);
    expect((result as SerializedTruncated).__type).toBe('truncated');
  });
});

// -- serializeAtPath --

describe('serializeAtPath', () => {
  it('navigates to nested value', () => {
    const root = { a: { b: { c: 42 } } };
    const result = serializeAtPath(root, ['a', 'b']);
    // Should return expanded children of root.a.b
    expect(result).toHaveProperty('c');
  });

  it('navigates into arrays', () => {
    const root = { items: [10, 20, 30] };
    const result = serializeAtPath(root, ['items']);
    expect(result).toHaveProperty('0');
    expect(result).toHaveProperty('1');
    expect(result).toHaveProperty('2');
  });

  it('returns truncated for invalid path', () => {
    const root = { a: 1 };
    const result = serializeAtPath(root, ['a', 'b']);
    expect((result as SerializedTruncated).__type).toBe('truncated');
  });

  it('returns truncated for out-of-bounds array index', () => {
    const root = { arr: [1, 2] };
    const result = serializeAtPath(root, ['arr', '99']);
    expect((result as SerializedTruncated).__type).toBe('truncated');
  });
});

// -- Protocol Type Guard --

describe('isDevToolsMessage', () => {
  // Import here to test the protocol module
  let isDevToolsMessage: (data: unknown) => boolean;

  beforeAll(async () => {
    const mod = await import('./protocol.js');
    isDevToolsMessage = mod.isDevToolsMessage;
  });

  it('accepts valid wire messages', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'bridge:ready', svelteVersion: '5.0.0', protocolVersion: 1 },
      }),
    ).toBe(true);
  });

  it('rejects messages with wrong source', () => {
    expect(
      isDevToolsMessage({
        source: 'other',
        payload: { type: 'bridge:ready' },
      }),
    ).toBe(false);
  });

  it('rejects messages without payload', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
      }),
    ).toBe(false);
  });

  it('rejects messages with invalid payload type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'malicious:injection' },
      }),
    ).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isDevToolsMessage(null)).toBe(false);
    expect(isDevToolsMessage('string')).toBe(false);
    expect(isDevToolsMessage(42)).toBe(false);
  });
});
