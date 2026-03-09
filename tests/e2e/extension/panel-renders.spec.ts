import { test, expect } from '@playwright/test';

test.describe('Extension Panel', () => {
  test('extension loads and bridge detects Svelte on page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/demos/counter');
    await page.waitForTimeout(1000);

    // Verify bridge initialized (extension content script should relay bridge:ready)
    const bridgeReady = await page.evaluate(() => !!window.__svelte_devtools__);
    expect(bridgeReady).toBe(true);
  });

  test('bridge exposes component tree through extension context', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('/demos/counter');
    await page.waitForTimeout(1000);

    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });

    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);

    // Verify tree contains a Counter component
    const counter = tree.find((n: any) => n.name === 'Counter');
    expect(counter).toBeDefined();
    expect(counter).toHaveProperty('id');
    expect(counter).toHaveProperty('children');
  });

  test('bridge:ready message is received in extension context', async ({ context }) => {
    const page = await context.newPage();

    // Set up listener before navigating
    await page.addInitScript(() => {
      (window as any).__bridgeReadyReceived = false;
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'bridge:ready') {
          (window as any).__bridgeReadyReceived = true;
        }
      });
    });

    await page.goto('/demos/counter');
    await page.waitForTimeout(1000);

    const received = await page.evaluate(() => (window as any).__bridgeReadyReceived);
    expect(received).toBe(true);
  });
});
