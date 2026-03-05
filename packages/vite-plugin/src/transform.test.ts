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
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(count)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(count)');
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
    expect(result!.code).toContain('__svelte_devtools__?.preMutation(processed)');
    expect(result!.code).toContain('__svelte_devtools__?.onMutation(processed)');
  });

  it('preserves original code structure', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    // Original calls must still be present
    expect(result!.code).toContain('$.push($$props, true, Counter)');
    expect(result!.code).toContain('$.pop($$exports)');
    expect(result!.code).toContain('$.update(count, -1)');
  });

  it('generates a sourcemap', () => {
    const result = transformSvelteOutput(COUNTER_FIXTURE, 'Counter.svelte');
    expect(result!.map).toBeDefined();
    expect(result!.map.sources).toContain('Counter.svelte');
  });

  it('handles alternative $ namespace name', () => {
    const code = COUNTER_FIXTURE.replace(/\$/g, 'svelte_internal');
    // This won't match because the import source doesn't contain 'svelte_internal_client'
    // with the renamed $. Let's test with proper import.
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
