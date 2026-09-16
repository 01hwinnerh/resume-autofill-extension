import { describe, expect, it, vi } from 'vitest';

import { AdapterRegistry } from '../../../src/adapters/adapter-registry';
import {
  createApplicationController,
  type BrowserPort,
} from '../../../src/runtime/application-controller';
import type { Profile } from '../../../src/shared/profile';
import type { PageMessage, PageResponse } from '../../../src/shared/messages';

const descriptor = {
  fieldId: 'field-1',
  kind: 'text' as const,
  label: '邮箱',
  name: 'email',
  options: [],
  currentValue: '',
  framePath: [],
  fingerprint: 'text|邮箱|email||',
};

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'contact.email': {
      key: 'contact.email',
      label: '邮箱',
      type: 'text',
      value: 'candidate@example.test',
      policy: 'auto',
    },
  },
};

function dependencies(browser: BrowserPort, timeoutMs = 5000, adapterRegistry = new AdapterRegistry()) {
  return {
    browser,
    profileStore: { load: vi.fn(async () => profile) },
    mappingStore: { list: vi.fn(async () => []) },
    adapterRegistry,
    timeoutMs,
  };
}

describe('application controller', () => {
  it('scans without sending profile values to the page', async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: PageMessage): Promise<PageResponse> => {
      if (message.type !== 'scan-page') throw new Error('unexpected fill command');
      return {
        type: 'scan-result',
        requestId: message.requestId,
        result: { descriptors: [descriptor] },
      };
    });
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]),
        sendMessage,
      },
      scripting: {
        executeScript: vi.fn(async () => undefined),
      },
    } satisfies BrowserPort;

    const result = await createApplicationController(dependencies(browser)).scanActiveTab();

    expect(result.fields[0]?.selected?.profileKey).toBe('contact.email');
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['form-runtime.js'],
    });
    const scanMessage = sendMessage.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(scanMessage.type).toBe('scan-page');
    expect(scanMessage).not.toHaveProperty('profile');
    expect(scanMessage).not.toHaveProperty('mappings');
  });

  it('passes registered site adapter hints into match resolution', async () => {
    const unnamed = { ...descriptor, label: '', name: undefined, htmlId: undefined, fingerprint: 'text||||' };
    const sendMessage = vi.fn(async (_tabId: number, message: PageMessage): Promise<PageResponse> => ({
      type: 'scan-result', requestId: message.requestId, result: { descriptors: [unnamed] },
    }));
    const browser = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://jobs.bytedance.com/campus/resume/123/apply', title: '申请' }]), sendMessage },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;
    const registry = new AdapterRegistry();
    registry.register({
      id: 'fixture-adapter',
      matches: () => true,
      discoverHints: () => [{ fieldId: 'field-1', profileKey: 'contact.email', score: 0.96, reason: 'site adapter' }],
    });

    const result = await createApplicationController(dependencies(browser, 5000, registry)).scanActiveTab();

    expect(result.adapterId).toBe('fixture-adapter');
    expect(result.fields[0]?.selected).toMatchObject({ profileKey: 'contact.email', source: 'adapter', score: 0.96 });
  });

  it('aggregates verified, skipped, and failed field outcomes independently', async () => {
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]),
        sendMessage: vi.fn(async (_tabId: number, message: PageMessage): Promise<PageResponse> => {
          if (message.type !== 'fill-fields') throw new Error('unexpected scan command');
          return {
            type: 'fill-result',
            requestId: message.requestId,
            results: [
              {
                fieldId: 'filled',
                outcome: { status: 'filled', fieldId: 'filled' },
                verification: { fieldId: 'filled', verified: true },
              },
              {
                fieldId: 'skipped',
                outcome: { status: 'skipped_existing', fieldId: 'skipped' },
              },
              {
                fieldId: 'failed',
                outcome: { status: 'failed', fieldId: 'failed', reason: 'no matching option' },
                verification: { fieldId: 'failed', verified: false, reason: 'not selected' },
              },
            ],
          };
        }),
      },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;

    const summary = await createApplicationController(dependencies(browser)).fillConfirmed([
      { fieldId: 'filled', profileKey: 'contact.email', value: 'candidate@example.test' },
    ]);

    expect(summary).toEqual({
      filled: ['filled'],
      verified: ['filled'],
      skippedExisting: ['skipped'],
      failed: [
        { fieldId: 'failed', reason: 'no matching option' },
      ],
    });
  });

  it('locates a scanned field through the page runtime', async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: PageMessage): Promise<PageResponse> => ({
      type: 'focus-result', requestId: message.requestId, fieldId: 'field-1', focused: true,
    }));
    const browser = {
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]), sendMessage },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;

    await expect(createApplicationController(dependencies(browser)).focusField('field-1')).resolves.toEqual({ fieldId: 'field-1', focused: true });
    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'focus-field', fieldId: 'field-1' }));
  });

  it('translates injection failures into a permission error', async () => {
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]),
        sendMessage: vi.fn<BrowserPort['tabs']['sendMessage']>(),
      },
      scripting: {
        executeScript: vi.fn(async () => { throw new Error('permission denied'); }),
      },
    } satisfies BrowserPort;

    await expect(createApplicationController(dependencies(browser)).scanActiveTab())
      .rejects.toMatchObject({ code: 'PERMISSION_DENIED', retryable: true });
  });

  it('rejects fill when the scanned tab URL has changed', async () => {
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]),
        get: vi.fn(async () => ({ id: 7, url: 'https://job.test/another', title: 'Another job' })),
        sendMessage: vi.fn<BrowserPort['tabs']['sendMessage']>(),
      },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;

    await expect(createApplicationController(dependencies(browser)).fillConfirmed(
      [{ fieldId: 'field-1', profileKey: 'contact.email', value: 'candidate@example.test' }],
      { tabId: 7, url: 'https://job.test/app', title: 'Apply', scannedAt: '2026-09-15T10:00:00.000Z' },
    )).rejects.toMatchObject({ code: 'TAB_UNAVAILABLE', retryable: true });
    expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('uses the explicitly scanned tab even when another tab is active', async () => {
    const sendMessage = vi.fn(async (_tabId: number, message: PageMessage): Promise<PageResponse> => ({
      type: 'focus-result', requestId: message.requestId, fieldId: 'field-1', focused: true,
    }));
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 99, url: 'https://unrelated.test', title: 'Other' }]),
        get: vi.fn(async () => ({ id: 7, url: 'https://job.test/app', title: 'Apply' })),
        sendMessage,
      },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;

    await createApplicationController(dependencies(browser)).focusField(
      'field-1',
      { tabId: 7, url: 'https://job.test/app', title: 'Apply', scannedAt: '2026-09-15T10:00:00.000Z' },
    );

    expect(browser.tabs.query).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: 'focus-field' }));
  });

  it('returns a retryable timeout for a scan response', async () => {
    const browser = {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://job.test/app', title: 'Apply' }]),
        sendMessage: vi.fn<BrowserPort['tabs']['sendMessage']>(() => new Promise<PageResponse>(() => {})),
      },
      scripting: { executeScript: vi.fn(async () => undefined) },
    } satisfies BrowserPort;

    await expect(createApplicationController(dependencies(browser, 1)).scanActiveTab())
      .rejects.toMatchObject({ code: 'CONTENT_SCRIPT_TIMEOUT', retryable: true });
  });
});
