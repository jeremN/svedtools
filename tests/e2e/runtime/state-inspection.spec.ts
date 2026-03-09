import { test, expect } from '@playwright/test';

test.describe('State Inspection', () => {
  test('counter state updates on click', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Verify initial value
    const initialValue = await page
      .locator('[data-testid="counter-value"]')
      .textContent();
    expect(initialValue?.trim()).toBe('0');

    // Click increment
    await page.locator('[data-testid="counter-increment"]').click();
    await page.waitForTimeout(100);

    // Verify DOM updated
    const updatedValue = await page
      .locator('[data-testid="counter-value"]')
      .textContent();
    expect(updatedValue?.trim()).toBe('1');

    // Verify derived value also updated
    const doubledValue = await page
      .locator('[data-testid="counter-doubled"]')
      .textContent();
    expect(doubledValue).toContain('2');
  });

  test('state snapshot contains registered signals', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Get the component tree to find a component with state
    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });

    // Find a component that has stateIds
    const componentWithState = tree.find(
      (n: any) => n.stateIds && n.stateIds.length > 0
    );
    expect(componentWithState).toBeDefined();

    // Send inspect:component message and listen for state:snapshot
    const snapshot = await page.evaluate((componentId: string) => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(
          () => resolve({ error: 'timeout' }),
          5000
        );

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (
            data &&
            data.source === 'svelte-devtools-pro' &&
            data.payload?.type === 'state:snapshot'
          ) {
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
          window.location.origin
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
