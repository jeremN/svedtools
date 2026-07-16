import { test, expect } from '@playwright/test';

// Fire-and-forget: post a panel→bridge message without waiting for a reply
// (same wire shape as sendAndAwait in state-editing.spec.ts, minus the wait).
async function sendMessage(page: import('@playwright/test').Page, payload: unknown) {
  await page.evaluate((payload) => {
    window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
  }, payload);
}

// Resolves with the next bridge→panel message of `replyType` (or a timeout
// marker). Call BEFORE the action that triggers the reply so the listener is
// registered first — same pattern as sendAndAwait in state-editing.spec.ts.
function waitForMessage(page: import('@playwright/test').Page, replyType: string, timeoutMs = 5000) {
  return page.evaluate(
    ({ replyType, timeoutMs }) => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs);
        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === replyType) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });
      });
    },
    { replyType, timeoutMs },
  );
}

test.describe('Element picker', () => {
  test('picking an element resolves its owning component and swallows the click', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const tree = await page.evaluate(() => window.__svelte_devtools__!.getTree());
    const counter = tree.find((n: any) => n.name === 'Counter');
    expect(counter, 'Counter component not found in tree').toBeDefined();

    await sendMessage(page, { type: 'picker:start' });

    const increment = page.locator('[data-testid="counter-increment"]');
    const box = await increment.boundingBox();
    expect(box, 'increment button has no layout box').toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Hovering while picking highlights the hovered element.
    await page.mouse.move(cx, cy);
    await expect(page.locator('#svelte-devtools-highlight')).toBeVisible();

    const pickedPromise = waitForMessage(page, 'picker:picked');
    await page.mouse.click(cx, cy);
    const picked = await pickedPromise;

    expect(picked).not.toHaveProperty('error');
    expect(picked.componentId).toBe(counter!.id);

    // The picker swallows the click — the app must not react to it.
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('0');
  });

  test('Escape cancels the pick and restores normal page interaction', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    await sendMessage(page, { type: 'picker:start' });

    const pickedPromise = waitForMessage(page, 'picker:picked');
    await page.keyboard.press('Escape');
    const picked = await pickedPromise;

    expect(picked).not.toHaveProperty('error');
    expect(picked.componentId).toBeNull();

    const cursor = await page.evaluate(() => document.documentElement.style.cursor);
    expect(cursor).toBe('');

    // A subsequent page click behaves normally: no further picker:picked,
    // and the app reacts (count increments).
    const noFurtherPick = waitForMessage(page, 'picker:picked', 1000);
    await page.locator('[data-testid="counter-increment"]').click();
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('1');
    expect(await noFurtherPick).toEqual({ error: 'timeout' });
  });

  test('picker:stop before any pick leaves the page in a clean state', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    await sendMessage(page, { type: 'picker:start' });
    await sendMessage(page, { type: 'picker:stop' });

    const noPick = waitForMessage(page, 'picker:picked', 1000);
    await page.locator('[data-testid="counter-increment"]').click();
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('1');
    expect(await noPick).toEqual({ error: 'timeout' });

    const cursor = await page.evaluate(() => document.documentElement.style.cursor);
    expect(cursor).toBe('');
  });
});
