import { describe, it, expect } from 'vitest';
import { safeSerialize } from './serializer.js';

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
