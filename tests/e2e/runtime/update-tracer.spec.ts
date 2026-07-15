import { test, expect, type Page } from '@playwright/test';

/**
 * The bridge gates its per-write hot path (stack capture, serialization,
 * trace:update/component:updated messaging) behind a simulated
 * 'devtools:panel-connected' signal — see plan 004. Runtime pages have no
 * real extension attached, so specs that need tracing must post this message
 * themselves before interacting with the page.
 */
async function simulatePanelConnected(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.postMessage(
      { source: 'svelte-devtools-pro', payload: { type: 'devtools:panel-connected' } },
      window.location.origin,
    );
  });
}

test.describe('Update Tracer', () => {
  test('trace:update message is emitted on state mutation', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);
    await simulatePanelConnected(page);

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
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);
    await simulatePanelConnected(page);

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

  test('no trace:update traffic on state change without a connected panel', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);
    // Deliberately do NOT simulate panel-connected — the hot path should stay gated.

    const result = await page.evaluate(() => {
      return new Promise<'received' | 'timeout'>((resolve) => {
        const timeout = setTimeout(() => resolve('timeout'), 500);

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'trace:update') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve('received');
          }
        });

        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLButtonElement;
        if (btn) btn.click();
      });
    });

    expect(result).toBe('timeout');
  });

  test('5 synchronous writes to the same signal coalesce into a single trace:update', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);
    await simulatePanelConnected(page);

    const traces = await page.evaluate(() => {
      return new Promise<any[]>((resolve) => {
        const received: any[] = [];

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'trace:update') {
            received.push(data.payload.trace);
          }
        });

        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLButtonElement;
        // All 5 clicks run synchronously in this task, so the microtask flush
        // (queued on the first click) coalesces them into one trace:update.
        for (let i = 0; i < 5; i++) btn.click();

        // Give the microtask flush + postMessage dispatch time to settle before
        // reading back what was observed.
        setTimeout(() => resolve(received), 500);
      });
    });

    expect(traces.length).toBe(1);
    expect(traces[0].coalescedCount).toBeGreaterThanOrEqual(2);
    expect(traces[0].rootCause.oldValue).toBe(0);
    expect(traces[0].rootCause.newValue).toBe(5);
  });
});
