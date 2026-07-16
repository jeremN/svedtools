import { test, expect } from '@playwright/test';

// Fire-and-forget: post a panel→bridge message without waiting for a reply
// (same wire helper as element-picker.spec.ts).
async function sendMessage(page: import('@playwright/test').Page, payload: unknown) {
  await page.evaluate((payload) => {
    window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
  }, payload);
}

// Regression guard: the overlay must actually APPEAR. The original
// findDomElementsByFilename read the flat `__svelte_meta.file` shape, which
// current Svelte doesn't emit (it nests under `loc` — see svelte-meta.ts), so
// hover-highlight silently matched nothing and no test ever caught it.
test.describe('Hover highlight', () => {
  test('highlight:component shows the overlay over the component and null hides it', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const tree = await page.evaluate(() => window.__svelte_devtools__!.getTree());
    const counter = tree.find((n: any) => n.name === 'Counter');
    expect(counter, 'Counter component not found in tree').toBeDefined();

    await sendMessage(page, { type: 'highlight:component', id: counter!.id });

    const overlay = page.locator('#svelte-devtools-highlight');
    await expect(overlay).toBeVisible();
    const box = await overlay.boundingBox();
    expect(box, 'overlay has no layout box').toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    await sendMessage(page, { type: 'highlight:component', id: null });
    await expect(overlay).toBeHidden();
  });
});
