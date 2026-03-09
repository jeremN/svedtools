import { test, expect } from '@playwright/test';

test.describe('Update Tracer', () => {
  test('trace:update message is emitted on state mutation', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    // Set up listener BEFORE triggering the click
    const traceResult = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'trace:update') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });

        // Click increment to trigger a state mutation
        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLButtonElement;
        if (btn) btn.click();
      });
    });

    expect(traceResult).not.toHaveProperty('error');
    expect(traceResult).toHaveProperty('type', 'trace:update');
    expect(traceResult).toHaveProperty('trace');
    expect(traceResult.trace).toHaveProperty('id');
    expect(traceResult.trace).toHaveProperty('timestamp');
    expect(traceResult.trace).toHaveProperty('rootCause');
  });

  test('trace includes old and new values in rootCause', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

    const traceResult = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'trace:update') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });

        // Click increment to trigger a state mutation
        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLButtonElement;
        if (btn) btn.click();
      });
    });

    expect(traceResult).not.toHaveProperty('error');
    const rootCause = traceResult.trace.rootCause;
    expect(rootCause).toHaveProperty('signalId');
    expect(rootCause).toHaveProperty('oldValue');
    expect(rootCause).toHaveProperty('newValue');

    // The counter starts at 0 and increments to 1
    expect(rootCause.oldValue).toBe(0);
    expect(rootCause.newValue).toBe(1);
  });
});
