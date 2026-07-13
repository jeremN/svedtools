import { describe, it, expect, vi } from 'vitest';
import { isTestedSvelteVersion, TESTED_SVELTE_RANGE, Compat } from './compat.js';
import type { Reaction } from './types.js';

describe('Compat.getValue — value signal vs object-state proxy', () => {
  it('returns .v for a Value node (has .v, .reactions, .equals)', () => {
    expect(Compat.getValue({ v: 42, reactions: [], equals: () => false } as never)).toBe(42);
  });
  it('returns the proxy itself for an object-state proxy (no .v, reads like the object)', () => {
    // Object/array/Map $state is a transparent proxy — no `.v`/`.reactions`.
    const proxy = { name: 'Ada', address: {} } as Record<PropertyKey, unknown>;
    expect(Compat.getValue(proxy as never)).toBe(proxy);
  });
  it('does not mistake a user object whose keys include v/reactions for a Value node', () => {
    // The discriminator also requires `.equals`, so an object missing it is returned as-is.
    const obj = { v: 1, reactions: [] } as Record<PropertyKey, unknown>;
    expect(Compat.getValue(obj as never)).toBe(obj);
  });
});

// The runtime "tested" classifier gates on the whole tested major (Svelte 5):
// the compat matrix CI exercises 5.0.0 / 5.10.0 / 5.20.0 / 5.x, and the plugin's
// peer range is `svelte: ^5.0.0`. So every 5.x is tested; 6+ is not. This guards
// against the false "untested version" banner that fired when the check capped
// at a stale minor (<5.40) below the shipped 5.56.x.
describe('isTestedSvelteVersion', () => {
  it('treats every Svelte 5.x as tested', () => {
    expect(isTestedSvelteVersion('5.56.1')).toBe(true); // the shipped/pinned version
    expect(isTestedSvelteVersion('5.0.0')).toBe(true);
    expect(isTestedSvelteVersion('5.40.0')).toBe(true); // would have been a false negative before
    expect(isTestedSvelteVersion('5.99.3')).toBe(true);
  });

  it('flags non-5 majors and unknowns as untested', () => {
    expect(isTestedSvelteVersion('6.0.0')).toBe(false);
    expect(isTestedSvelteVersion('4.2.19')).toBe(false);
    expect(isTestedSvelteVersion('unknown')).toBe(false);
    expect(isTestedSvelteVersion('')).toBe(false);
  });

  it('never throws on a malformed version string', () => {
    // Garbage that doesn't begin with the tested major parses to NaN -> untested.
    expect(() => isTestedSvelteVersion('next')).not.toThrow();
    expect(isTestedSvelteVersion('next')).toBe(false);
    // Leading "5" still parses to major 5 via parseInt — documented semantics:
    // we only read the major, so a "5-beta"-style tag counts as the tested major.
    expect(() => isTestedSvelteVersion('5-beta')).not.toThrow();
    expect(isTestedSvelteVersion('5-beta')).toBe(true);
  });
});

