import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(HERE, '../../../packages/extension/dist/manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as { name: string };

test.describe('Extension loads (MV3)', () => {
  test('the MV3 service worker spawns', async ({ extensionId }) => {
    expect(extensionId).toBeTruthy();
  });

  test('the service worker is the real extension, not a stray one', async ({ context }) => {
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }

    expect(sw.url()).toMatch(/^chrome-extension:\/\//);

    const manifestName = await sw.evaluate(() => chrome.runtime.getManifest().name);
    expect(manifestName).toBe(manifest.name);
  });

  test('the content script relay is alive for a loaded page', async ({ context }) => {
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }

    const page = await context.newPage();
    await page.goto('/demos/counter');
    await page.waitForFunction(() => !!window.__svelte_devtools__);

    // The manifest declares no "tabs" permission (only content_scripts host
    // access), so chrome.tabs.query() never exposes the .url field and can't
    // filter by url pattern either — only non-sensitive properties like `id`
    // and `active` are available. The page we just opened is the active tab.
    const tabs = await sw.evaluate(() => chrome.tabs.query({ active: true }));
    expect(tabs.length, 'chrome.tabs.query({ active: true }) found no active tab').toBeGreaterThan(0);
    expect(tabs[0].id).toBeDefined();
  });
});
