import { test, expect } from '@playwright/test';

test('bridge announces a real Svelte version once the runtime has executed', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __bridgeReadies: unknown[] }).__bridgeReadies = [];
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'bridge:ready') {
        (window as unknown as { __bridgeReadies: unknown[] }).__bridgeReadies.push(data.payload);
      }
    });
  });

  await page.goto('/demos/counter');
  await page.waitForFunction(() => !!window.__svelte_devtools__);

  // Eventually one bridge:ready must carry a real semver — the F16 re-probe.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (
            window as unknown as { __bridgeReadies: { svelteVersion: string; untested: boolean }[] }
          ).__bridgeReadies.filter((b) => /^\d+\.\d+/.test(b.svelteVersion)),
        ),
      { timeout: 5000 },
    )
    .not.toHaveLength(0);

  // And that announcement must also clear the untested flag (5.x is in range).
  const real = await page.evaluate(() =>
    (window as unknown as { __bridgeReadies: { svelteVersion: string; untested: boolean }[] }).__bridgeReadies.find(
      (b) => /^\d+\.\d+/.test(b.svelteVersion),
    ),
  );
  expect(real?.untested).toBe(false);
});
