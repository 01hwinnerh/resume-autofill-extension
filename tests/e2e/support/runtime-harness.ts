import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Frame, Page } from '@playwright/test';
import type { PageMessage, PageResponse } from '../../../src/shared/messages';

const runtimeBundle = readFileSync(resolve('.output/chrome-mv3/form-runtime.js'), 'utf8');
interface HarnessSession { token: string; fields: Map<string, { frame: Frame; fingerprint?: string }> }
const sessions = new WeakMap<Page, HarnessSession>();

async function initialize(frame: Frame): Promise<void> {
  const initialized = await frame.evaluate(() => Boolean((globalThis as { __resumeRuntimeReady?: boolean }).__resumeRuntimeReady));
  if (initialized) return;
  await frame.evaluate(() => {
    const global = globalThis as typeof globalThis & {
      browser?: { runtime: { id: string; sendMessage: (message: unknown) => Promise<void>; onMessage: { addListener: (listener: (message: PageMessage) => unknown) => void } } };
      __resumeRuntimeListeners?: Array<(message: PageMessage) => unknown>;
      __resumeRuntimeNotifications?: unknown[];
      __resumeRuntimeReady?: boolean;
    };
    const listeners: Array<(message: PageMessage) => unknown> = [];
    const notifications: unknown[] = [];
    global.browser = { runtime: { id: 'fixture-extension', sendMessage: async (message) => { notifications.push(message); }, onMessage: { addListener: (listener) => listeners.push(listener) } } };
    global.__resumeRuntimeListeners = listeners;
    global.__resumeRuntimeNotifications = notifications;
    global.__resumeRuntimeReady = false;
  });
  await frame.addScriptTag({ content: runtimeBundle });
  await frame.evaluate(() => { (globalThis as { __resumeRuntimeReady?: boolean }).__resumeRuntimeReady = true; });
}

async function dispatch(frame: Frame, message: PageMessage): Promise<PageResponse> {
  await initialize(frame);
  return frame.evaluate(async (currentMessage) => {
    const listener = (globalThis as { __resumeRuntimeListeners?: Array<(message: PageMessage) => unknown> }).__resumeRuntimeListeners?.[0];
    if (!listener) throw new Error('form runtime listener was not registered');
    return await listener(currentMessage) as PageResponse;
  }, message);
}

export async function runRuntimeMessage(page: Page, message: Extract<PageMessage, { type: 'scan-page' }>): Promise<Extract<PageResponse, { type: 'scan-result' }>>;
export async function runRuntimeMessage(page: Page, message: Extract<PageMessage, { type: 'fill-fields' }>): Promise<Extract<PageResponse, { type: 'fill-result' }>>;
export async function runRuntimeMessage(page: Page, message: PageMessage): Promise<PageResponse>;
export async function runRuntimeMessage(page: Page, message: PageMessage): Promise<PageResponse> {
  if (message.type === 'scan-page') {
    const token = `e2e-${Date.now()}`;
    const fields = new Map<string, { frame: Frame; fingerprint?: string }>();
    const responses: Array<Extract<PageResponse, { type: 'scan-result' }>> = [];
    for (const [index, frame] of page.frames().entries()) {
      try {
        const namespace = index === 0 ? 'tab-e2e-frame-main' : `tab-e2e-frame-${index - 1}`;
        const response = await dispatch(frame, { ...message, scanToken: token, namespace });
        if (response.type !== 'scan-result') continue;
        response.result.descriptors = response.result.descriptors.map((field) => ({
          ...field, tabId: 1, frameId: index, framePath: index === 0 ? [] : [index - 1],
        }));
        response.result.descriptors.forEach((field) => fields.set(field.fieldId, { frame, fingerprint: response.result.fingerprint }));
        responses.push(response);
      } catch { /* inaccessible fixture frame is intentionally non-fatal */ }
    }
    sessions.set(page, { token, fields });
    const top = responses[0];
    if (!top) throw new Error('no frame could be scanned');
    return { ...top, result: { ...top.result, descriptors: responses.flatMap((response) => response.result.descriptors) } };
  }

  const session = sessions.get(page);
  if (message.type === 'fill-fields' && session) {
    const grouped = new Map<Frame, typeof message.fields>();
    const pending = new Set(message.fields.map((field) => field.fieldId));
    for (const field of message.fields) {
      const owner = session.fields.get(field.fieldId)?.frame;
      if (owner) grouped.set(owner, [...(grouped.get(owner) ?? []), field]);
    }
    const results = [];
    for (const [frame, fields] of grouped) {
      const fingerprint = session.fields.get(fields[0].fieldId)?.fingerprint;
      const response = await dispatch(frame, { ...message, fields, scanToken: session.token, expectedFingerprint: fingerprint });
      if (response.type === 'error') return response;
      if (response.type === 'fill-result') {
        results.push(...response.results);
        fields.forEach((field) => pending.delete(field.fieldId));
      }
    }
    for (const fieldId of pending) results.push({ fieldId, outcome: { status: 'failed' as const, fieldId, reason: 'field is unavailable; rescan required' } });
    return { type: 'fill-result', requestId: message.requestId, results };
  }

  return dispatch(page.mainFrame(), message);
}

export async function runtimeNotifications(page: Page): Promise<unknown[]> {
  return page.evaluate(() => [...((globalThis as { __resumeRuntimeNotifications?: unknown[] }).__resumeRuntimeNotifications ?? [])]);
}
