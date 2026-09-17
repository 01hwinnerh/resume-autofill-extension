import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPreviewOverlay,
  PREVIEW_CLOSE_MESSAGE,
  PREVIEW_REQUEST_CLOSE_MESSAGE,
  PREVIEW_OVERLAY_HOST_ATTRIBUTE,
  mutationTouchesPreviewOverlay,
  postMessageOrigin,
  requestEmbeddedPreviewClose,
  requestPreviewFrameClose,
} from '../../../src/runtime/preview-overlay';
import { scanDocument } from '../../../src/form-engine/scanner';

describe('preview overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('opens in a closed shadow root, locks scrolling, and restores it on close', () => {
    document.body.innerHTML = '<label>Name<input name="name"></label>';
    document.body.style.overflow = 'auto';
    const overlay = createPreviewOverlay({ document, sessionId: 'one', previewUrl: 'chrome-extension://id/preview.html?id=one&embedded=1' });

    expect(document.querySelector(`[${PREVIEW_OVERLAY_HOST_ATTRIBUTE}]`)).toBe(overlay.host);
    expect(overlay.host.shadowRoot).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(scanDocument(document, { url: location.href, host: location.host, title: '', framePath: [] })).toHaveLength(1);

    overlay.close();
    expect(document.querySelector(`[${PREVIEW_OVERLAY_HOST_ATTRIBUTE}]`)).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('replaces an existing overlay and closes the current overlay with Escape', () => {
    document.body.innerHTML = '';
    const first = createPreviewOverlay({ document, sessionId: 'one', previewUrl: 'chrome-extension://id/preview.html?id=one&embedded=1' });
    const second = createPreviewOverlay({ document, sessionId: 'two', previewUrl: 'chrome-extension://id/preview.html?id=two&embedded=1' });

    expect(first.host.isConnected).toBe(false);
    expect(document.querySelectorAll(`[${PREVIEW_OVERLAY_HOST_ATTRIBUTE}]`)).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(second.host.isConnected).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('accepts only the embedded frame close signal for the matching session', () => {
    const overlay = createPreviewOverlay({ document, sessionId: 'safe-session', previewUrl: 'chrome-extension://id/preview.html?id=safe-session&embedded=1' });
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'chrome-extension://id', data: { type: PREVIEW_CLOSE_MESSAGE, sessionId: 'safe-session' } }));
    expect(overlay.host.isConnected).toBe(true);

    window.dispatchEvent(new MessageEvent('message', { source: overlay.frameWindow(), origin: 'chrome-extension://id', data: { type: PREVIEW_CLOSE_MESSAGE, sessionId: 'wrong' } }));
    expect(overlay.host.isConnected).toBe(true);
    window.dispatchEvent(new MessageEvent('message', { source: overlay.frameWindow(), origin: 'https://spoofed.test', data: { type: PREVIEW_CLOSE_MESSAGE, sessionId: 'safe-session' } }));
    expect(overlay.host.isConnected).toBe(true);
    window.dispatchEvent(new MessageEvent('message', { source: overlay.frameWindow(), origin: 'chrome-extension://id', data: { type: PREVIEW_CLOSE_MESSAGE, sessionId: 'safe-session' } }));
    expect(overlay.host.isConnected).toBe(false);
  });

  it('emits the embedded close message and marks host mutations as extension UI', () => {
    const postMessage = vi.fn();
    requestEmbeddedPreviewClose({ postMessage }, 'session-2', 'https://jobs.example.test');
    expect(postMessage).toHaveBeenCalledWith({ type: PREVIEW_CLOSE_MESSAGE, sessionId: 'session-2' }, 'https://jobs.example.test');
    expect(postMessage).not.toHaveBeenCalledWith(expect.anything(), '*');
    expect(postMessageOrigin('chrome-extension://extension-id/preview.html')).toBe('chrome-extension://extension-id');
    expect(postMessageOrigin('https://jobs.example.test/apply')).toBe('https://jobs.example.test');

    const framePostMessage = vi.fn();
    requestPreviewFrameClose({ postMessage: framePostMessage }, 'session-2', 'chrome-extension://extension-id');
    expect(framePostMessage).toHaveBeenCalledWith({ type: PREVIEW_REQUEST_CLOSE_MESSAGE, sessionId: 'session-2' }, 'chrome-extension://extension-id');
    expect(framePostMessage).not.toHaveBeenCalledWith(expect.anything(), '*');

    const host = document.createElement('div');
    host.setAttribute(PREVIEW_OVERLAY_HOST_ATTRIBUTE, 'session-2');
    const record = { target: document.documentElement, addedNodes: [host], removedNodes: [] } as unknown as MutationRecord;
    expect(mutationTouchesPreviewOverlay(record)).toBe(true);
  });
});
