import { AdapterRegistry } from '../adapters/adapter-registry';
import type { PageContext } from '../adapters/adapter-types';
import { resolveMatches } from '../matching/resolve-match';
import { repeatSectionWarnings } from '../matching/repeat-section-warnings';
import type { MappingStore } from '../storage/mapping-store';
import type { ProfileStore } from '../profile/profile-store';
import type { PageFieldDescriptor, ScanResult } from '../shared/form';
import type {
  ConfirmedFill,
  PageResponse,
  RuntimeCommandResponse,
} from '../shared/messages';
import type { PageMessage } from '../shared/messages';
import type { FillOutcome, VerificationOutcome } from '../filling/fill-types';
import { assertScanTarget, type ScanTarget } from './scan-session';

import {
  CONTENT_SCRIPT_TIMEOUT_MS,
  createRuntimeError,
  RuntimeRequestError,
} from './runtime-errors';

export interface ActiveTab {
  id?: number;
  windowId?: number;
  url?: string;
  title?: string;
}

export interface BrowserPort {
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<ActiveTab[]>;
    get?(tabId: number): Promise<ActiveTab>;
    sendMessage(tabId: number, message: PageMessage, options?: { frameId: number }): Promise<PageResponse>;
  };
  scripting: {
    executeScript(details: { target: { tabId: number; allFrames?: true }; files: string[] }): Promise<Array<{ frameId?: number }> | void>;
  };
}

export interface ControllerDependencies {
  browser: BrowserPort;
  profileStore: Pick<ProfileStore, 'load'>;
  mappingStore: Pick<MappingStore, 'list'>;
  adapterRegistry: AdapterRegistry;
  timeoutMs?: number;
}

export interface ApplicationController {
  scanActiveTab(target?: Pick<ScanTarget, 'tabId' | 'windowId' | 'url' | 'title'>): Promise<ScanResult>;
  fillConfirmed(fields: ConfirmedFill[], target?: ScanTarget): Promise<FillSummary>;
  focusField(fieldId: string, target?: ScanTarget): Promise<{ fieldId: string; focused: boolean }>;
}

export interface FillSummary {
  filled: string[];
  verified: string[];
  skippedExisting: string[];
  failed: Array<{ fieldId: string; reason: string }>;
}

