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

  test('content-port connect with no panel yields an authoritative disconnected signal', async ({ context }) => {
    const page = await context.newPage();

    // Collect the panel lifecycle messages relayed into the page. Registered
    // via addInitScript BEFORE navigation so the SW's very first reply to the
    // content port cannot be missed.
    await page.addInitScript(() => {
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.source === 'svelte-devtools-pro' && d.payload?.type?.startsWith('devtools:panel-')) {
          ((window as unknown as { __panelLifecycle?: string[] }).__panelLifecycle ??= []).push(d.payload.type);
        }
      });
    });

    await page.goto('/');
    await page.waitForFunction(() => !!window.__svelte_devtools__);

    // No panel is open in this test, so the SW's content-connect branch must
    // answer with the authoritative "no panel" signal — the F14 resync point
    // that un-gates a bridge left hot after a service-worker restart wiped the
    // in-memory port maps.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __panelLifecycle?: string[] }).__panelLifecycle ?? []))
      .toContain('devtools:panel-disconnected');
  });
});
