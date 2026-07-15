import { test, expect } from '@playwright/test';

test.describe('Profiler', () => {
  test('profiler captures render timings', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    // Set up listener for profiler:data BEFORE triggering stop
    const profilerData = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);

        // Start profiling
        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'profiler:start' },
          },
          window.location.origin,
        );

        // Listen for profiler:data response
        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'profiler:data') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });

        // Click increment to generate a render while profiling
        const btn = document.querySelector('[data-testid="counter-increment"]') as HTMLButtonElement;
        if (btn) btn.click();

        // Small delay then stop profiling
        setTimeout(() => {
          window.postMessage(
            {
              source: 'svelte-devtools-pro',
              payload: { type: 'profiler:stop' },
            },
            window.location.origin,
          );
        }, 200);
      });
    });

    expect(profilerData).not.toHaveProperty('error');
    expect(profilerData).toHaveProperty('type', 'profiler:data');
    expect(profilerData).toHaveProperty('timings');
    expect(profilerData).toHaveProperty('effectTimings');
    expect(Array.isArray(profilerData.timings)).toBe(true);
    expect(Array.isArray(profilerData.effectTimings)).toBe(true);
  });

  test('profiles effects of components mounted BEFORE recording started (F19)', async ({ page }) => {
    // effect-chain demo: mounts with a user $effect that re-runs on every
    // click of its "Increment Source" control (data-testid="effect-increment").
    // Reused from reactivity-graph.spec.ts's live-update tests.
    await page.goto('/demos/effect-chain');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    // The component tree is fully mounted BEFORE profiling starts — this is
    // the exact scenario that used to record nothing (F19: wrapEffect used
    // to gate at wrap time, which happens once, at mount).
    await page.evaluate(() => window.__svelte_devtools__!.startProfiling());

    // Re-run the pre-mounted component's user effect a few times.
    const incrementBtn = page.locator('[data-testid="effect-increment"]');
    await incrementBtn.click();
    await incrementBtn.click();
    await incrementBtn.click();

    const data = await page.evaluate(() => window.__svelte_devtools__!.stopProfiling());

    expect(data.effectTimings.length).toBeGreaterThan(0);
  });
});
