import type { Value, Reaction, ComponentFn } from './types.js';

/**
 * The compat layer is the ONLY module allowed to touch Svelte 5 private
 * internal fields directly. Every other bridge module accesses internals
 * through this object. When Svelte renames `Value.v` or `Reaction.deps`,
 * this is the only file that needs to change.
 *
 * All accessors are read-only, with ONE deliberate exception: setValue(), the
 * single write chokepoint for panel-initiated state edits (plan 018). It
 * writes through the app's own `$.set` (captured internals namespace), never
 * by assigning private fields directly.
 */

export const FILENAME_SYMBOL = Symbol.for('svelte.filename');

/**
 * Reaction flag bits, mirrored from Svelte's client runtime.
 * Source (pinned 5.56.1): node_modules/svelte/src/internal/client/constants.js:2-4.
 *
 * Every reaction carries a numeric flags bitfield on its `f` field. A *derived*
 * is always constructed with the `DERIVED` bit set (`f: DERIVED | DIRTY` —
 * reactivity/deriveds.js:72,86), while an *effect* is always constructed from an
 * effect-family type (RENDER_EFFECT / EFFECT / BLOCK_EFFECT / ROOT_EFFECT / … —
 * reactivity/effects.js:86-116, and every create_effect() call site at
 * effects.js:193-437) that NEVER includes the `DERIVED` bit.
 *
 * That makes `(f & DERIVED)` a precise, name-independent discriminator: it does
 * not depend on the private `teardown` field surviving a future refactor. We
 * keep these two bits (rather than the whole table) because they are all the
 * classifier needs — `DERIVED` to positively identify deriveds, `EFFECT` only
 * as a corroborating positive signal for the effect family.
 */
const DERIVED_FLAG = 1 << 1; // svelte constants.js:2 — `export const DERIVED = 1 << 1;`
const EFFECT_FLAG = 1 << 2; // svelte constants.js:3 — `export const EFFECT = 1 << 2;`

/**
 * Read the Svelte reaction flags bitfield (`f`) if it looks like one.
 * Returns the number when `r` is an object carrying a numeric `f`, else null.
 * Localized permissive cast — the `Reaction` type intentionally omits `f`, so
 * we narrow here rather than widening the shared type (matches how the other
 * accessors reach for not-yet-typed internal fields). Never throws on a
 * primitive / null input.
 */
function reactionFlags(r: unknown): number | null {
  if (!r || typeof r !== 'object') return null;
  const f = (r as { f?: unknown }).f;
  return typeof f === 'number' ? f : null;
}

