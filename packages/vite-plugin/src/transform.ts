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
 * - $.set(signal, value)               → mutation tracking
 * - $.update(signal)                   → mutation tracking
 */
export function transformSvelteOutput(
  code: string,
  id: string,
): TransformResult | null {
  // Quick bail: must have a push call from svelte internals
  // Check both Vite-resolved path (svelte_internal_client) and original import (svelte/internal/client)
  if (!code.includes('.push(') || (!code.includes('svelte_internal_client') && !code.includes('svelte/internal/client'))) return null;

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

    walk(ast, {
      enter(node: any) {
        // Detect the namespace import: import * as $ from "svelte/internal/client"
        if (
          node.type === 'ImportDeclaration' &&
          (node.source?.value?.includes('svelte_internal_client') || node.source?.value?.includes('svelte/internal/client')) &&
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
            instrumentPush(s, node);
            hasChanges = true;
            break;

          case 'pop':
            instrumentPop(s, node);
            hasChanges = true;
            break;

          case 'user_effect':
            instrumentUserEffect(s, node, dollarSign);
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
  s.prependLeft(
    node.start,
    `(window.__svelte_devtools__?.onPush(${safeName}, ${propsArg}, ${fnArg}), `,
  );
  s.appendRight(node.end, ')');
}

/**
 * $.pop($$exports)
 * → (window.__svelte_devtools__?.onPop(), $.pop($$exports))
 *
 * Insert onPop before pop runs so we capture render duration.
 */
function instrumentPop(s: MagicString, node: any): void {
  s.prependLeft(
    node.start,
    `(window.__svelte_devtools__?.onPop(), `,
  );
  s.appendRight(node.end, ')');
}

/**
 * $.user_effect(fn)
 * → $.user_effect((() => { const __eid = window.__svelte_devtools__?.registerEffect(fn); return window.__svelte_devtools__?.wrapEffect(fn, __eid) ?? fn; })())
 *
 * We register the effect AND wrap the function for profiling.
 * wrapEffect returns the original fn when profiling is inactive,
 * or a timing-instrumented wrapper when profiling is active.
 */
function instrumentUserEffect(s: MagicString, node: any, dollar: string): void {
  const args = node.arguments;
  if (args.length < 1) return;

  // Wrap the fn argument with an IIFE that registers + wraps for profiling.
  // Uses prependLeft/appendRight (additive) rather than overwrite to avoid
  // conflicts with inner instrumentation (e.g. $.set inside the effect body).
  s.prependLeft(
    args[0].start,
    `(() => { const __fn = `,
  );
  s.appendRight(
    args[0].end,
    `; const __eid = window.__svelte_devtools__?.registerEffect(__fn); return window.__svelte_devtools__?.wrapEffect(__fn, __eid) ?? __fn; })()`,
  );
}

/**
 * $.set(signal, value)
 * → ($.set(signal, value), window.__svelte_devtools__?.onMutation(signal))
 *
 * onMutation is called AFTER set to avoid double-evaluating the value expression.
 * The bridge reads the new value from the signal directly.
 */
function instrumentSet(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 2) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  s.prependLeft(node.start, '(');
  s.appendRight(node.end, `, window.__svelte_devtools__?.onMutation(${signalArg}))`);
}

/**
 * $.update(signal) or $.update(signal, -1)
 * → (window.__svelte_devtools__?.onMutation(signal), $.update(signal))
 *
 * Unlike $.set, the signal arg is always a simple identifier (no side effects),
 * so calling onMutation BEFORE update is safe. We keep the before-call pattern
 * to preserve $.update's return value (used in `return $.update(count, -1)`).
 */
function instrumentUpdate(s: MagicString, node: any): void {
  const args = node.arguments;
  if (args.length < 1) return;

  const signalArg = s.slice(args[0].start, args[0].end);

  s.prependLeft(
    node.start,
    `(window.__svelte_devtools__?.onMutation(${signalArg}), `,
  );
  s.appendRight(node.end, ')');
}

/**
 * $.tag($.state(0), 'count') or $.tag($.derived(...), 'doubled')
 * → ($.tag($.state(0), 'count'), window.__svelte_devtools__?.registerSignal(RESULT, 'count'))
 *
 * BUT $.tag returns the signal, so we need a temp to capture it.
 * Simpler: wrap as an IIFE that captures the result:
 * → (() => { const __s = $.tag($.state(0), 'count'); window.__svelte_devtools__?.registerSignal(__s, 'count'); return __s; })()
 */
function instrumentTag(s: MagicString, node: any): void {
  const args = node.arguments;
  // $.tag(signal, label) — must have at least 2 args
  if (args.length < 2) return;

  // 2nd arg is the label string literal
  const labelNode = args[1];
  if (labelNode.type !== 'Literal' || typeof labelNode.value !== 'string') return;

  const label = JSON.stringify(labelNode.value);

  s.prependLeft(
    node.start,
    `(() => { const __s = `,
  );
  s.appendRight(
    node.end,
    `; window.__svelte_devtools__?.registerSignal(__s, ${label}); return __s; })()`,
  );
}
