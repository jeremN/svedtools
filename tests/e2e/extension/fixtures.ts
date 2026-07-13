import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

// Resolved relative to this file (not process.cwd()) so it works regardless of
// which directory the test command is invoked from.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(HERE, '../../../packages/extension/dist');

if (!existsSync(path.join(EXTENSION_PATH, 'manifest.json'))) {
  throw new Error(`Extension build not found at ${EXTENSION_PATH} (missing manifest.json). Run "pnpm build" first.`);
}

// MV3 extensions only load in a persistent context launched with the full
// "chromium" channel — the default non-persistent context (and the
// headless-shell binary used by a channel-less headless launch) never spawns
// the extension's service worker. See Playwright's chrome-extension recipe:
// https://playwright.dev/docs/chrome-extensions
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      baseURL: 'http://localhost:5173',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) {
      sw = await context.waitForEvent('serviceworker');
    }
    await use(new URL(sw.url()).host);
  },
});

export { expect } from '@playwright/test';
