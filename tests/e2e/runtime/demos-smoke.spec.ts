import { test, expect } from '@playwright/test';

/**
 * Smoke-tests every interactive demo page served by the docs dev server (which
 * the e2e webServer runs). Previously only /demos/counter and /demos/context
 * were exercised, so a regression in another demo — e.g. the
 * `effect_update_depth_exceeded` cycle that once lived in EffectChain — could
 * slip past the whole suite. Each page must mount cleanly (no uncaught/runtime
 * errors) and the bridge must detect its components.
 */
const DEMO_ROUTES = [
  '/demos/counter',
  '/demos/nested-state',
  '/demos/effect-chain',
  '/demos/todo-list',
  '/demos/context',
];

test.describe('Demo pages smoke', () => {
  for (const route of DEMO_ROUTES) {
    test(`${route} mounts cleanly and the bridge detects components`, async ({ page }) => {
      const pageErrors: string[] = [];
      const svelteErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && /effect_update_depth|update_depth_exceeded|svelte/i.test(msg.text())) {
          svelteErrors.push(msg.text());
        }
      });

      await page.goto(route);
      // Let effects settle — an effect cycle would keep re-running/throwing here.
      await page.waitForTimeout(800);

      const treeLength = await page.evaluate(() => window.__svelte_devtools__?.getTree().length ?? 0);
      expect(treeLength, `bridge saw no components on ${route}`).toBeGreaterThan(0);

      expect(pageErrors, `uncaught errors on ${route}:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(svelteErrors, `Svelte runtime errors on ${route}:\n${svelteErrors.join('\n')}`).toEqual([]);
    });
  }
});