export const Compat = {
  // -- Source signal access --
  getValue(signal: Value): unknown {
    // A primitive/derived $state is a Svelte `Value` node — it holds the value in
    // `.v` alongside the internal `.reactions` list and an `.equals` comparator.
    // Object/array/Map $state is instead a transparent reactive PROXY: it has no
    // `.v` and reads like the plain object, so the proxy itself is the value (the
    // serializer enumerates it directly). We discriminate on the Value node's
    // internal shape — requiring `v` + `reactions` + `equals` together so a user
    // object whose own keys merely include `v` can't be mistaken for a signal.
    if (signal && typeof signal === 'object' && 'v' in signal && 'reactions' in signal && 'equals' in signal) {
      // Outside a tracking context this is an untracked read (safe).
      return signal.v;
    }
    return signal;
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
  /**
   * Layered effect/derived discriminator. The classification underpins the
   * whole reactivity graph, so it must not hinge on one private field name.
   *
   * 1. PRIMARY — the flags bitfield. A derived always has the `DERIVED` bit
   *    set; an effect never does (see DERIVED_FLAG / EFFECT_FLAG above). When
   *    `f` is a readable number we trust it: it survives field renames and is
   *    the authority Svelte itself uses internally.
   * 2. FALLBACK — when `f` is absent/unrecognized (a future runtime that drops
   *    or renames it) but we still have an object, fall back to the historical
   *    `'teardown' in r` heuristic: effects carry a `teardown` slot, deriveds
   *    do not. A flag-less object with neither marker (e.g. `{}`) thus resolves
   *    to "derived", matching the pre-hardening default.
   * 3. DEGRADE — a primitive / null input matches no signal at all. We default
   *    it to "derived" (i.e. `isEffect` false) without throwing, preserving the
   *    pre-hardening behaviour where the absence of an effect marker meant "not
   *    an effect". main.ts treats effect as the complement of derived, so this
   *    keeps an unclassifiable node out of the effect-only code paths.
   *
   * NOTE: `isEffect` and `isDerived` are exact complements by construction, so
   * they can never disagree about a given reaction.
   */
  isDerived(r: Reaction): boolean {
    const f = reactionFlags(r);
    if (f !== null) {
      // PRIMARY: flags are authoritative. A derived has DERIVED; an effect,
      // never. Treat "DERIVED set and no effect bit" as the safe positive.
      if ((f & DERIVED_FLAG) !== 0) return true;
      if ((f & EFFECT_FLAG) !== 0) return false;
      // Recognized-but-ambiguous flags (no DERIVED, no EFFECT bit — e.g. a
      // render/block/root effect). These are all effect-family, so: not derived.
      return false;
    }
    // FALLBACK: no usable flags — lean on the teardown heuristic.
    if (r && typeof r === 'object') return !('teardown' in r);
    // DEGRADE: unclassifiable input -> default to derived.
    return true;
  },
  isEffect(r: Reaction): boolean {
    return !this.isDerived(r);
  },

  /**
   * True when `signal` is a Value node whose flags mark it a derived. Needed
   * because the transform registers $.tag($.state(...)) and
   * $.tag($.derived(...)) identically (registerSignal's type defaults to
   * 'state'), so registration-time meta cannot tell them apart — classify at
   * read time instead. Plain sources carry f: 0 (no DERIVED bit) and resolve
   * false via the flags path; proxies (object $state) are not Value-shaped
   * and return false without consulting flags.
   */
  isDerivedSignal(signal: Value): boolean {
    if (!(signal && typeof signal === 'object' && 'v' in signal && 'reactions' in signal && 'equals' in signal)) {
      return false;
    }
    return this.isDerived(signal as unknown as Reaction);
  },

  /**
   * THE write chokepoint (plan 018): set a source signal's value through the
   * app's own `$.set`, so equality checks, proxying and reaction scheduling
   * stay Svelte's. `internals` is a compiled module's `$` namespace captured
   * by main.ts from onPop. Refuses anything that is not a plain source (not
   * Value-shaped, or derived-flagged) and degrades to false instead of
   * throwing. `should_proxy: true` is safe for primitives — Svelte's proxy()
   * returns non-objects unchanged — and correct for objects assigned into
   * reassignable state.
   */
  setValue(internals: unknown, signal: Value, value: unknown): boolean {
    if (!(signal && typeof signal === 'object' && 'v' in signal && 'reactions' in signal && 'equals' in signal)) {
      return false;
    }
    if (this.isDerivedSignal(signal)) return false;
    const set = (internals as { set?: unknown } | null | undefined)?.set;
    if (typeof set !== 'function') return false;
    try {
      (set as (s: Value, v: unknown, p?: boolean) => unknown)(signal, value, true);
      return true;
    } catch {
      return false;
    }
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

  // -- Component lifecycle --
  /**
   * Registers `cb` to run when the currently-initializing component is destroyed.
   * Uses the compiled module's own internals namespace (`$.user_effect`) so the
   * bridge needs no Svelte import. The effect body reads no reactive state, so it
   * runs once and only its cleanup matters. Returns true when registration
   * succeeded; false = feature unavailable (caller degrades to legacy behavior).
   */
  registerComponentTeardown(internals: unknown, cb: () => void): boolean {
    const ue = (internals as { user_effect?: unknown } | null)?.user_effect;
    if (typeof ue !== 'function') return false;
    try {
      (ue as (fn: () => () => void) => void)(() => cb);
      return true;
    } catch {
      return false;
    }
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
 * malformed string ('next', '5-beta', '') never throws; non-string input (a
 * Set, number, null, …) and anything that doesn't start with the tested major
 * (including NaN) is treated as untested — never a throw.
 *
 * Cheap on purpose — avoids pulling in a semver lib for a single major check.
 */
export function isTestedSvelteVersion(version: string): boolean {
  if (typeof version !== 'string') return false;
  if (!version || version === 'unknown') return false;
  const maj = parseInt(version.split('.')[0], 10);
  return maj === TESTED_SVELTE_MAJOR;
}

/**
 * Detect the running Svelte version and whether it falls inside the
 * tested range. The panel uses this to show a "running an untested
 * Svelte version" banner.
 *
 * Svelte 5's disclose-version module publishes versions as a SET:
 *   ((window.__svelte ??= {}).v ??= new Set()).add(PUBLIC_VERSION)
 * so `v` is `Set<string>` when any Svelte module loaded before us, absent
 * otherwise. A string is also accepted defensively (other tooling / older
 * conventions). Never throws — a failed probe is 'unknown', not a dead bridge.
 */
export function detectSvelteVersion(): { version: string; tested: boolean } {
  let version = 'unknown';
  try {
    const v: unknown = window.__svelte?.v;
    if (typeof v === 'string' && v) {
      version = v;
    } else if (v instanceof Set && v.size > 0) {
      version = String(Array.from(v)[0]);
    }
  } catch {
    // hostile or exotic page globals — report unknown rather than throwing
  }
  return { version, tested: isTestedSvelteVersion(version) };
}
