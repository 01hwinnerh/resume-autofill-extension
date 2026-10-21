import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  timeout: 60_000,
  webServer: [
    {
      command: 'npm run build:test && npm run fixtures:serve -- --port 4173',
      url: 'http://127.0.0.1:4173/basic-form.html',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run fixtures:serve -- --port 4174',
      url: 'http://127.0.0.1:4174/iframe-ats-form.html',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chrome',
    launchOptions: {
      args: [
        `--disable-extensions-except=${resolve('.output/chrome-mv3')}`,
        `--load-extension=${resolve('.output/chrome-mv3')}`,
      ],
    },
  },
});
