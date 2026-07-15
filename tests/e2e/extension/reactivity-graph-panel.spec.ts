import { test, expect } from './fixtures.js';

// Resolves the extension's chrome-extension:// origin from its running MV3
// service worker.
async function getExtensionOrigin(context: import('@playwright/test').BrowserContext): Promise<{
  sw: import('@playwright/test').Worker;
  origin: string;
}> {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker');
  }
  return { sw, origin: sw.url().split('/').slice(0, 3).join('/') };
}

// Resolves the chrome tab id for the given (currently focused) app page by
// asking the service worker directly (mirrors what the real panel would see
// via chrome.devtools.inspectedWindow.tabId). The manifest declares no
// "tabs" permission, so chrome.tabs.query() can only filter on non-sensitive
// properties like `active` — not by `.url`, which it never exposes here.
async function getActiveTabId(sw: import('@playwright/test').Worker): Promise<number | undefined> {
  const tabs = await sw.evaluate(() => chrome.tabs.query({ active: true }));
  return tabs[0]?.id;
}

// Waits until the service worker has cached bridge:ready for this tab (it
// flips the action badge to '✓' at the same time it caches the data — see
// setBadge() in service-worker.ts). Condition-based stand-in for "give the
// content script a moment to relay bridge:ready".
async function waitForBridgeCached(sw: import('@playwright/test').Worker, tabId: number): Promise<void> {
  const badgeText = () => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  await expect.poll(badgeText, { timeout: 10_000 }).toBe('✓');
}

// Opens a fresh panel page pointed at the given tab (bypassing
// chrome.devtools.panels.create), stubbing ONLY
// chrome.devtools.inspectedWindow.tabId — chrome.runtime stays real so the
// panel talks to the actual service worker.
async function openPanelPage(
  context: import('@playwright/test').BrowserContext,
  extensionOrigin: string,
  tabId: number,
): Promise<import('@playwright/test').Page> {
  const panelPage = await context.newPage();
  await panelPage.addInitScript((injectedTabId) => {
    // @ts-expect-error -- test-only stub of the devtools-panel-only API surface
    window.chrome.devtools = { inspectedWindow: { tabId: injectedTabId } };
  }, tabId);
  await panelPage.goto(`${extensionOrigin}/src/panel/index.html`);
  return panelPage;
}

test.describe('Reactivity Graph panel', () => {
  test('opening the Reactivity tab renders the graph and survives live snapshots without bricking the panel (F17)', async ({
    context,
  }) => {
    // 1. Open an app page with interactive reactive state and wait for the
    // bridge to attach.
    const appPage = await context.newPage();
    await appPage.goto('/demos/counter');
    await appPage.waitForFunction(() => !!window.__svelte_devtools__);

    // 2. Resolve the tab id and wait for the service worker to have cached
    // bridge:ready for it.
    const { sw, origin: extensionOrigin } = await getExtensionOrigin(context);
    const tabId = await getActiveTabId(sw);
    expect(tabId, 'chrome.tabs.query({ active: true }) returned no tab for the app page').toBeDefined();
    await waitForBridgeCached(sw, tabId!);

    // 3. Open the panel page and wait for it to reach Svelte-detected state.
    const panelPage = await openPanelPage(context, extensionOrigin, tabId!);
    await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 5000 });

    // 4. Install failure-signature collectors BEFORE clicking the tab — the
    // effect_update_depth_exceeded crash (F17) happens synchronously on
    // first render of the graph, so the listener must be live beforehand.
    const panelErrors: string[] = [];
    panelPage.on('pageerror', (err) => panelErrors.push(String(err)));
    panelPage.on('console', (msg) => {
      if (msg.type() === 'error') panelErrors.push(msg.text());
    });

    // 5. Click the Reactivity tab.
    await panelPage.getByRole('button', { name: 'Reactivity' }).click();

    // 6. Assert the graph rendered.
    await expect(panelPage.locator('.node-count')).toHaveText(/[1-9]\d* nodes/, { timeout: 5000 });

    // 7. Drive live snapshots across at least two bridge throttle windows
    // (500 ms each): click the increment control 3 times with a DELIBERATE
    // bounded wait between clicks spanning the bridge's 500 ms graph-emit
    // throttle — do not replace with condition waits, the point is elapsed
    // time.
    const incrementButton = appPage.getByRole('button', { name: '+' });
    await incrementButton.click();
    await appPage.waitForTimeout(600);
    await incrementButton.click();
    await appPage.waitForTimeout(600);
    await incrementButton.click();
    await appPage.waitForTimeout(600);

    // 8. Assert the panel is still alive: switch away and back to the
    // Reactivity tab and confirm it still renders.
    await panelPage.getByRole('button', { name: 'Components' }).click();
    await panelPage.getByRole('button', { name: 'Reactivity' }).click();
    await expect(panelPage.locator('.node-count')).toBeVisible();

    // 9. Assert the F17 failure signature never fired.
    expect(panelErrors.filter((e) => e.includes('effect_update_depth_exceeded'))).toEqual([]);
  });
});
