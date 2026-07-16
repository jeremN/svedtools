import { describe, it, expect } from 'vitest';
import { applyEditAtPath } from './state-editor.js';

describe('applyEditAtPath — top-level and nested assignment', () => {
  it('assigns a top-level key of a plain object and returns true', () => {
    const obj = { name: 'Alice' };
    const ok = applyEditAtPath(obj, ['name'], 'Bob');
    expect(ok).toBe(true);
    expect(obj.name).toBe('Bob');
  });

  it('assigns a deep path', () => {
    const obj = { address: { city: 'Paris', country: 'France' } };
    const ok = applyEditAtPath(obj, ['address', 'city'], 'Lyon');
    expect(ok).toBe(true);
    expect(obj.address.city).toBe('Lyon');
    expect(obj.address.country).toBe('France');
  });
});

describe('applyEditAtPath — array index bounds', () => {
  it('assigns an in-bounds array index and returns true', () => {
    const arr = ['a', 'b'];
    const ok = applyEditAtPath(arr, ['1'], 'z');
    expect(ok).toBe(true);
    expect(arr).toEqual(['a', 'z']);
  });

  it('refuses an out-of-bounds array index (length 2, index 5)', () => {
    const arr = ['a', 'b'];
    const ok = applyEditAtPath(arr, ['5'], 'z');
    expect(ok).toBe(false);
    expect(arr).toEqual(['a', 'b']);
  });

  it('refuses a negative array index', () => {
    const arr = ['a', 'b'];
    const ok = applyEditAtPath(arr, ['-1'], 'z');
    expect(ok).toBe(false);
    expect(arr).toEqual(['a', 'b']);
  });

  it('refuses a non-integer array index', () => {
    const arr = ['a', 'b'];
    const ok = applyEditAtPath(arr, ['x'], 'z');
    expect(ok).toBe(false);
    expect(arr).toEqual(['a', 'b']);
  });
});

describe('applyEditAtPath — missing keys refused', () => {
  it('refuses a missing object key, leaving the object unchanged', () => {
    const obj: Record<string, unknown> = { name: 'Alice' };
    const ok = applyEditAtPath(obj, ['nope'], 'x');
    expect(ok).toBe(false);
    expect(obj).toEqual({ name: 'Alice' });
    expect(Object.prototype.hasOwnProperty.call(obj, 'nope')).toBe(false);
  });
});

describe('applyEditAtPath — Map/Set refusal', () => {
  it('refuses when the walk passes through a Map as an intermediate container', () => {
    const obj = { m: new Map([['k', { v: 1 }]]) };
    const ok = applyEditAtPath(obj, ['m', 'k', 'v'], 2);
    expect(ok).toBe(false);
  });

  it('refuses when the walk passes through a Set as an intermediate container', () => {
    const obj = { s: new Set([{ v: 1 }]) };
    const ok = applyEditAtPath(obj, ['s', '0', 'v'], 2);
    expect(ok).toBe(false);
  });

  it('refuses when the leaf parent is a Map', () => {
    const map = new Map([['k', 1]]);
    const ok = applyEditAtPath(map, ['k'], 2);
    expect(ok).toBe(false);
    expect(map.get('k')).toBe(1);
  });

  it('refuses when the leaf parent is a Set', () => {
    const set = new Set([1, 2]);
    const ok = applyEditAtPath(set, ['0'], 9);
    expect(ok).toBe(false);
    expect(Array.from(set)).toEqual([1, 2]);
  });
});

describe('applyEditAtPath — degenerate inputs', () => {
  it('refuses an empty path', () => {
    const obj = { a: 1 };
    expect(applyEditAtPath(obj, [], 2)).toBe(false);
  });

  it('refuses a primitive root', () => {
    expect(applyEditAtPath(42, ['a'], 1)).toBe(false);
    expect(applyEditAtPath('str', ['a'], 1)).toBe(false);
    expect(applyEditAtPath(null, ['a'], 1)).toBe(false);
  });
});

describe('applyEditAtPath — hostile inputs never throw', () => {
  it('returns false (no throw) when the leaf parent is Object.freeze-d', () => {
    const obj = Object.freeze({ name: 'Alice' });
    expect(() => applyEditAtPath(obj, ['name'], 'Bob')).not.toThrow();
    expect(applyEditAtPath(obj, ['name'], 'Bob')).toBe(false);
    expect(obj.name).toBe('Alice');
  });

  it('returns false (no throw) when a getter on the walk path throws', () => {
    const obj: Record<string, unknown> = {};
    Object.defineProperty(obj, 'boom', {
      enumerable: true,
      get() {
        throw new Error('hostile getter');
      },
    });
    expect(() => applyEditAtPath(obj, ['boom', 'inner'], 1)).not.toThrow();
    expect(applyEditAtPath(obj, ['boom', 'inner'], 1)).toBe(false);
  });
});
