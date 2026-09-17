import { describe, expect, it, vi } from 'vitest';

import { openPreviewInTargetTab, targetTabState } from '../../../src/runtime/preview-target';
import type { ScanTarget } from '../../../src/runtime/scan-session';

const target: ScanTarget = {
  tabId: 7,
  windowId: 2,
  url: 'https://jobs.example.test/apply',
  title: 'Apply',
  scannedAt: '2026-09-17T10:00:00.000Z',
};

describe('preview target', () => {
  it('opens the embedded preview in the scanned top frame without creating a tab', async () => {
    const sendMessage = vi.fn(async () => ({ type: 'preview-overlay-opened' as const, sessionId: 'session-1' }));
    const create = vi.fn();
    const tabs = { sendMessage, create };

    await openPreviewInTargetTab(tabs, target, 'session-1', 'chrome-extension://id/preview.html?id=session-1&embedded=1');

    expect(sendMessage).toHaveBeenCalledWith(7, {
      type: 'open-preview-overlay',
      sessionId: 'session-1',
      previewUrl: 'chrome-extension://id/preview.html?id=session-1&embedded=1',
    }, { frameId: 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an unconfirmed overlay response instead of falling back to a new tab', async () => {
    const sendMessage = vi.fn(async () => ({ type: 'focus-result' as const, requestId: 'x', fieldId: 'x', focused: false }));
    await expect(openPreviewInTargetTab({ sendMessage }, target, 'session-1', 'chrome-extension://id/preview.html?id=session-1&embedded=1'))
      .rejects.toThrow(/未能确认预览窗口/);
  });

  it('suspends on another tab, resumes on the same URL, and invalidates a changed target URL', () => {
    expect(targetTabState(target, { id: 99, url: 'https://other.test' })).toBe('suspended');
    expect(targetTabState(target, { id: 7, url: target.url })).toBe('active');
    expect(targetTabState(target, { id: 7, url: 'https://jobs.example.test/another' })).toBe('invalidated');
  });
});
