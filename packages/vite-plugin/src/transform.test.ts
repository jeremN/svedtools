import { describe, it, expect } from 'vitest';
import { transformSvelteOutput } from './transform.js';

// Minimal compiled Svelte 5 output fixture
const COUNTER_FIXTURE = `
import * as $ from "svelte/internal/client";

var root = $.from_html(\`<div><button>-</button> <span> </span></div>\`);

function Counter($$anchor, $$props) {
  $.check_target(new.target);
  $.push($$props, true, Counter);

  let count = $.tag($.state(0), 'count');
  let doubled = $.tag($.derived(() => $.get(count) * 2), 'doubled');

  var div = root();
  var button = $.child(div);

  $.delegated('click', button, function click() {
    return $.update(count, -1);
  });

  $.append($$anchor, div);
  return $.pop($$exports);
}

export default Counter;
`.trim();

const EFFECT_FIXTURE = `
import * as $ from "svelte/internal/client";

function EffectChain($$anchor, $$props) {
  $.push($$props, true, EffectChain);

  let input = $.tag($.state(1), 'input');
  let processed = $.tag($.state(0), 'processed');

  $.user_effect(() => {
    $.set(processed, $.get(input) * 10);
  });

  return $.pop($$exports);
}
`.trim();

// A member-expression mutation target (e.g. a class $state field compiles to
// `$.set(this.#count, v)`). `obj.x` stands in here — it's a valid standalone
// member expression that exercises the same non-identifier code path. These are
// the cases where a naive multi-splice would re-evaluate a non-trivial target.
const MEMBER_TARGET_FIXTURE = `
import * as $ from "svelte/internal/client";

function MemberTarget($$anchor, $$props) {
  $.push($$props, true, MemberTarget);

  $.delegated('click', button, function click() {
    $.set(obj.x, 5);
    return $.update(obj.x, -1);
  });

  return $.pop($$exports);
}
`.trim();

const PROXY_STATE_FIXTURE = `
import * as $ from "svelte/internal/client";

function Profile($$anchor, $$props) {
  $.push($$props, true, Profile);
  let user = $.tag_proxy($.proxy({ name: 'Ada' }), 'user');
  return $.pop($$exports);
}
`.trim();

// Compiler-emitted update effect for a component with NO user $effect —
// e.g. Counter, which only re-renders its text on click. Modeled on the
// real compiled shape (advisor-verified probe, svelte 5.56.x client+dev):
// `$.template_effect(() => $.set_text(text, $.get(count)));`.
const TEMPLATE_EFFECT_FIXTURE = `
import * as $ from "svelte/internal/client";

function Counter($$anchor, $$props) {
  $.push($$props, true, Counter);

  let count = $.tag($.state(0), 'count');

  var button = $.child($$anchor);
  var text = $.child(button, true);

  $.reset(button);
  $.template_effect(() => $.set_text(text, $.get(count)));

  $.append($$anchor, button);
  return $.pop($$exports);
}
`.trim();

// A user who names their $state binding literally __fn — the template
// effect's callback closes over it, so the instrumentation temp must not
// shadow it (that's why the wrapper binds __sdt_fn, not __fn).
const SHADOW_FN_FIXTURE = `
import * as $ from "svelte/internal/client";

function Shadow($$anchor, $$props) {
  $.push($$props, true, Shadow);

  let __fn = $.tag($.state(0), '__fn');

  var text = $.child($$anchor, true);

  $.template_effect(() => $.set_text(text, $.get(__fn)));

  return $.pop($$exports);
}
`.trim();

// A template_effect that appears BEFORE any $.push in the module (walk
// order): the transform has no lexical component name yet, so the emitted
// wrapRenderEffect call must carry NO second argument.
const TEMPLATE_EFFECT_BEFORE_PUSH_FIXTURE = `
import * as $ from "svelte/internal/client";

$.template_effect(() => $.set_text(text, $.get(count)));

function Counter($$anchor, $$props) {
  $.push($$props, true, Counter);
  return $.pop($$exports);
}
`.trim();

