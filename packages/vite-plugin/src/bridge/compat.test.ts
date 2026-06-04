import { describe, it, expect } from 'vitest';
import { isTestedSvelteVersion, TESTED_SVELTE_RANGE } from './compat.js';

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

describe('TESTED_SVELTE_RANGE', () => {
  it('derives from the tested major (single source of truth, no drift)', () => {
    expect(TESTED_SVELTE_RANGE).toBe('>=5.0.0 <6.0.0');
  });
});
