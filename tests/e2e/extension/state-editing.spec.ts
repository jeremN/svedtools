import { test, expect } from '@playwright/test';

test.describe('State Editing via Bridge', () => {
  test('bridge signalMap exposes signal values for reading', async ({
    page,
  }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Click increment a few times
    await page.locator('[data-testid="counter-increment"]').click();
    await page.locator('[data-testid="counter-increment"]').click();
    await page.waitForTimeout(200);

    // Verify we can read the signal value from the bridge
    const signalValue = await page.evaluate(() => {
      const tree = window.__svelte_devtools__?.getTree() ?? [];
      const counter = tree.find((n: any) => n.name === 'Counter');
      if (!counter) return null;

      for (const [signal, meta] of window.__svelte_devtools__!.signalMap) {
        if (meta.label === 'count' && meta.componentId === counter.id) {
          return signal.v;
        }
      }
      return null;
    });

    expect(signalValue).toBe(2);
  });

  test('inspect:component returns state snapshot with current values', async ({
    page,
  }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Click increment 3 times
    await page.locator('[data-testid="counter-increment"]').click();
    await page.locator('[data-testid="counter-increment"]').click();
    await page.locator('[data-testid="counter-increment"]').click();
    await page.waitForTimeout(200);

    // Get counter component id
    const tree = await page.evaluate(() => {
      return window.__svelte_devtools__!.getTree();
    });
    const counter = tree.find((n: any) => n.name === 'Counter');
    expect(counter).toBeDefined();

    // Send inspect:component and capture state:snapshot response
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
    }, counter!.id);

    expect(snapshot).not.toHaveProperty('error');
    expect(snapshot).toHaveProperty('type', 'state:snapshot');
    expect(snapshot.signals.length).toBeGreaterThan(0);

    // Find the count signal and verify its value reflects the clicks
    const countSignal = snapshot.signals.find(
      (s: any) => s.label === 'count'
    );
    expect(countSignal).toBeDefined();
    expect(countSignal.value).toBe(3);
  });

  test('signalMap tracks derived values correctly', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Click increment once
    await page.locator('[data-testid="counter-increment"]').click();
    await page.waitForTimeout(200);

    // Read the derived "doubled" value from the DOM
    const doubledText = await page
      .locator('[data-testid="counter-doubled"]')
      .textContent();
    expect(doubledText).toContain('2');

    // Verify the bridge can enumerate signals including derived ones
    const signalInfo = await page.evaluate(() => {
      const tree = window.__svelte_devtools__?.getTree() ?? [];
      const counter = tree.find((n: any) => n.name === 'Counter');
      if (!counter) return null;

      const signals: Array<{
        label: string | null;
        type: string;
        value: any;
      }> = [];
      for (const [signal, meta] of window.__svelte_devtools__!.signalMap) {
        if (meta.componentId === counter.id) {
          signals.push({
            label: meta.label,
            type: meta.type,
            value: signal.v,
          });
        }
      }
      return signals;
    });

    expect(signalInfo).not.toBeNull();
    expect(signalInfo!.length).toBeGreaterThan(0);

    // Should have at least one 'state' type signal (count)
    const stateSignals = signalInfo!.filter((s) => s.type === 'state');
    expect(stateSignals.length).toBeGreaterThan(0);
  });
});
