#!/usr/bin/env node
/**
 * Launches a Playwright-controlled Chromium with Svelte DevTools Pro
 * preloaded as an unpacked extension, navigating to the playground.
 *
 * Use for hands-on testing without touching your everyday Chrome profile.
 * The browser stays open until you close it manually.
 *
 * Requires:
 *   - `pnpm --filter @svelte-devtools/extension build` (so packages/extension/dist exists)
 *   - `pnpm --filter playground dev` running at http://localhost:5173/
 *
 * Usage:
 *   node scripts/launch-extension-demo.mjs [url]
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = resolve(__dirname, '../packages/extension/dist');
const targetUrl = process.argv[2] ?? 'http://localhost:5173/';

const userDataDir = resolve(__dirname, '../.demo-chromium-profile');

const context = await chromium.launchPersistentContext(userDataDir, {
  // Playwright's Chromium build, same as the e2e fixture: branded Google
  // Chrome silently ignores --load-extension since 137, so the "chrome"
  // channel opens a browser with no extension and no error. If launch
  // complains about a profile created by a newer Chrome, delete
  // .demo-chromium-profile/.
  channel: 'chromium',
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  viewport: { width: 1280, height: 800 },
});

const page = await context.newPage();
await page.goto(targetUrl);

console.log(`\n  Extension loaded from: ${extensionPath}`);
console.log(`  Navigated to:          ${targetUrl}`);
console.log(`  Profile dir:           ${userDataDir}`);
console.log(`\n  Open DevTools (Cmd+Option+I) and look for the "Svelte" tab.`);
console.log(`  Close the browser window to exit.\n`);

context.on('close', () => process.exit(0));
