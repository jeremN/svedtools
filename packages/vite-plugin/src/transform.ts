import { parse } from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Node } from 'estree';

interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
}

/**
 * Instruments compiled Svelte 5 output with DevTools hooks.
 *
 * Runs as a post-transform AFTER vite-plugin-svelte has compiled
 * the .svelte file to JS. Parses the compiled JS with acorn,
 * walks the AST with estree-walker, and injects instrumentation
 * calls using magic-string (which preserves sourcemaps).
 *
 * Patterns we instrument:
 * - $.push(props, runes, ComponentFn)  → onPush for tree building
 * - $.pop(exports)                     → onPop for render timing
 * - $.state(value) / $.tag($.state(v)) → signal registration
 * - $.user_effect(fn)                  → effect registration
 * - $.template_effect(fn)              → update-cycle timing (no registration)
 * - $.set(signal, value)               → mutation tracking
 * - $.update(signal)                   → mutation tracking
 */
export function transformSvelteOutput(code: string, id: string): TransformResult | null {
  // Quick bail: must have a push call from svelte internals
  // Check both Vite-resolved path (svelte_internal_client) and original import (svelte/internal/client)
  if (
    !code.includes('.push(') ||
    (!code.includes('svelte_internal_client') && !code.includes('svelte/internal/client'))
  )
    return null;

  let ast: Node;
  try {
    ast = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    }) as unknown as Node;
  } catch {
    // If parsing fails (e.g. syntax we don't handle), skip silently
    return null;
  }

  let s: MagicString;
  let hasChanges = false;

  try {
    s = new MagicString(code);

    // Track the $ namespace identifier (usually "import * as $ from ...")
    let dollarSign = '$';

    // Lexically-known owning component: captured from the $.push call's 3rd
    // argument (`$.push($$props, true, Counter)`). Passed to template-effect
    // instrumentation so dynamically-created rows (e.g. {#each} rows created
    // AFTER mount, when the bridge's component stack is empty) still get
    // attributed to the right component.
    let componentFnName: string | null = null;

    walk(ast, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enter(node: any) {
        // Detect the namespace import: import * as $ from "svelte/internal/client"
        if (
          node.type === 'ImportDeclaration' &&
          (node.source?.value?.includes('svelte_internal_client') ||
            node.source?.value?.includes('svelte/internal/client')) &&
          node.specifiers?.length === 1 &&
          node.specifiers[0].type === 'ImportNamespaceSpecifier'
        ) {
          dollarSign = node.specifiers[0].local.name;
          return;
        }

        if (node.type !== 'CallExpression') return;
        if (!node.callee) return;

        // Match $.method() pattern
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.object?.type !== 'Identifier') return;
        if (callee.object.name !== dollarSign) return;
        if (callee.property?.type !== 'Identifier') return;

        const method = callee.property.name;

        switch (method) {
          case 'push':
            // Capture the component fn identifier before instrumenting — the
            // compiled shape is `$.push($$props, true, Counter)`; a
            // non-identifier 3rd arg yields undefined → null.
            componentFnName = node.arguments[2]?.name ?? null;
            instrumentPush(s, node);
            hasChanges = true;
            break;

          case 'pop':
            instrumentPop(s, node, dollarSign);
            hasChanges = true;
            break;

          case 'user_effect':
            instrumentUserEffect(s, node);
            hasChanges = true;
            break;

          case 'template_effect':
            instrumentTemplateEffect(s, node, componentFnName);
            hasChanges = true;
            break;

          case 'set':
            instrumentSet(s, node);
            hasChanges = true;
            break;

          case 'update':
            instrumentUpdate(s, node);
            hasChanges = true;
            break;

          case 'tag':
          case 'tag_proxy':
            instrumentTag(s, node);
            hasChanges = true;
            break;
        }
      },
    });
  } catch (e) {
    console.warn(`[svelte-devtools] Transform failed for ${id}:`, e);
    return null;
  }

  if (!hasChanges) return null;

  return {
    code: s.toString(),
    map: s.generateMap({
      source: id,
      includeContent: true,
      hires: true,
    }),
  };
}

