import { describe, expect, it } from 'vitest';

import { assertScanTarget, isScanTargetCurrent } from '../../../src/runtime/scan-session';

const target = { tabId: 17, url: 'https://careers.example.com/jobs/1', title: 'Frontend Engineer', scannedAt: '2026-09-15T10:00:00.000Z' };

describe('scan session target', () => {
  it('accepts the exact tab and URL used during scanning', () => {
    expect(isScanTargetCurrent(target, { id: 17, url: target.url })).toBe(true);
    expect(() => assertScanTarget(target, { id: 17, url: target.url })).not.toThrow();
  });

  it('rejects a different active tab instead of filling stale scan results', () => {
    expect(isScanTargetCurrent(target, { id: 18, url: 'http://127.0.0.1:4173/' })).toBe(false);
    expect(() => assertScanTarget(target, { id: 18, url: 'http://127.0.0.1:4173/' })).toThrow(/页面已切换/);
  });

  it('rejects navigation in the scanned tab', () => {
    expect(isScanTargetCurrent(target, { id: 17, url: 'https://careers.example.com/jobs/2' })).toBe(false);
    expect(() => assertScanTarget(target, { id: 17, url: 'https://careers.example.com/jobs/2' })).toThrow(/页面地址已变化/);
  });
});
