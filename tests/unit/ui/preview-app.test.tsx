import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FillPreviewSession } from '../../../src/preview/preview-session';
import type { RuntimeCommand } from '../../../src/shared/messages';

const api = vi.hoisted(() => ({
  runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}`, sendMessage: vi.fn() },
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
    session: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: { update: vi.fn() }, windows: { update: vi.fn() },
}));
vi.mock('wxt/browser', () => ({ browser: api }));
import App from '../../../entrypoints/preview/App';

const session: FillPreviewSession = {
  id: 'preview', kind: 'fill', createdAt: '2026-09-23T00:00:00Z',
  target: { tabId: 7, url: 'https://jobs.test/apply', title: '职位', scannedAt: '2026-09-23T00:00:00Z' },
  page: { url: 'https://jobs.test/apply', host: 'jobs.test', title: '职位' },
  fields: [
    { fieldId: 'email', profileKey: 'contact.email', value: 'candidate@example.test' },
    { fieldId: 'name', profileKey: 'identity.name', value: 'Lin' },
  ],
  items: [
    { fieldId: 'email', profileKey: 'contact.email', label: '邮箱', nextValue: 'candidate@example.test', currentValue: '', group: '基本信息', source: '资料', reasons: [], profileFieldType: 'text', policy: 'auto', controlKind: 'text', options: [] },
    { fieldId: 'name', profileKey: 'identity.name', label: '姓名', nextValue: 'Lin', currentValue: '', group: '基本信息', source: '资料', reasons: [], profileFieldType: 'text', policy: 'auto', controlKind: 'text', options: [] },
  ],
  profileSections: [], repeatSectionWarnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('browser', api);
  history.replaceState({}, '', '?id=preview&embedded=1');
  api.storage.session.get.mockResolvedValue({ 'resume-autofill.preview.preview': { ...structuredClone(session), createdAt: new Date().toISOString() } });
  api.storage.session.set.mockResolvedValue(undefined);
  api.storage.session.remove.mockResolvedValue(undefined);
  api.storage.local.get.mockResolvedValue({ 'resume-autofill.profile.v1': { schemaVersion: 1, fields: {
    'contact.email': { key: 'contact.email', label: '邮箱', type: 'text', value: 'candidate@example.test', policy: 'auto' },
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: 'Lin', policy: 'auto' },
  } } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('preview fill workflow', () => {
  it('blocks blind retry when the page operation result is unknown', async () => {
    api.runtime.sendMessage.mockResolvedValue({ ok: false, error: { code: 'FILL_RESULT_UNKNOWN', retryable: false, message: 'unknown' } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '确认填写' }));
    await screen.findByText(/不要立即重复填写/);
    expect((screen.getByRole('button', { name: '确认填写' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('recovers a completed uncertain operation by querying its operation id without refilling', async () => {
    api.runtime.sendMessage
      .mockResolvedValueOnce({ ok: false, error: { code: 'FILL_RESULT_UNKNOWN', retryable: false, message: 'unknown' } })
      .mockResolvedValueOnce({ ok: true, data: { operationId: 'ignored-by-test', state: 'completed', summary: { filled: ['email', 'name'], verified: ['email', 'name'], skippedExisting: [], failed: [] } } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '确认填写' }));
    fireEvent.click(await screen.findByRole('button', { name: '重新核对原填写结果' }));

    expect(await screen.findByText(/已写入招聘页面/)).toBeTruthy();
    expect(api.runtime.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.runtime.sendMessage.mock.calls.map(([command]) => (command as RuntimeCommand).type))
      .toEqual(['fill-confirmed-fields', 'query-fill-operation']);
    expect(api.storage.session.set.mock.calls.some(([items]) => 'resume-autofill.pending-application.v1' in items)).toBe(true);
  });

  it('keeps the fill locked while the queried operation is still running', async () => {
    api.runtime.sendMessage
      .mockResolvedValueOnce({ ok: false, error: { code: 'FILL_RESULT_UNKNOWN', retryable: false, message: 'unknown' } })
      .mockResolvedValueOnce({ ok: true, data: { operationId: 'ignored-by-test', state: 'running' } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '确认填写' }));
    fireEvent.click(await screen.findByRole('button', { name: '重新核对原填写结果' }));

    expect(await screen.findByText(/仍在进行/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '确认填写' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '再次核对原填写结果' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '我已检查页面，重新扫描' })).toBeNull();
  });

  it('requires explicit page confirmation before unlocking through a fresh scan', async () => {
    api.runtime.sendMessage
      .mockResolvedValueOnce({ ok: false, error: { code: 'FILL_RESULT_UNKNOWN', retryable: false, message: 'unknown' } })
      .mockResolvedValueOnce({ ok: true, data: { operationId: 'ignored-by-test', state: 'unknown' } })
      .mockResolvedValueOnce({ ok: true, data: {
        target: session.target, page: session.page, repeatSectionWarnings: [], frameWarnings: [],
        fields: session.items.map((item) => ({
          descriptor: { fieldId: `new-${item.fieldId}`, kind: item.controlKind, label: item.label, options: [], currentValue: '', framePath: [], fingerprint: item.fieldId },
          candidates: [], status: 'matched', selected: { profileKey: item.profileKey, score: 1, source: 'generic', reasons: [] },
        })),
      } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '确认填写' }));
    fireEvent.click(await screen.findByRole('button', { name: '重新核对原填写结果' }));
    const acknowledge = await screen.findByRole('button', { name: '我已检查页面，重新扫描' });
    expect((screen.getByRole('button', { name: '确认填写' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(acknowledge);

    await screen.findByText(/解除锁定并重新扫描/);
    expect((screen.getByRole('button', { name: '确认填写' }) as HTMLButtonElement).disabled).toBe(false);
    expect(api.runtime.sendMessage.mock.calls.map(([command]) => (command as RuntimeCommand).type))
      .toEqual(['fill-confirmed-fields', 'query-fill-operation', 'scan-active-tab']);
    expect(api.storage.session.set).toHaveBeenCalled();
  });

  it('retries only failed fields with explicit overwrite intent', async () => {
    api.runtime.sendMessage.mockResolvedValueOnce({ ok: true, data: { filled: ['name'], verified: ['name'], skippedExisting: [], failed: [{ fieldId: 'email', reason: 'current value does not match expected value' }] } })
      .mockResolvedValueOnce({ ok: true, data: { filled: ['email'], verified: ['email'], skippedExisting: [], failed: [] } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '确认填写' }));
    fireEvent.click(await screen.findByRole('button', { name: '仅重试失败项' }));
    await waitFor(() => expect(api.runtime.sendMessage).toHaveBeenCalledTimes(2));
    const retry = api.runtime.sendMessage.mock.calls[1]![0] as Extract<RuntimeCommand, { type: 'fill-confirmed-fields' }>;
    expect(retry.fields).toEqual([{ fieldId: 'email', profileKey: 'contact.email', value: 'candidate@example.test', overwrite: true }]);
    expect(await screen.findByText(/1 项成功/)).toBeTruthy();
  });

  it('allows only one fill while the first request is pending', async () => {
    let complete!: (value: unknown) => void;
    api.runtime.sendMessage.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<App />);
    const button = await screen.findByRole('button', { name: '确认填写' });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(api.runtime.sendMessage).toHaveBeenCalled());
    expect(api.runtime.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => complete({ ok: true, data: { filled: ['email', 'name'], verified: ['email', 'name'], skippedExisting: [], failed: [] } }));
  });
});
