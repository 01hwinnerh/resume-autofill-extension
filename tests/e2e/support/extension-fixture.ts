import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

declare const chrome: any;

interface ExtensionFixtures {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
  extensionPage: Page;
  targetPage: Page;
}

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'resume-autofill-e2e-'));
    const extensionPath = resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    try { await use(context); } finally { await context.close(); await rm(userDataDir, { recursive: true, force: true }); }
  },
  extensionWorker: async ({ extensionContext }, use) => {
    const worker = extensionContext.serviceWorkers()[0] ?? await extensionContext.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionId: async ({ extensionWorker }, use) => {
    await use(new URL(extensionWorker.url()).host);
  },
  extensionPage: async ({ extensionContext, extensionId }, use) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(async () => { await chrome.storage.local.clear(); await chrome.storage.session.clear(); });
    await page.reload();
    await use(page);
  },
  targetPage: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto('http://127.0.0.1:4173/basic-form.html');
    await page.bringToFront();
    await use(page);
  },
});

export { expect } from '@playwright/test';