/**
 * $.push($$props, true, Counter)
 * → (window.__svelte_devtools__?.onPush("Counter", $$props, Counter), $.push($$props, true, Counter))
 *
 * We pass the component name as a string literal (1st arg) because HMR
 * reassigns the component identifier to a wrapper function at runtime.
 * Baking the name at compile time avoids reading wrapper.name = "wrapper".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentPush(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 3) return;

  // Extract the component function name as a string literal from AST
  const fnNode = args[2];
  const componentName = fnNode.type === 'Identifier' ? fnNode.name : s.slice(fnNode.start, fnNode.end);
  const safeName = JSON.stringify(componentName);

  const propsArg = s.slice(args[0].start, args[0].end);
  const fnArg = s.slice(args[2].start, args[2].end);

  // Wrap the entire $.push call in a comma expression
  s.prependLeft(node.start, `(window.__svelte_devtools__?.onPush(${safeName}, ${propsArg}, ${fnArg}), `);
  s.appendRight(node.end, ')');
}

/**
 * $.pop($$exports)
 * → (window.__svelte_devtools__?.onPop($), $.pop($$exports))
 *
 * Insert onPop before pop runs so we capture render duration. We also hand
 * onPop the compiled module's own internals namespace (the `dollarSign`
 * identifier the walker matched — NOT a literal "$", since a module can
 * import it under another local name). This lets the bridge register a
 * component-teardown effect (via Compat.registerComponentTeardown) using
 * the module's own `$.user_effect`, without the bridge needing a Svelte
 * import of its own.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentPop(s: MagicString, node: any, dollarSign: string): void {
  s.prependLeft(node.start, `(window.__svelte_devtools__?.onPop(${dollarSign}), `);
  s.appendRight(node.end, ')');
}

/**
 * $.user_effect(fn)
 * → $.user_effect((() => { const __eid = window.__svelte_devtools__?.registerEffect(fn); return window.__svelte_devtools__?.wrapEffect(fn, __eid) ?? fn; })())
 *
 * We register the effect AND wrap the function for profiling.
 * wrapEffect always wraps; the timing work is gated on profilingActive
 * at call time, so the wrapper is a no-op pass-through when profiling
 * is inactive and timing-instrumented when profiling is active.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentUserEffect(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 1) return;

  // Wrap the fn argument with an IIFE that registers + wraps for profiling.
  // Uses prependLeft/appendRight (additive) rather than overwrite to avoid
  // conflicts with inner instrumentation (e.g. $.set inside the effect body).
  s.prependLeft(args[0].start, `(() => { const __fn = `);
  s.appendRight(
    args[0].end,
    `; const __eid = window.__svelte_devtools__?.registerEffect(__fn); return window.__svelte_devtools__?.wrapEffect(__fn, __eid) ?? __fn; })()`,
  );
}

/**
 * $.template_effect(fn)
 * → $.template_effect((() => { const __sdt_fn = fn; return window.__svelte_devtools__?.wrapRenderEffect?.(__sdt_fn, "Counter") ?? __sdt_fn; })())
 *
 * Timing-only wrapper for update-cycle profiling. Deliberately NOT
 * registered into the effect registry — {#each} bodies emit one
 * template_effect per row.
 *
 * `componentFnName` is the lexically-enclosing component's fn name (from the
 * preceding $.push); baked in as a string literal so rows created after mount
 * (empty bridge component stack) still attribute correctly. Omitted when no
 * $.push preceded this call in the module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentTemplateEffect(s: MagicString, node: any, componentFnName: string | null): void {
  const args = node.arguments;
  if (args.length < 1) return;
  // `__sdt_fn` (not `__fn`) — the binding sits in the callback's closure
  // scope, so a devtools-prefixed name avoids shadowing user identifiers.
  // Optional-call on the method: an older bridge object (HMR/cache skew)
  // may not have wrapRenderEffect yet and must degrade to the original fn.
  const nameArg = componentFnName ? `, ${JSON.stringify(componentFnName)}` : '';
  s.prependLeft(args[0].start, `(() => { const __sdt_fn = `);
  s.appendRight(
    args[0].end,
    `; return window.__svelte_devtools__?.wrapRenderEffect?.(__sdt_fn${nameArg}) ?? __sdt_fn; })()`,
  );
}

/**
 * $.set(signal, value)
 * → (() => { const __sig = signal; window.__svelte_devtools__?.preMutation(__sig); const __r = $.set(__sig, value); window.__svelte_devtools__?.onMutation(__sig); return __r; })()
 *
 * preMutation captures the old value (signal.v) before set runs.
 * onMutation is called AFTER set to read the new value from the signal.
 * This enables "Why Did This Update?" tracing by comparing old vs new.
 *
 * The signal target is bound to a `__sig` temp and evaluated EXACTLY ONCE,
 * then reused for pre/onMutation and rewritten in place inside the original
 * call. A naive comma-expression would splice the target three times, so a
 * non-trivial target (e.g. a class `$state` member `this.#count`, or an index
 * expression with side effects) would be re-evaluated — fragile even when the
 * expression happens to be pure. We `update` only the target range (args[0]);
 * the value arg (args[1]) is left untouched so inner instrumentation there
 * (e.g. a nested `$.update`) still applies. Overwriting args[0] is safe: in
 * compiled Svelte output a mutation target is a plain signal reference and
 * never itself contains instrumentable `$.method()` calls, so no other
 * instrumenter touches that range.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentSet(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 2) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  // Bind the target once, rewrite it in place, capture old/new around set
  s.prependLeft(
    node.start,
    `(() => { const __sig = ${signalArg}; window.__svelte_devtools__?.preMutation(__sig); const __r = `,
  );
  s.update(args[0].start, args[0].end, '__sig');
  s.appendRight(node.end, `; window.__svelte_devtools__?.onMutation(__sig); return __r; })()`);
}

/**
 * $.update(signal) or $.update(signal, -1)
 * → (() => { const __sig = signal; preMutation(__sig); const __r = $.update(__sig, -1); onMutation(__sig); return __r; })()
 *
 * IIFE preserves $.update's return value (used in `return $.update(count, -1)`)
 * while capturing pre/post mutation values for update tracing.
 *
 * Like instrumentSet, the signal target is bound to `__sig` and evaluated
 * EXACTLY ONCE, then rewritten in place inside the original call so a
 * non-trivial target isn't re-evaluated. Overwriting args[0] is safe — a
 * compiled mutation target never contains instrumentable `$.method()` calls,
 * so no other instrumenter touches that range. Any remaining args (e.g. the
 * `-1` delta in args[1]) are left untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentUpdate(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 1) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  // Bind the target once, rewrite it in place; IIFE preserves $.update's return value
  s.prependLeft(
    node.start,
    `(() => { const __sig = ${signalArg}; window.__svelte_devtools__?.preMutation(__sig); const __r = `,
  );
  s.update(args[0].start, args[0].end, '__sig');
  s.appendRight(node.end, `; window.__svelte_devtools__?.onMutation(__sig); return __r; })()`);
}

/**
 * $.tag($.state(0), 'count') or $.tag($.derived(...), 'doubled')
 * → (() => { const __s = $.tag($.state(0), 'count'); window.__svelte_devtools__?.registerSignal(__s, 'count'); return __s; })()
 *
 * Also handles $.tag_proxy($.proxy({...}), 'label') — object/array/Map $state.
 * Both forms share the same (value, stringLiteralLabel) shape and return the value,
 * so a single IIFE wrapper works for both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentTag(s: MagicString, node: any): void {
  const args = node.arguments;
  // $.tag(signal, label) — must have at least 2 args
  if (args.length < 2) return;

  // 2nd arg is the label string literal
  const labelNode = args[1];
  if (labelNode.type !== 'Literal' || typeof labelNode.value !== 'string') return;

  const label = JSON.stringify(labelNode.value);

  s.prependLeft(node.start, `(() => { const __s = `);
  s.appendRight(node.end, `; window.__svelte_devtools__?.registerSignal(__s, ${label}); return __s; })()`);
}
