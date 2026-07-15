import { test, expect } from '@playwright/test';

test.describe('State Inspection', () => {
  test('counter state updates on click', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    // Verify initial value
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('0');

    // Click increment
    await page.locator('[data-testid="counter-increment"]').click();

    // Verify DOM updated
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('1');

    // Verify derived value also updated
    await expect(page.locator('[data-testid="counter-doubled"]')).toContainText('2');
  });

  test('state snapshot contains registered signals', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    // Get the component tree to find a component with state
    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });

    // Find a component that has stateIds
    const componentWithState = tree.find((n: any) => n.stateIds && n.stateIds.length > 0);
    expect(componentWithState).toBeDefined();

    // Send inspect:component message and listen for state:snapshot
    const snapshot = await page.evaluate((componentId: string) => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'state:snapshot') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });

        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'inspect:component', id: componentId },
          },
          window.location.origin,
        );
      });
    }, componentWithState!.id);

    expect(snapshot).not.toHaveProperty('error');
    expect(snapshot).toHaveProperty('type', 'state:snapshot');
    expect(snapshot).toHaveProperty('componentId', componentWithState!.id);
    expect(snapshot).toHaveProperty('signals');
    expect(Array.isArray(snapshot.signals)).toBe(true);
    expect(snapshot.signals.length).toBeGreaterThan(0);

    // Each signal should have id, label, type, value
    const signal = snapshot.signals[0];
    expect(signal).toHaveProperty('id');
    expect(signal).toHaveProperty('type');
    expect(signal).toHaveProperty('value');
  });
});
