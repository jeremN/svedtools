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

// The service worker's chrome.tabs.onUpdated listener resets its bridge:ready
// cache (and the badge that mirrors it) on *any* status:"loading" transition
// for the tab — including the same-document history.replaceState()
// SvelteKit's client router fires shortly after hydration. That can land a
// few milliseconds after bridge:ready was cached (or after a panel connects),
// wiping it with nothing to repopulate it, since bridge:ready is only ever
// emitted once per page load. A longer wait can't repair an already-wiped
// cache — reloading the app page gives the race a fresh, independent trial,
// and re-delivers bridge:ready live to any already-connected panel port
// (which bypasses the cache entirely).

// Waits until the service worker has cached bridge:ready for this tab (it
// flips the action badge to '✓' at the same time it caches the data — see
// setBadge() in service-worker.ts). Condition-based stand-in for "give the
// content script a moment to relay bridge:ready".
async function waitForBridgeCached(
  sw: import('@playwright/test').Worker,
  appPage: import('@playwright/test').Page,
  tabId: number,
): Promise<void> {
  const badgeText = () => sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await expect.poll(badgeText, { timeout: 3000 }).toBe('✓');
      return;
    } catch {
      await appPage.reload();
      await appPage.waitForFunction(() => !!window.__svelte_devtools__);
    }
  }
  await expect.poll(badgeText, { timeout: 3000 }).toBe('✓');
}

// Waits for the (already-open, already-connected) panel to reach the
// Svelte-detected state, retrying by reloading the app page — which
// re-delivers bridge:ready live to the panel's already-registered port —
// if the initial cache replay lost the race above. Only use this where LIVE
// delivery is an acceptable path to the detected state; the late-connect
// test must NOT use it, since a live re-delivery would mask a broken
// cache-replay path (the very thing that test verifies).
async function waitForPanelDetected(
  panelPage: import('@playwright/test').Page,
  appPage: import('@playwright/test').Page,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 3000 });
      return;
    } catch {
      await appPage.reload();
      await appPage.waitForFunction(() => !!window.__svelte_devtools__);
    }
  }
  await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 3000 });
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

test.describe('Panel UI', () => {
  test('panel renders its shell and reaches Svelte-detected state', async ({ context }) => {
    // 1. Open the inspected app page and wait for the bridge to attach.
    const appPage = await context.newPage();
    await appPage.goto('/demos/counter');
    await appPage.waitForFunction(() => !!window.__svelte_devtools__);

    // 2. Resolve that tab's chrome tab id from the service worker, and wait
    // for the service worker to have cached its bridge:ready (content script
    // relay confirmed alive).
    const { sw, origin: extensionOrigin } = await getExtensionOrigin(context);
    const tabId = await getActiveTabId(sw);
    expect(tabId, 'chrome.tabs.query({ active: true }) returned no tab for the app page').toBeDefined();
    await waitForBridgeCached(sw, appPage, tabId!);

    // 3. Open the panel page directly (bypassing chrome.devtools.panels.create),
    // stubbing ONLY chrome.devtools.inspectedWindow.tabId — chrome.runtime stays
    // real so the panel talks to the actual service worker.
    const panelPage = await context.newPage();
    await panelPage.addInitScript((injectedTabId) => {
      // @ts-expect-error -- test-only stub of the devtools-panel-only API surface
      window.chrome.devtools = { inspectedWindow: { tabId: injectedTabId } };
    }, tabId);
    await panelPage.goto(`${extensionOrigin}/src/panel/index.html`);

    // 4. Assert the panel shell renders.
    await expect(panelPage.locator('#app')).not.toBeEmpty();
    await expect(panelPage.getByRole('button', { name: 'Components' })).toBeVisible();
    await expect(panelPage.getByRole('button', { name: 'Reactivity' })).toBeVisible();
    await expect(panelPage.getByRole('button', { name: 'Profiler' })).toBeVisible();
    await expect(panelPage.getByRole('button', { name: 'Tracer' })).toBeVisible();

    // The real service worker replays the cached bridge:ready for this tab.
    // Live delivery (via an app reload inside the retry helper) is an
    // acceptable path for THIS test — its claim is only that the panel
    // reaches the detected state — unlike the late-connect test below, which
    // must stay exclusively on the cache-replay path.
    await waitForPanelDetected(panelPage, appPage);
    await expect(panelPage.locator('.status-text.detected')).toContainText('Svelte');
  });

  test('panel connecting to an already-loaded app shows the existing component tree', async ({ context }) => {
    // 1. Load the app page FIRST and let it fully mount, before any panel exists.
    const appPage = await context.newPage();
    await appPage.goto('/demos/counter');
    await appPage.waitForFunction(() => !!window.__svelte_devtools__);

    // 2. Resolve the tab id and wait for the service worker to have cached
    // bridge:ready for it (i.e. the tree-replay precondition is met before we
    // ever open a panel — this is the "late connect" scenario).
    const { sw, origin: extensionOrigin } = await getExtensionOrigin(context);
    const tabId = await getActiveTabId(sw);
    expect(tabId, 'chrome.tabs.query({ active: true }) returned no tab for the app page').toBeDefined();
    await waitForBridgeCached(sw, appPage, tabId!);

    // 3. NOW open the panel. The service worker replays the cached
    // bridge:ready, which the panel's main.ts turns into a tree:request —
    // the bridge answers with a full component:tree.
    //
    // Retry discipline: this test exists to verify the CACHE-REPLAY delivery
    // path, so on failure we must NOT reload the app while a panel is
    // connected — that would push a live bridge:ready through the panel's
    // port and turn the test green even if the replay path were broken.
    // Instead: close the panel, re-establish the cache with no panel open
    // (app reloads there are pre-panel and legitimate), then open a FRESH
    // panel. Every attempt reaches the detected state exclusively via the
    // service worker replaying its cache into a newly connected panel.
    let panelPage = await openPanelPage(context, extensionOrigin, tabId!);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 3000 });
        break;
      } catch {
        await panelPage.close();
        await waitForBridgeCached(sw, appPage, tabId!);
        panelPage = await openPanelPage(context, extensionOrigin, tabId!);
      }
    }
    await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 3000 });

    // The replayed component tree should include the mounted Counter.
    await expect(panelPage.locator('.component-name', { hasText: 'Counter' })).toBeVisible({
      timeout: 5000,
    });
  });
});
