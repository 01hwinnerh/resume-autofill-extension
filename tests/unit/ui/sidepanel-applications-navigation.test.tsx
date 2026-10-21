import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const browserMock = vi.hoisted(() => ({
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    session: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    sendMessage: vi.fn(async () => ({ ok: true, data: {} })),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    create: vi.fn(async () => undefined),
    query: vi.fn(async () => []),
    get: vi.fn(async () => ({})),
    onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
  },
}));

vi.mock('wxt/browser', () => ({ browser: browserMock }));

import App from '../../../entrypoints/sidepanel/App';

beforeAll(() => { Object.assign(globalThis, { browser: browserMock }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('sidepanel application records navigation', () => {
  it('switches and highlights the in-panel view without opening a browser tab', async () => {
    render(<App />);
    const applicationsTab = screen.getByRole('button', { name: '投递记录' });
    fireEvent.click(applicationsTab);

    expect(applicationsTab.className).toContain('active');
    expect(applicationsTab.getAttribute('aria-current')).toBe('page');
    expect(await screen.findByRole('heading', { name: '投递记录' })).toBeTruthy();
    expect(browserMock.tabs.create).not.toHaveBeenCalled();
  });
});
