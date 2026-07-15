import { describe, it, expect } from 'vitest';
import { safeSerialize, serializeChildrenAtPath } from './serializer.js';

describe('transparent state proxies (no symbol unwrap needed)', () => {
  // Svelte 5 $state object/array proxies enumerate transparently — reads and
  // ownKeys forward to the target, and the proxy exposes no detectable marker
  // symbol (Svelte uses a private Symbol('$state'); $state.snapshot reads through
  // the proxy the same way). A real `new Proxy(target, {})` mimics that; the
  // serializer must handle it by reading through, with no proxy "unwrapping".
  it('serializes a transparent object proxy via forwarded keys', () => {
    const out = safeSerialize(new Proxy({ name: 'Ada', tags: [1, 2] }, {})) as {
      __type: string;
      childCount?: number;
    };
    expect(out.__type).toBe('object');
    expect(out.childCount).toBe(2);
  });
  it('serializes a transparent array proxy as an array', () => {
    const out = safeSerialize(new Proxy([1, 2, 3], {})) as { __type: string; length?: number };
    expect(out.__type).toBe('array');
    expect(out.length).toBe(3);
  });
  it('navigates a transparent proxy with serializeChildrenAtPath', () => {
    const out = serializeChildrenAtPath(new Proxy({ a: { b: 1 } }, {}), ['a']) as Record<string, unknown>;
    expect(out).toEqual({ b: 1 });
  });
});

describe('safeSerialize Map/Set handling', () => {
  it('serializes a Map with entry previews', () => {
    const result = safeSerialize(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    ) as { __type: string; preview: string; childCount: number };
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Map(2)');
    expect(result.preview).toContain('a => 1');
    expect(result.childCount).toBe(2);
  });

  it('serializes a Set with item previews', () => {
    const result = safeSerialize(new Set([1, 2, 3])) as {
      __type: string;
      preview: string;
      childCount: number;
    };
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Set(3)');
    expect(result.childCount).toBe(3);
  });

  it('serializes an empty Map', () => {
    const result = safeSerialize(new Map()) as { __type: string; preview: string; childCount: number };
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Map(0)');
    expect(result.childCount).toBe(0);
  });

  it('serializes an empty Set', () => {
    const result = safeSerialize(new Set()) as { __type: string; preview: string; childCount: number };
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('Set(0)');
    expect(result.childCount).toBe(0);
  });

  it('truncates Map preview beyond PREVIEW_KEYS and keeps full childCount', () => {
    const entries: [string, number][] = [];
    for (let i = 0; i < 8; i++) entries.push(['k' + i, i]);
    const result = safeSerialize(new Map(entries)) as {
      __type: string;
      preview: string;
      childCount: number;
    };
    expect(result.preview).toContain('Map(8)');
    expect(result.preview).toContain(', ...');
    expect(result.childCount).toBe(8);
  });
});

describe('safeSerialize regression sanity', () => {
  it('serializes a plain object', () => {
    const result = safeSerialize({ x: 1, y: 'hi' }) as {
      __type: string;
      preview: string;
      childCount: number;
    };
    expect(result.__type).toBe('object');
    expect(result.preview).toContain('x: 1');
    expect(result.childCount).toBe(2);
  });

  it('serializes an array', () => {
    const result = safeSerialize([1, 2, 3]) as { __type: string; length: number; preview: string };
    expect(result.__type).toBe('array');
    expect(result.length).toBe(3);
    expect(result.preview).toBe('[1, 2, 3]');
  });
});

