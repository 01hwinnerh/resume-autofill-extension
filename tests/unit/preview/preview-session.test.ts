import { describe, expect, it } from 'vitest';

import { buildFillPreviewSession, buildProfilePreviewSession, previewStorageKey } from '../../../src/preview/preview-session';
import type { Profile } from '../../../src/shared/profile';
import type { ScanResult } from '../../../src/shared/form';

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '示例候选人', policy: 'auto' },
    'contact.email': { key: 'contact.email', label: '邮箱', type: 'text', value: 'candidate@example.test', policy: 'auto' },
  },
};

const scan: ScanResult = {
  target: { tabId: 9, url: 'https://careers.example.com/apply', title: '申请前端工程师', scannedAt: '2026-09-15T10:00:00.000Z' },
  page: { url: 'https://careers.example.com/apply', host: 'careers.example.com', title: '申请前端工程师' },
  fields: [{
    descriptor: { fieldId: 'name', kind: 'text', label: '姓名', options: [], currentValue: '', framePath: [], fingerprint: 'text|姓名' },
    candidates: [{ profileKey: 'identity.name', score: 0.95, source: 'generic', reasons: ['label match'] }],
    selected: { profileKey: 'identity.name', score: 0.95, source: 'generic', reasons: ['label match'] },
    status: 'matched',
  }],
};

describe('preview sessions', () => {
  it('builds a full-screen fill preview with current and next values', () => {
    const session = buildFillPreviewSession(scan, profile, [{ fieldId: 'name', profileKey: 'identity.name', value: '示例候选人' }]);
    expect(session.kind).toBe('fill');
    expect(session.items).toEqual([expect.objectContaining({ label: '姓名', currentValue: '', nextValue: '示例候选人', source: '资料' })]);
    expect(previewStorageKey(session.id)).toContain(session.id);
  });

  it('builds readable profile sections', () => {
    const session = buildProfilePreviewSession(profile);
    expect(session.kind).toBe('profile');
    expect(session.sections.flatMap((section) => section.items).map((item) => item.label)).toContain('姓名');
  });

  it('keeps an explicit empty state when no fields are selected', () => {
    const session = buildFillPreviewSession(scan, profile, []);
    expect(session.items).toEqual([]);
  });
});
