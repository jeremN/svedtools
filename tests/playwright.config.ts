import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'runtime',
      testDir: './e2e/runtime',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'extension',
      testDir: './e2e/extension',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            `--disable-extensions-except=${process.cwd()}/../packages/extension/dist`,
            `--load-extension=${process.cwd()}/../packages/extension/dist`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @svelte-devtools/docs dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
