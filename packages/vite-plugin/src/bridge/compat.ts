import type { Value, Reaction, ComponentFn } from './types.js';

/**
 * The compat layer is the ONLY module allowed to touch Svelte 5 private
 * internal fields directly. Every other bridge module accesses internals
 * through this object. When Svelte renames `Value.v` or `Reaction.deps`,
 * this is the only file that needs to change.
 *
 * All accessors are read-only — the bridge never mutates Svelte internals.
 */

export const STATE_SYMBOL = Symbol.for('state');
export const FILENAME_SYMBOL = Symbol.for('svelte.filename');

export const Compat = {
  // -- Source signal access --
  getValue(signal: Value): unknown {
    // Outside a tracking context this is an untracked read (safe).
    return signal.v;
  },
  getLabel(target: Value | Reaction): string | null {
    return target.label ?? null;
  },
  getReactions(signal: Value | Reaction): Reaction[] {
    const r = signal.reactions;
    return Array.isArray(r) ? r : [];
  },
  isDirty(target: Value | Reaction): boolean {
    return typeof target.wv === 'number' && typeof target.rv === 'number' && target.wv > target.rv;
  },

  // -- Reaction (effect/derived) access --
  /** Effects have a `teardown` field; deriveds do not. */
  isEffect(r: Reaction): boolean {
    return 'teardown' in r;
  },
  isDerived(r: Reaction): boolean {
    return !('teardown' in r);
  },
  getReactionFn(r: Reaction): ((...args: unknown[]) => unknown) | null {
    return r.fn ?? null;
  },
  getReactionDeps(r: Reaction): unknown[] {
    return Array.isArray(r.deps) ? r.deps : [];
  },
  /** Walks `ctx.function` to identify owning component instance. */
  getOwnerComponentFn(r: Reaction): ComponentFn | null {
    return r.ctx?.function ?? null;
  },
  getDerivedValue(r: Reaction): unknown {
    return r.v;
  },

  // -- Component function metadata --
  getComponentName(fn: ComponentFn | null | undefined): string {
    return fn?.name || 'Unknown';
  },
  getComponentFilename(fn: ComponentFn | null | undefined): string | null {
    if (!fn) return null;
    // Try known symbols and common property names
    for (const key of Object.getOwnPropertySymbols(fn)) {
      const desc = key.description || '';
      if (desc === 'filename' || desc === 'svelte.filename') {
        return (fn as unknown as Record<symbol, string | undefined>)[key] || null;
      }
    }
    // Fallback: check FILENAME_SYMBOL directly
    return (fn as unknown as Record<symbol, string | undefined>)[FILENAME_SYMBOL] || null;
  },

  // -- Proxy unwrap for $state objects --
  unwrapStateProxy<T>(obj: T): T {
    if (obj && typeof obj === 'object' && STATE_SYMBOL in obj) {
      const raw = (obj as unknown as Record<symbol, unknown>)[STATE_SYMBOL];
      if (raw && typeof raw === 'object') return raw as T;
    }
    return obj;
  },
};

/**
 * Range of Svelte versions this bridge is tested against.
 * Update this whenever the compat matrix CI is bumped.
 */
export const TESTED_SVELTE_RANGE = '>=5.0.0 <5.40.0';

/**
 * Detect the running Svelte version and whether it falls inside the
 * tested range. The panel uses this to show a "running an untested
 * Svelte version" banner.
 */
export function detectSvelteVersion(): { version: string; tested: boolean } {
  const version = window.__svelte?.v ?? 'unknown';
  if (version === 'unknown') {
    return { version, tested: false };
  }
  const [maj, min] = version.split('.').map((n) => parseInt(n, 10));
  // Cheap range check: >=5.0 <5.40 — avoids pulling in a semver lib.
  const tested = maj === 5 && Number.isFinite(min) && min < 40;
  return { version, tested };
}
