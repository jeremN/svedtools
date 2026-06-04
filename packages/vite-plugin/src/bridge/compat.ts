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
 * The major Svelte version this bridge's *runtime* internals are validated
 * against. This is the single source of truth: both the human-readable
 * `TESTED_SVELTE_RANGE` string and the runtime `isTestedSvelteVersion` check
 * derive from it, so the displayed range and the actual classifier can't drift.
 *
 * Why a whole major and not a minor cap: the compat matrix CI
 * (.github/workflows/compat.yml) tests `5.0.0`, `5.10.0`, `5.20.0`, and `5.x`
 * (latest 5) — i.e. all of Svelte 5, with no specific minor ceiling. That also
 * matches the plugin's `svelte: ^5.0.0` peer range. Gating on the major (rather
 * than chasing each new minor) means the "untested version" banner fires only
 * for the next breaking line (Svelte 6+), instead of false-flagging every minor
 * bump until someone remembers to nudge a number here.
 *
 * Note: this is the runtime range only. Compile-time signal *naming* has a
 * higher floor — it needs the compiler's `$.tag(signal, label)` dev helper,
 * which early Svelte 5 (<= 5.20) does not emit. On those versions the tree and
 * update tracing still work, but signals appear unlabeled. That is a separate
 * compile-time capability gate (see tests/integration/plugin-output.test.ts),
 * NOT the runtime "tested" flag below.
 */
const TESTED_SVELTE_MAJOR = 5;

/** Human-readable range string for the panel / docs. Derived from the major above. */
export const TESTED_SVELTE_RANGE = `>=${TESTED_SVELTE_MAJOR}.0.0 <${TESTED_SVELTE_MAJOR + 1}.0.0`;

/**
 * Pure classifier — exported for testing. Returns true if `version` is within
 * the tested range (i.e. shares the tested major). Parses only the major so a
 * malformed string ('next', '5-beta', '') never throws; anything that doesn't
 * start with the tested major (including NaN) is treated as untested.
 *
 * Cheap on purpose — avoids pulling in a semver lib for a single major check.
 */
export function isTestedSvelteVersion(version: string): boolean {
  if (!version || version === 'unknown') return false;
  const maj = parseInt(version.split('.')[0], 10);
  return maj === TESTED_SVELTE_MAJOR;
}

/**
 * Detect the running Svelte version and whether it falls inside the
 * tested range. The panel uses this to show a "running an untested
 * Svelte version" banner.
 */
export function detectSvelteVersion(): { version: string; tested: boolean } {
  const version = window.__svelte?.v ?? 'unknown';
  return { version, tested: isTestedSvelteVersion(version) };
}
