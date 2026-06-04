import { describe, it, expect } from 'vitest';
import { safeSerialize, serializeChildrenAtPath } from './serializer.js';

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
