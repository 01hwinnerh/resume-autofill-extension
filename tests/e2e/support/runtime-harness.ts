import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

import type { PageMessage, PageResponse } from '../../../src/shared/messages';

const runtimeBundle = readFileSync(resolve('.output/chrome-mv3/form-runtime.js'), 'utf8');

export async function runRuntimeMessage(
  page: Page,
  message: Extract<PageMessage, { type: 'scan-page' }>,
): Promise<Extract<PageResponse, { type: 'scan-result' }>>;
export async function runRuntimeMessage(
  page: Page,
  message: Extract<PageMessage, { type: 'fill-fields' }>,
): Promise<Extract<PageResponse, { type: 'fill-result' }>>;
export async function runRuntimeMessage(page: Page, message: PageMessage): Promise<PageResponse> {
  const initialized = await page.evaluate(() => Boolean((globalThis as { __resumeRuntimeReady?: boolean }).__resumeRuntimeReady));
  if (!initialized) {
    await page.evaluate(() => {
      const global = globalThis as typeof globalThis & {
        browser?: { runtime: { id: string; onMessage: { addListener: (listener: (message: PageMessage) => unknown) => void } } };
        __resumeRuntimeListeners?: Array<(message: PageMessage) => unknown>;
        __resumeRuntimeReady?: boolean;
      };
      const listeners: Array<(message: PageMessage) => unknown> = [];
      global.browser = {
        runtime: {
          id: 'fixture-extension',
          onMessage: { addListener: (listener) => listeners.push(listener) },
        },
      };
      global.__resumeRuntimeListeners = listeners;
      global.__resumeRuntimeReady = false;
    });
    await page.addScriptTag({ content: runtimeBundle });
    await page.evaluate(() => {
      (globalThis as { __resumeRuntimeReady?: boolean }).__resumeRuntimeReady = true;
    });
  }

  return page.evaluate(async (currentMessage) => {
    const listeners = (globalThis as { __resumeRuntimeListeners?: Array<(message: PageMessage) => unknown> }).__resumeRuntimeListeners ?? [];
    const listener = listeners[0];
    if (!listener) throw new Error('form runtime listener was not registered');
    return await listener(currentMessage) as PageResponse;
  }, message);
}