let requestSequence = 0;

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${requestSequence}`;
}

function pageContext(tab: ActiveTab): PageContext & { path: string } {
  if (!tab.url) {
    throw new RuntimeRequestError(createRuntimeError(
      'TAB_UNAVAILABLE',
      'The active tab has no accessible URL.',
      true,
    ));
  }

  const url = new URL(tab.url);
  return {
    url: url.href,
    host: url.host,
    path: url.pathname,
    title: tab.title ?? '',
  };
}

function toRuntimeError(error: unknown, code: 'PERMISSION_DENIED' | 'CONTENT_SCRIPT_UNAVAILABLE'): RuntimeRequestError {
  return new RuntimeRequestError(createRuntimeError(
    code,
    code === 'PERMISSION_DENIED'
      ? 'The extension does not have access to the active tab.'
      : 'The page runtime is unavailable.',
    true,
  ), error);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => RuntimeRequestError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createApplicationController(
  dependencies: ControllerDependencies,
): ApplicationController {
  const timeoutMs = dependencies.timeoutMs ?? CONTENT_SCRIPT_TIMEOUT_MS;

  async function activeTab(): Promise<ActiveTab> {
    const [tab] = await dependencies.browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new RuntimeRequestError(createRuntimeError(
        'TAB_UNAVAILABLE',
        'No active tab is available for form operations.',
        true,
      ));
    }
    return tab;
  }

  async function targetTab(target?: Pick<ScanTarget, 'tabId' | 'windowId' | 'url' | 'title'>): Promise<ActiveTab> {
    if (!target) return activeTab();
    const tab = dependencies.browser.tabs.get
      ? await dependencies.browser.tabs.get(target.tabId)
      : await activeTab();
    try {
      assertScanTarget({ ...target, scannedAt: '' }, tab);
    } catch (cause) {
      throw new RuntimeRequestError(createRuntimeError(
        'TAB_UNAVAILABLE',
        cause instanceof Error ? cause.message : '当前页面已变化，请重新扫描。',
        true,
      ), cause);
    }
    return tab;
  }

  async function injectRuntime(tabId: number): Promise<number[]> {
    const execute = (allFrames: boolean) => withTimeout(
      dependencies.browser.scripting.executeScript({
        target: allFrames ? { tabId, allFrames: true } : { tabId },
        files: ['form-runtime.js'],
      }),
      timeoutMs,
      () => new RuntimeRequestError(createRuntimeError('CONTENT_SCRIPT_TIMEOUT', 'The page runtime did not load in time.', true)),
    );
    try {
      // A resolved allFrames call returns one InjectionResult per successfully injected frame; preserve every frameId.
      // A rejected executeScript promise exposes no partial InjectionResult array, so the only safe recovery without
      // webNavigation or a persistent content script is a user-triggered top-frame retry.
      const results = await execute(true);
      const frameIds = (results ?? []).flatMap((result) => typeof result.frameId === 'number' ? [result.frameId] : []);
      return frameIds.length ? [...new Set(frameIds)] : [0];
    } catch (error) {
      if (error instanceof RuntimeRequestError) throw error;
      try {
        await execute(false);
        return [0];
      } catch (fallbackError) {
        if (fallbackError instanceof RuntimeRequestError) throw fallbackError;
        throw toRuntimeError(fallbackError, 'PERMISSION_DENIED');
      }
    }
  }

  async function sendPageMessage(tabId: number, message: PageMessage, fill: boolean, frameId = 0): Promise<PageResponse> {
    try {
      const response = await withTimeout(
        dependencies.browser.tabs.sendMessage(tabId, message, { frameId }),
        timeoutMs,
        () => new RuntimeRequestError(createRuntimeError(
          'CONTENT_SCRIPT_TIMEOUT',
          'The page runtime did not respond in time.',
          !fill,
        )),
      );
      if (response.type === 'error') {
        throw new RuntimeRequestError(response.error);
      }
      return response;
    } catch (error) {
      if (error instanceof RuntimeRequestError) throw error;
      throw toRuntimeError(error, 'CONTENT_SCRIPT_UNAVAILABLE');
    }
  }

  async function scanActiveTab(target?: Pick<ScanTarget, 'tabId' | 'windowId' | 'url' | 'title'>): Promise<ScanResult> {
    const tab = await targetTab(target);
    const context = pageContext(tab);
    const [profile, mappings] = await Promise.all([dependencies.profileStore.load(), dependencies.mappingStore.list()]);
    const frameIds = await injectRuntime(tab.id!);
    const scanToken = `${nextRequestId('session')}-${Date.now()}`;
    const frameWarnings: string[] = [];
    const responses = await Promise.all(frameIds.map(async (frameId) => {
      try {
        const response = await sendPageMessage(tab.id!, {
          type: 'scan-page', requestId: nextRequestId('scan'), namespace: `tab-${tab.id}-frame-${frameId}`, scanToken,
        }, false, frameId);
        return response.type === 'scan-result' ? { frameId, result: response.result } : undefined;
      } catch (error) {
        if (frameId === 0) throw error;
        frameWarnings.push(`iframe ${frameId} 无法访问或缺少站点权限，已跳过。`);
        return undefined;
      }
    }));
    const scans = responses.filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!scans.length) throw new RuntimeRequestError(createRuntimeError('SCAN_FAILED', '页面及其 iframe 均无法扫描。', true));
    const top = scans.find((item) => item.frameId === 0) ?? scans[0];
    if (top.result.childFrameCount !== undefined && frameIds.length - 1 < top.result.childFrameCount) {
      frameWarnings.push('部分 iframe 因跨域站点权限或浏览器限制无法访问，其他可访问字段仍可使用。');
    }
    const fields = scans.flatMap(({ frameId, result }) => result.descriptors.map((field) => ({
      ...field, tabId: tab.id!, frameId, framePath: frameId === 0 ? [] : [frameId],
    }))) as PageFieldDescriptor[];
    const adapter = dependencies.adapterRegistry.resolve(context);
    return {
      target: {
        tabId: tab.id!, windowId: tab.windowId, url: context.url, title: context.title,
        scannedAt: new Date().toISOString(), scanToken,
        frames: scans.map(({ frameId, result }) => ({
          frameId, fingerprint: result.fingerprint ?? '', fieldIds: result.descriptors.map((field) => field.fieldId),
        })),
      },
      page: {
        url: context.url, host: context.host, title: context.title,
        ...(top.result.metadata ? { metadata: top.result.metadata } : {}),
      },
      adapterId: top.result.adapterId ?? adapter?.id,
      fields: resolveMatches(fields, profile, {
        mappings, pageContext: { host: context.host, path: context.path }, adapterHints: adapter?.discoverHints(fields) ?? [],
      }),
      repeatSectionWarnings: repeatSectionWarnings(fields, profile),
      frameWarnings,
    };
  }

  async function fillConfirmed(fields: ConfirmedFill[], target?: ScanTarget): Promise<FillSummary> {
    const tab = await targetTab(target);
    await injectRuntime(tab.id!);
    const frameTargets = target?.frames?.length ? target.frames : [{ frameId: 0, fingerprint: '', fieldIds: fields.map((field) => field.fieldId) }];
    const pending = new Set(fields.map((field) => field.fieldId));
    const pageResults: Array<import('../shared/messages').PageFillResult> = [];
    for (const frame of frameTargets) {
      const frameFields = fields.filter((field) => frame.fieldIds.includes(field.fieldId));
      if (!frameFields.length) continue;
      try {
        const response = await sendPageMessage(tab.id!, {
          type: 'fill-fields', requestId: nextRequestId('fill'), fields: frameFields,
          scanToken: target?.scanToken, expectedFingerprint: frame.fingerprint || undefined,
        }, true, frame.frameId);
        if (response.type === 'error') throw new RuntimeRequestError(response.error);
        if (response.type !== 'fill-result') throw new Error('invalid frame fill response');
        pageResults.push(...response.results);
        frameFields.forEach((field) => pending.delete(field.fieldId));
      } catch (error) {
        if (error instanceof RuntimeRequestError && /重新扫描/.test(error.message)) throw error;
        pageResults.push(...frameFields.map((field) => ({
          fieldId: field.fieldId,
          outcome: { status: 'failed' as const, fieldId: field.fieldId, reason: `iframe ${frame.frameId} 无法访问或已导航，请重新扫描` },
        })));
        frameFields.forEach((field) => pending.delete(field.fieldId));
      }
    }
    for (const fieldId of pending) pageResults.push({ fieldId, outcome: { status: 'failed', fieldId, reason: '字段所属 iframe 不在扫描会话中，请重新扫描' } });

    const summary: FillSummary = { filled: [], verified: [], skippedExisting: [], failed: [] };
    for (const result of pageResults) {
      if (result.outcome.status === 'filled') summary.filled.push(result.fieldId);
      if (result.outcome.status === 'skipped_existing') summary.skippedExisting.push(result.fieldId);
      if (result.verification?.verified) summary.verified.push(result.fieldId);
      if (result.outcome.status === 'failed') {
        summary.failed.push({ fieldId: result.fieldId, reason: result.outcome.reason });
      } else if (result.verification && !result.verification.verified) {
        summary.failed.push({
          fieldId: result.fieldId,
          reason: result.verification.reason ?? 'field verification failed',
        });
      }
    }
    return summary;
  }

  async function focusField(fieldId: string, target?: ScanTarget): Promise<{ fieldId: string; focused: boolean }> {
    const tab = await targetTab(target);
    await injectRuntime(tab.id!);
    const frame = target?.frames?.find((item) => item.fieldIds.includes(fieldId));
    if (target?.frames && !frame) throw new RuntimeRequestError(createRuntimeError('FIELD_OPERATION_FAILED', '字段所属 iframe 已失效，请重新扫描。', true));
    const response = await sendPageMessage(tab.id!, {
      type: 'focus-field', requestId: nextRequestId('focus'), fieldId,
      scanToken: target?.scanToken, expectedFingerprint: frame?.fingerprint || undefined,
    }, false, frame?.frameId ?? 0);
    if (response.type !== 'focus-result') {
      throw new RuntimeRequestError(createRuntimeError('FIELD_OPERATION_FAILED', 'The page field could not be located.', true));
    }
    return { fieldId: response.fieldId, focused: response.focused };
  }

  return { scanActiveTab, fillConfirmed, focusField };
}

export function handleRuntimeCommand(
  controller: ApplicationController,
  command: import('../shared/messages').RuntimeCommand,
): Promise<RuntimeCommandResponse> {
  const operation = command.type === 'scan-active-tab'
    ? controller.scanActiveTab(command.target)
    : command.type === 'fill-confirmed-fields'
      ? controller.fillConfirmed(command.fields, command.target)
      : controller.focusField(command.fieldId, command.target);
  return operation
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => {
      if (error instanceof RuntimeRequestError) return { ok: false as const, error: error.runtimeError };
      return {
        ok: false as const,
        error: createRuntimeError('CONTENT_SCRIPT_UNAVAILABLE', 'The form runtime failed.', true),
      };
    });
}

export type { FillOutcome, VerificationOutcome };
