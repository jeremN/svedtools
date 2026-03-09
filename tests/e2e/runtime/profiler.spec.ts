import { test, expect } from '@playwright/test';

test.describe('Profiler', () => {
  test('profiler captures render timings', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForTimeout(500);

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
});