describe('Compat.registerComponentTeardown', () => {
  it('registers the cleanup via user_effect and invokes cb when the returned cleanup fires (happy path)', () => {
    // Fake internals namespace: records the effect fn passed to user_effect,
    // mirroring how `$.user_effect(fn)` is called in compiled output.
    let recordedEffect: (() => () => void) | null = null;
    const fakeInternals = {
      user_effect: (fn: () => () => void) => {
        recordedEffect = fn;
      },
    };

    const cb = vi.fn();
    const ok = Compat.registerComponentTeardown(fakeInternals, cb);

    expect(ok).toBe(true);
    expect(recordedEffect).not.toBeNull();
    // The effect body reads nothing reactive — it just returns the cleanup.
    const cleanup = recordedEffect!();
    expect(cb).not.toHaveBeenCalled();
    cleanup();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('returns false when internals has no user_effect function (feature unavailable)', () => {
    expect(Compat.registerComponentTeardown({}, vi.fn())).toBe(false);
    expect(Compat.registerComponentTeardown(null, vi.fn())).toBe(false);
    expect(Compat.registerComponentTeardown({ user_effect: 'not-a-fn' }, vi.fn())).toBe(false);
  });

  it('returns false (never throws) when user_effect itself throws', () => {
    const throwingInternals = {
      user_effect: () => {
        throw new Error('no active component context');
      },
    };
    expect(() => Compat.registerComponentTeardown(throwingInternals, vi.fn())).not.toThrow();
    expect(Compat.registerComponentTeardown(throwingInternals, vi.fn())).toBe(false);
  });
});

describe('TESTED_SVELTE_RANGE', () => {
  it('derives from the tested major (single source of truth, no drift)', () => {
    expect(TESTED_SVELTE_RANGE).toBe('>=5.0.0 <6.0.0');
  });
});

// Shape-based unit tests for the effect/derived discriminator. The mock objects
// below mirror the real Svelte 5.56.1 reaction shapes:
//   - Derived  — reactivity/deriveds.js:80-94, `f: DERIVED | DIRTY`, no teardown.
//   - Effect   — reactivity/effects.js:100-116, `f: type | DIRTY | CONNECTED`
//                where `type` is an effect-family bit, plus a `teardown` slot.
// Flag bit values are from svelte/src/internal/client/constants.js (DERIVED=1<<1,
// EFFECT=1<<2, RENDER_EFFECT=1<<3, DIRTY=1<<11, CONNECTED=1<<9).
//
// These are SHAPE-based unit tests, not live-runtime assertions: they verify the
// classifier against hand-built objects, not against signals produced by a real
// Svelte runtime. A true runtime check (instantiate a real $derived/$effect and
// classify it) belongs in the integration / compat-matrix suite — recommended
// follow-up so the matrix CI catches a shape change on a future Svelte minor.
describe('Compat.isDerived / isEffect (effect-vs-derived classification)', () => {
  // Real bit values mirrored from svelte constants.js.
  const DERIVED = 1 << 1;
  const EFFECT = 1 << 2;
  const RENDER_EFFECT = 1 << 3;
  const DIRTY = 1 << 11;
  const CONNECTED = 1 << 9;

  it('classifies a derived-shaped reaction (DERIVED flag, no teardown) as derived', () => {
    const derived = {
      f: DERIVED | DIRTY,
      v: 42,
      fn: () => 42,
      deps: null,
      reactions: null,
      rv: 0,
      wv: 0,
      // note: no `teardown` field — deriveds don't have one
    } as unknown as Reaction;

    expect(Compat.isDerived(derived)).toBe(true);
    expect(Compat.isEffect(derived)).toBe(false);
  });

  it('classifies a user-effect-shaped reaction (EFFECT flag + teardown) as effect', () => {
    const effect = {
      f: EFFECT | DIRTY | CONNECTED,
      fn: () => {},
      teardown: null,
      deps: null,
      first: null,
      last: null,
      wv: 0,
    } as unknown as Reaction;

    expect(Compat.isEffect(effect)).toBe(true);
    expect(Compat.isDerived(effect)).toBe(false);
  });

  it('classifies a render-effect-shaped reaction (RENDER_EFFECT flag, no EFFECT bit) as effect', () => {
    // Render/block/root effects carry an effect-family bit that is NOT the EFFECT
    // bit and never the DERIVED bit. The flags path must still resolve these to
    // effect via the "no DERIVED, no EFFECT bit -> effect-family" branch.
    const renderEffect = {
      f: RENDER_EFFECT | DIRTY | CONNECTED,
      fn: () => {},
      teardown: null,
      wv: 0,
    } as unknown as Reaction;

    expect(Compat.isEffect(renderEffect)).toBe(true);
    expect(Compat.isDerived(renderEffect)).toBe(false);
  });

  it('falls back to the teardown heuristic when no usable flags are present', () => {
    // Simulates a hypothetical future runtime that drops/renames `f`: classify
    // via the legacy `teardown` marker. An object with teardown -> effect.
    const effectNoFlags = {
      fn: () => {},
      teardown: null,
      wv: 0,
    } as unknown as Reaction;
    expect(Compat.isEffect(effectNoFlags)).toBe(true);
    expect(Compat.isDerived(effectNoFlags)).toBe(false);

    // An object without teardown and without flags -> derived (legacy default).
    const derivedNoFlags = {
      fn: () => 1,
      v: 1,
    } as unknown as Reaction;
    expect(Compat.isDerived(derivedNoFlags)).toBe(true);
    expect(Compat.isEffect(derivedNoFlags)).toBe(false);
  });

  it('ignores a non-numeric flags field and falls back to teardown', () => {
    // If `f` exists but isn't a number, it isn't a recognizable bitfield; the
    // classifier must skip the flags path rather than coercing garbage.
    const weird = {
      f: 'not-a-bitfield',
      teardown: null,
    } as unknown as Reaction;
    expect(Compat.isEffect(weird)).toBe(true);
    expect(Compat.isDerived(weird)).toBe(false);
  });

  it('degrades safely (no throw) on primitives, null, and empty objects', () => {
    // Safe default: unclassifiable input -> derived (isEffect false), keeping it
    // out of the effect-only code paths in main.ts.
    for (const bad of [null, undefined, 0, 1, 'str', true, {}] as unknown[]) {
      const r = bad as unknown as Reaction;
      expect(() => Compat.isDerived(r)).not.toThrow();
      expect(() => Compat.isEffect(r)).not.toThrow();
      expect(Compat.isDerived(r)).toBe(true);
      expect(Compat.isEffect(r)).toBe(false);
    }
  });

  it('keeps isEffect and isDerived as exact complements', () => {
    const samples: unknown[] = [
      { f: DERIVED | DIRTY },
      { f: EFFECT | DIRTY | CONNECTED, teardown: null },
      { f: RENDER_EFFECT, teardown: null },
      { teardown: null },
      {},
      null,
      'nope',
    ];
    for (const s of samples) {
      const r = s as unknown as Reaction;
      expect(Compat.isEffect(r)).toBe(!Compat.isDerived(r));
    }
  });
});