describe('safeSerialize hostile getters and degenerate values (F8)', () => {
  it('does not throw when a preview property getter throws, and marks it in the preview', () => {
    const o: Record<string, unknown> = { a: 1, c: 3 };
    Object.defineProperty(o, 'boom', {
      enumerable: true,
      get() {
        throw new Error('x');
      },
    });
    let result: { __type: string; preview: string; childCount: number } | undefined;
    expect(() => {
      result = safeSerialize(o) as { __type: string; preview: string; childCount: number };
    }).not.toThrow();
    expect(result!.__type).toBe('object');
    expect(result!.preview).toContain('boom: [getter threw]');
    expect(result!.preview).toContain('a: 1');
    expect(result!.preview).toContain('c: 3');
    expect(result!.childCount).toBe(3);
  });

  it('serializes an Invalid Date as "Invalid Date" without throwing', () => {
    expect(() => safeSerialize(new Date(NaN))).not.toThrow();
    expect(safeSerialize(new Date(NaN))).toBe('Invalid Date');
  });

  it('serializes an Invalid Date nested inside an object preview without throwing', () => {
    let result: { __type: string; preview: string } | undefined;
    expect(() => {
      result = safeSerialize({ when: new Date(NaN) }) as { __type: string; preview: string };
    }).not.toThrow();
    expect(result!.preview).toContain('when: Invalid Date');
  });

  it('still round-trips a valid Date to its ISO string', () => {
    const d = new Date('2024-01-01T00:00:00.000Z');
    expect(safeSerialize(d)).toBe(d.toISOString());
  });

  it('does not throw when a Map subclass throws on entries() iteration', () => {
    class HostileMap extends Map<string, unknown> {
      entries(): MapIterator<[string, unknown]> {
        throw new Error('no entries for you');
      }
    }
    const m = new HostileMap([['a', 1]]);
    let result: { __type: string; preview: string } | undefined;
    expect(() => {
      result = safeSerialize(m) as { __type: string; preview: string };
    }).not.toThrow();
    expect(result!.__type).toBe('object');
    expect(result!.preview).toContain('...');
  });

  it('does not throw when every enumerable property getter throws', () => {
    const o: Record<string, unknown> = {};
    for (const key of ['a', 'b', 'c']) {
      Object.defineProperty(o, key, {
        enumerable: true,
        get() {
          throw new Error(key);
        },
      });
    }
    let result: { __type: string; preview: string; childCount: number } | undefined;
    expect(() => {
      result = safeSerialize(o) as { __type: string; preview: string; childCount: number };
    }).not.toThrow();
    expect(result!.preview).toBe('{a: [getter threw], b: [getter threw], c: [getter threw]}');
    expect(result!.childCount).toBe(3);
  });

  it('does not throw on a hostile array Proxy whose length/slice traps throw', () => {
    const hostile = new Proxy([1, 2, 3], {
      get(t, p) {
        if (p === 'length' || p === 'slice') throw new Error('x');
        return Reflect.get(t, p);
      },
    });
    let result: { __type: string; length: number; preview: string } | undefined;
    expect(() => {
      result = safeSerialize(hostile) as { __type: string; length: number; preview: string };
    }).not.toThrow();
    expect(result!.__type).toBe('array');
    expect(result!.length).toBe(0);
    expect(result!.preview).toContain('...');
  });

  it('previews a hostile element inside an array as [threw], other elements intact', () => {
    class HostileSizeMap extends Map<string, unknown> {
      get size(): number {
        throw new Error('no size');
      }
    }
    let result: { __type: string; preview: string } | undefined;
    expect(() => {
      result = safeSerialize([1, new HostileSizeMap(), 3]) as { __type: string; preview: string };
    }).not.toThrow();
    expect(result!.__type).toBe('array');
    expect(result!.preview).toBe('[1, [threw], 3]');
  });

  it('previews an object property holding a hostile Map/Set as [threw], siblings intact', () => {
    class HostileSizeSet extends Set<unknown> {
      get size(): number {
        throw new Error('no size');
      }
    }
    let result: { __type: string; preview: string; childCount: number } | undefined;
    expect(() => {
      result = safeSerialize({ a: 1, evil: new HostileSizeSet(), z: 'ok' }) as {
        __type: string;
        preview: string;
        childCount: number;
      };
    }).not.toThrow();
    expect(result!.preview).toContain('a: 1');
    expect(result!.preview).toContain('evil: [threw]');
    expect(result!.preview).toContain('z: "ok"');
    expect(result!.childCount).toBe(3);
  });

  it('degrades an Error subclass with a throwing name getter to "Error"', () => {
    class HostileError extends Error {
      get name(): string {
        throw new Error('no name');
      }
    }
    expect(() => safeSerialize(new HostileError('boom'))).not.toThrow();
    expect(safeSerialize(new HostileError('boom'))).toBe('Error');
  });

  it('degrades a RegExp subclass with a throwing toString to "RegExp"', () => {
    class HostileRegExp extends RegExp {
      toString(): string {
        throw new Error('no str');
      }
    }
    expect(() => safeSerialize(new HostileRegExp('a'))).not.toThrow();
    expect(safeSerialize(new HostileRegExp('a'))).toBe('RegExp');
  });
});

describe('serializeChildrenAtPath', () => {
  it('returns one level of object children keyed by key', () => {
    const out = serializeChildrenAtPath({ a: { b: 1 }, c: 2 }, []) as Record<string, { __type?: string }>;
    expect(Object.keys(out)).toEqual(['a', 'c']);
    expect(out.c).toBe(2);
    expect(out.a.__type).toBe('object');
  });
  it('navigates into a nested object path', () => {
    const out = serializeChildrenAtPath({ a: { b: { x: 1 } } }, ['a', 'b']) as Record<string, unknown>;
    expect(out).toEqual({ x: 1 });
  });
  it('navigates into an array index', () => {
    const out = serializeChildrenAtPath({ list: [{ v: 1 }, { v: 2 }] }, ['list', '1']) as Record<string, unknown>;
    expect(out).toEqual({ v: 2 });
  });
  it('navigates into a Map by key and lists Map entries', () => {
    const m = new Map<string, unknown>([['k', { n: 1 }]]);
    expect(serializeChildrenAtPath(m, [])).toHaveProperty('k');
    expect(serializeChildrenAtPath(m, ['k'])).toEqual({ n: 1 });
  });
  it('returns null for an out-of-bounds index or invalid path', () => {
    expect(serializeChildrenAtPath({ list: [1] }, ['list', '5'])).toBeNull();
    expect(serializeChildrenAtPath({ a: 1 }, ['a', 'b'])).toBeNull();
  });
  it('navigates into a Set by index', () => {
    const s = new Set([{ a: 1 }, { b: 2 }]);
    expect(serializeChildrenAtPath(s, ['1'])).toEqual({ b: 2 });
  });
  it('does not throw on a hostile getter — yields a truncated child', () => {
    const obj = {
      get boom() {
        throw new Error('no');
      },
      ok: 1,
    };
    const out = serializeChildrenAtPath(obj, []) as Record<string, { __type?: string }>;
    expect(out.ok).toBe(1);
    expect(out.boom.__type).toBe('truncated');
  });
});
