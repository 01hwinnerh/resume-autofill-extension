import { AdapterRegistry } from '../adapters/adapter-registry';
import type { PageContext } from '../adapters/adapter-types';
import { resolveMatches } from '../matching/resolve-match';
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
    sendMessage(tabId: number, message: PageMessage): Promise<PageResponse>;
  };
  scripting: {
    executeScript(details: { target: { tabId: number }; files: string[] }): Promise<unknown>;
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

  async function injectRuntime(tabId: number): Promise<void> {
    try {
      await withTimeout(
        dependencies.browser.scripting.executeScript({
          target: { tabId },
          files: ['form-runtime.js'],
        }),
        timeoutMs,
        () => new RuntimeRequestError(createRuntimeError(
          'CONTENT_SCRIPT_TIMEOUT',
          'The page runtime did not load in time.',
          true,
        )),
      );
    } catch (error) {
      if (error instanceof RuntimeRequestError) throw error;
      throw toRuntimeError(error, 'PERMISSION_DENIED');
    }
  }

  async function sendPageMessage(tabId: number, message: PageMessage, fill: boolean): Promise<PageResponse> {
    try {
      const response = await withTimeout(
        dependencies.browser.tabs.sendMessage(tabId, message),
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
    const [profile, mappings] = await Promise.all([
      dependencies.profileStore.load(),
      dependencies.mappingStore.list(),
    ]);

    await injectRuntime(tab.id!);
    const response = await sendPageMessage(tab.id!, {
      type: 'scan-page',
      requestId: nextRequestId('scan'),
    }, false);
    if (response.type !== 'scan-result') {
      throw new RuntimeRequestError(createRuntimeError(
        'SCAN_FAILED',
        'The page did not return a scan result.',
        true,
      ));
    }

    const adapter = dependencies.adapterRegistry.resolve(context);
    const fields = response.result.descriptors as PageFieldDescriptor[];
    return {
      target: {
        tabId: tab.id!,
        windowId: tab.windowId,
        url: context.url,
        title: context.title,
        scannedAt: new Date().toISOString(),
      },
      page: {
        url: context.url,
        host: context.host,
        title: context.title,
        ...(response.result.metadata ? { metadata: response.result.metadata } : {}),
      },
      adapterId: response.result.adapterId ?? adapter?.id,
      fields: resolveMatches(fields, profile, {
        mappings,
        pageContext: { host: context.host, path: context.path },
        adapterHints: adapter?.discoverHints(fields) ?? [],
      }),
    };
  }

  async function fillConfirmed(fields: ConfirmedFill[], target?: ScanTarget): Promise<FillSummary> {
    const tab = await targetTab(target);
    await injectRuntime(tab.id!);
    const response = await sendPageMessage(tab.id!, {
      type: 'fill-fields',
      requestId: nextRequestId('fill'),
      fields,
    }, true);
    if (response.type !== 'fill-result') {
      throw new RuntimeRequestError(createRuntimeError(
        'FIELD_OPERATION_FAILED',
        'The page did not return field operation results.',
        false,
      ));
    }

    const summary: FillSummary = {
      filled: [],
      verified: [],
      skippedExisting: [],
      failed: [],
    };
    for (const result of response.results) {
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
    const response = await sendPageMessage(tab.id!, {
      type: 'focus-field',
      requestId: nextRequestId('focus'),
      fieldId,
    }, false);
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
