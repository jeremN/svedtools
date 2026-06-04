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

  it('instruments $.pop with onPop call', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.code).toContain('__svelte_devtools__?.onPop()');
  });

  it('instruments $.update with preMutation and onMutation calls', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    // Target is bound to a temp and evaluated once, so pre/onMutation read __sig
    expect(result!.code).toContain('const __sig = count;');
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(__sig)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(__sig)');
    // The rewritten call passes the temp, preserving the original delta arg
    expect(result!.code).toContain('$.update(__sig, -1)');
  });

  it('instruments $.user_effect with registerEffect call', () => {
    const result = transformSvelteOutput(EFFECT_FIXTURE, 'EffectChain.svelte');
    expect(result).not.toBeNull();
    expect(result!.code).toContain('__svelte_devtools__?.registerEffect(');
  });

  it('instruments $.tag with registerSignal call', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.code).toContain('__svelte_devtools__?.registerSignal(__s, "count")');
    expect(result!.code).toContain('__svelte_devtools__?.registerSignal(__s, "doubled")');
  });

  it('instruments $.set with preMutation and onMutation calls', () => {
    const result = transformSvelteOutput(EFFECT_FIXTURE, 'EffectChain.svelte');
    // Target is bound to a temp and evaluated once, so pre/onMutation read __sig
    expect(result!.code).toContain('const __sig = processed;');
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(__sig)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(__sig)');
    // The value arg is left untouched so inner instrumentation there still applies
    expect(result!.code).toContain('$.set(__sig, $.get(input) * 10)');
  });

  it('preserves original code structure', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    // Original calls must still be present
    expect(result!.code).toContain('$.push($$props, true, Counter)');
    expect(result!.code).toContain('$.pop($$exports)');
    // The $.update call is preserved; only the target is rewritten to the temp
    // (evaluated once) — the delta arg is untouched.
    expect(result!.code).toContain('$.update(__sig, -1)');
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
    // call all read __sig rather than re-evaluating `obj.x`.
    expect(code).toContain('const __sig = obj.x;');
    expect(code).toContain('$.set(__sig, 5)');
    // `obj.x` must appear ONLY in the temp bindings — never spliced into the
    // hook calls or the call args. This fixture has two targets (set + update),
    // so exactly two occurrences, both as `const __sig = obj.x;`.
    const targetOccurrences = code.match(/obj\.x/g);
    expect(targetOccurrences?.length).toBe(2);
    const bindings = code.match(/const __sig = obj\.x;/g);
    expect(bindings?.length).toBe(2);
  });

  it('evaluates a member-expression $.update target exactly once', () => {
    const result = transformSvelteOutput(MEMBER_TARGET_FIXTURE, 'MemberTarget.svelte');
    const code = result!.code;
    // $.update target is likewise bound once and reused via the temp.
    expect(code).toContain('$.update(__sig, -1)');
    expect(code).toContain('__svelte_devtools__?.preMutation(__sig)');
    expect(code).toContain('__svelte_devtools__?.onMutation(__sig)');
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
});
