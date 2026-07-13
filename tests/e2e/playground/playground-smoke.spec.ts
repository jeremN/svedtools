import { test, expect } from '@playwright/test';

/**
 * Smoke-tests the playground app (README's primary "Try it" surface), which the
 * runtime e2e project's docs-app webServer never exercises. Modeled line-for-line
 * on tests/e2e/runtime/demos-smoke.spec.ts. Mounts cleanly (no uncaught/runtime
 * errors) and the bridge must detect the Counter and TodoList components.
 */
test.describe('Playground smoke', () => {
  test('/ mounts cleanly and the bridge detects components', async ({ page }) => {
    const pageErrors: string[] = [];
    const svelteErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /effect_update_depth|update_depth_exceeded|svelte/i.test(msg.text())) {
        svelteErrors.push(msg.text());
      }
    });

    await page.goto('/');
    // Let effects settle — an effect cycle would keep re-running/throwing here.
    await page.waitForTimeout(800);

    const tree = await page.evaluate(() => window.__svelte_devtools__?.getTree() ?? []);
    expect(tree.length, 'bridge saw no components on the playground').toBeGreaterThan(0);

    const names = tree.map((n: any) => n.name);
    expect(names, 'playground tree missing Counter').toContain('Counter');
    expect(names, 'playground tree missing TodoList').toContain('TodoList');

    expect(pageErrors, `uncaught errors on playground:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(svelteErrors, `Svelte runtime errors on playground:\n${svelteErrors.join('\n')}`).toEqual([]);
  });
});
