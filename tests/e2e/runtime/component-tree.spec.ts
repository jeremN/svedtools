import { test, expect } from '@playwright/test';

test.describe('Component Tree', () => {
  test('bridge initializes and exposes __svelte_devtools__ on the window', async ({
    page,
  }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const hasBridge = await page.evaluate(() => {
      return typeof window.__svelte_devtools__ !== 'undefined';
    });
    expect(hasBridge).toBe(true);
  });

  test('bridge:ready message is emitted', async ({ page }) => {
    // Use addInitScript to set up the listener BEFORE the page loads
    await page.addInitScript(() => {
      (window as any).__bridgeReadyReceived = false;
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (
          data &&
          data.source === 'svelte-devtools-pro' &&
          data.payload?.type === 'bridge:ready'
        ) {
          (window as any).__bridgeReadyReceived = true;
        }
      });
    });

    await page.goto('/demos/counter');
    await page.waitForTimeout(1000);

    const received = await page.evaluate(
      () => (window as any).__bridgeReadyReceived
    );
    expect(received).toBe(true);
  });

  test('getTree() returns component nodes after mount', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });

    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);

    // Each node should have standard shape
    const node = tree[0];
    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('name');
    expect(node).toHaveProperty('children');
  });

  test('component tree includes parent-child relationships on context page', async ({
    page,
  }) => {
    await page.goto('/demos/context');
    await page.waitForTimeout(500);

    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });

    expect(tree.length).toBeGreaterThan(1);

    // Find a node that has children
    const parents = tree.filter(
      (n: any) => n.children && n.children.length > 0
    );
    expect(parents.length).toBeGreaterThan(0);

    // Find a node that has a parentId
    const children = tree.filter((n: any) => n.parentId !== null);
    expect(children.length).toBeGreaterThan(0);

    // Verify a child's parentId references an existing node
    const childNode = children[0];
    const parentExists = tree.some((n: any) => n.id === childNode.parentId);
    expect(parentExists).toBe(true);
  });
});