describe('transformSvelteOutput', () => {
  it('returns null for non-Svelte code', () => {
    const result = transformSvelteOutput('const x = 1;', 'test.js');
    expect(result).toBeNull();
  });

  it('instruments $.push with onPush call', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('__svelte_devtools__?.onPush("Counter", $$props, Counter)');
  });

  it('instruments $.pop with onPop call, passing the $ internals namespace', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.code).toContain('__svelte_devtools__?.onPop($)');
  });

  it('instruments $.update with preMutation and onMutation calls', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    // Target is bound to a temp and evaluated once, so pre/onMutation read __sdt_sig
    expect(result!.code).toContain('const __sdt_sig = count;');
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(__sdt_sig)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(__sdt_sig)');
    // The rewritten call passes the temp, preserving the original delta arg
    expect(result!.code).toContain('$.update(__sdt_sig, -1)');
  });

  it('instruments $.user_effect with registerEffect call', () => {
    const result = transformSvelteOutput(EFFECT_FIXTURE, 'EffectChain.svelte');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('__svelte_devtools__?.registerEffect(');
  });

  it('instruments $.template_effect with wrapRenderEffect call, and NOT registerEffect', () => {
    const result = transformSvelteOutput(TEMPLATE_EFFECT_FIXTURE, 'Counter.svelte');
    expect(result).not.toBeNull();
    // Optional-call on the METHOD (`?.(`) — an older bridge missing
    // wrapRenderEffect must degrade, not throw. Component name baked in as a
    // string literal from the preceding $.push's 3rd arg.
    expect(result!.code).toContain('__svelte_devtools__?.wrapRenderEffect?.(__sdt_fn, "Counter")');
    // Timing-only: template effects (including one-per-row {#each} bodies)
    // must never be registered into the effect registry/graph.
    expect(result!.code).not.toContain('registerEffect');
  });

  it('template-effect temp does not shadow a user binding literally named __fn', () => {
    const result = transformSvelteOutput(SHADOW_FN_FIXTURE, 'Shadow.svelte');
    expect(result).not.toBeNull();
    // The instrumentation temp uses a devtools-prefixed name...
    expect(result!.code).toContain('const __sdt_fn = ');
    // ...never `const __fn`, which would shadow the user's closed-over binding
    // (SHADOW_FN_FIXTURE has no $.user_effect, so no other instrumenter may
    // legitimately introduce that temp here).
    expect(result!.code).not.toContain('const __fn');
    // The user's own read survives verbatim inside the callback body.
    expect(result!.code).toContain('$.get(__fn)');
  });

  it('mutation instrumentation does not shadow a user binding literally named __sig', () => {
    // A user whose own signal is named __sig: the pre-sweep transform bound the
    // temp as `const __sig = __sig` (TDZ ReferenceError). The __sdt_ prefix avoids it.
    // Mirrors EFFECT_FIXTURE's scaffold (push + tag + user_effect wrapping $.set) —
    // a bare snippet without a `.push(` call would fail the transform's quick-bail
    // check and never reach the instrumenter.
    const code = `
import * as $ from "svelte/internal/client";

function Shadow($$anchor, $$props) {
  $.push($$props, true, Shadow);

  let __sig = $.tag($.state(0), '__sig');

  $.user_effect(() => {
    $.set(__sig, $.get(__sig) + 1);
  });

  return $.pop($$exports);
}
`.trim();
    const result = transformSvelteOutput(code, 'Shadow.svelte');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('const __sdt_sig = __sig;');
    expect(result!.code).not.toContain('const __sig = __sig');
  });

  it('omits the component-name argument when template_effect precedes any $.push', () => {
    const result = transformSvelteOutput(TEMPLATE_EFFECT_BEFORE_PUSH_FIXTURE, 'Counter.svelte');
    expect(result).not.toBeNull();
    // No lexical owner known yet → single-argument call, no trailing name.
    expect(result!.code).toContain('wrapRenderEffect?.(__sdt_fn) ?? __sdt_fn');
    expect(result!.code).not.toContain('wrapRenderEffect?.(__sdt_fn,');
  });

  it('instruments $.tag with registerSignal call', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.code).toContain('__svelte_devtools__?.registerSignal(__sdt_s, "count")');
    expect(result!.code).toContain('__svelte_devtools__?.registerSignal(__sdt_s, "doubled")');
  });

  it('instruments $.set with preMutation and onMutation calls', () => {
    const result = transformSvelteOutput(EFFECT_FIXTURE, 'EffectChain.svelte');
    // Target is bound to a temp and evaluated once, so pre/onMutation read __sdt_sig
    expect(result!.code).toContain('const __sdt_sig = processed;');
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(__sdt_sig)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(__sdt_sig)');
    // The value arg is left untouched so inner instrumentation there still applies
    expect(result!.code).toContain('$.set(__sdt_sig, $.get(input) * 10)');
  });

  it('preserves original code structure', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    // Original calls must still be present
    expect(result!.code).toContain('$.push($$props, true, Counter)');
    expect(result!.code).toContain('$.pop($$exports)');
    // The $.update call is preserved; only the target is rewritten to the temp
    // (evaluated once) — the delta arg is untouched.
    expect(result!.code).toContain('$.update(__sdt_sig, -1)');
  });

  it('generates a sourcemap', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.map).toBeDefined();
    expect(result!.map.sources).toContain('Counter.svelte');
  });

  it('evaluates a member-expression $.set target exactly once', () => {
    const result = transformSvelteOutput(MEMBER_TARGET_FIXTURE, 'MemberTarget.svelte');
    expect(result).not.toBeNull();
    const code = result!.code;
    // The target is bound to the temp once; pre/onMutation and the rewritten
    // call all read __sdt_sig rather than re-evaluating `obj.x`.
    expect(code).toContain('const __sdt_sig = obj.x;');
    expect(code).toContain('$.set(__sdt_sig, 5)');
    // `obj.x` must appear ONLY in the temp bindings — never spliced into the
    // hook calls or the call args. This fixture has two targets (set + update),
    // so exactly two occurrences, both as `const __sdt_sig = obj.x;`.
    const targetOccurrences = code.match(/obj\.x/g);
    expect(targetOccurrences?.length).toBe(2);
    const bindings = code.match(/const __sdt_sig = obj\.x;/g);
    expect(bindings?.length).toBe(2);
  });

  it('evaluates a member-expression $.update target exactly once', () => {
    const result = transformSvelteOutput(MEMBER_TARGET_FIXTURE, 'MemberTarget.svelte');
    const code = result!.code;
    // $.update target is likewise bound once and reused via the temp.
    expect(code).toContain('$.update(__sdt_sig, -1)');
    expect(code).toContain('__svelte_devtools__?.preMutation(__sdt_sig)');
    expect(code).toContain('__svelte_devtools__?.onMutation(__sdt_sig)');
  });

  it('instruments $.tag_proxy with registerSignal call (object/array/map $state)', () => {
    const result = transformSvelteOutput(PROXY_STATE_FIXTURE, 'Profile.svelte');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('__svelte_devtools__?.registerSignal(__sdt_s, "user")');
    // original tag_proxy call preserved inside the IIFE
    expect(result!.code).toContain("$.tag_proxy($.proxy({ name: 'Ada' }), 'user')");
  });

  it('handles alternative $ namespace name', () => {
    // The simple replacement won't match because the import source doesn't contain
    // 'svelte_internal_client' with the renamed $. Test with proper import instead.
    const customCode = `
import * as internal from "svelte/internal/svelte_internal_client";

function Comp($$anchor, $$props) {
  internal.push($$props, true, Comp);
  return internal.pop($$exports);
}
`.trim();
    const result = transformSvelteOutput(customCode, 'Comp.svelte');
    // Should detect the 'internal' namespace
    expect(result).not.toBeNull();
    expect(result!.code).toContain('__svelte_devtools__?.onPush');
  });

  it('passes the detected namespace identifier to onPop when it is not literally "$"', () => {
    const customCode = `
import * as internal from "svelte/internal/svelte_internal_client";

function Comp($$anchor, $$props) {
  internal.push($$props, true, Comp);
  return internal.pop($$exports);
}
`.trim();
    const result = transformSvelteOutput(customCode, 'Comp.svelte');
    expect(result).not.toBeNull();
    // onPop must receive the module's own namespace identifier ("internal"),
    // not a hardcoded "$" — the compiled module may import it under any name.
    expect(result!.code).toContain('__svelte_devtools__?.onPop(internal)');
    expect(result!.code).toContain('internal.pop($$exports)');
  });
});
