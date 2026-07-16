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

// The service worker must NOT wipe its bridge:ready cache on same-document
// navigations (e.g. SvelteKit's client-router history.replaceState() shortly
// after hydration) — only on a real content-port disconnect or tab removal.
// All waits below are single-attempt by design: if this spec goes flaky, the
// cache-wipe regressed.

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
    await waitForBridgeCached(sw, tabId!);

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
    await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 5000 });
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
    await waitForBridgeCached(sw, tabId!);

    // 3. NOW open the panel. The service worker replays the cached
    // bridge:ready, which the panel's main.ts turns into a tree:request —
    // the bridge answers with a full component:tree.
    const panelPage = await openPanelPage(context, extensionOrigin, tabId!);
    await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 5000 });

    // The replayed component tree should include the mounted Counter.
    await expect(panelPage.locator('.component-name', { hasText: 'Counter' })).toBeVisible({
      timeout: 5000,
    });
  });

  test('editing a state value from the panel updates the inspected app', async ({ context }) => {
    const appPage = await context.newPage();
    await appPage.goto('/demos/counter');
    await appPage.waitForFunction(() => !!window.__svelte_devtools__);

    const { sw, origin: extensionOrigin } = await getExtensionOrigin(context);
    const tabId = await getActiveTabId(sw);
    expect(tabId, 'chrome.tabs.query({ active: true }) returned no tab for the app page').toBeDefined();
    await waitForBridgeCached(sw, tabId!);

    const panelPage = await openPanelPage(context, extensionOrigin, tabId!);
    await expect(panelPage.locator('.status-text.detected')).toBeVisible({ timeout: 5000 });

    // Select Counter — ComponentTree sends inspect:component on click.
    await panelPage.locator('.component-name', { hasText: 'Counter' }).first().click();

    // The count row renders an editable value; doubled must NOT be editable.
    const countRow = panelPage.locator('.signal-row', { hasText: 'count' }).first();
    const valueButton = countRow.locator('button.vt-editable').first();
    await expect(valueButton).toBeVisible({ timeout: 5000 });
    const doubledRow = panelPage.locator('.signal-row', { hasText: 'doubled' }).first();
    await expect(doubledRow.locator('button.vt-editable')).toHaveCount(0);

    await valueButton.dblclick();
    const editor = countRow.locator('input.vt-editor');
    await editor.fill('42');
    await editor.press('Enter');

    // Real end-to-end proof: the inspected app updated through Svelte itself.
    await expect(appPage.locator('[data-testid="counter-value"]')).toHaveText('42');
    await expect(appPage.locator('[data-testid="counter-doubled"]')).toContainText('84');

    // And the panel converges on the authoritative value via its live refresh.
    await expect(countRow).toContainText('42');

    // Non-JSON text into a number field refuses the commit (no silent type
    // flip) and leaves the editor usable for a follow-up edit.
    await countRow.locator('button.vt-editable').first().dblclick();
    const editor2 = countRow.locator('input.vt-editor');
    await editor2.fill('abc');
    await editor2.press('Enter');
    await expect(countRow.locator('input.vt-editor')).toHaveCount(0);
    await countRow.locator('button.vt-editable').first().dblclick();
    const editor3 = countRow.locator('input.vt-editor');
    await editor3.fill('43');
    await editor3.press('Enter');
    await expect(appPage.locator('[data-testid="counter-value"]')).toHaveText('43');
    await expect(countRow).toContainText('43');
  });
});
