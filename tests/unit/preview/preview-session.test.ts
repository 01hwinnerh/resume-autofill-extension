import { describe, expect, it } from 'vitest';

import {
  buildFillPreviewSession,
  buildProfilePreviewSession,
  loadPreviewSession,
  PREVIEW_SESSION_INDEX_KEY,
  PREVIEW_SESSION_MAX,
  PREVIEW_SESSION_TTL_MS,
  previewStorageKey,
  storePreviewSession,
  updateFillPreviewSessionValue,
} from '../../../src/preview/preview-session';
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

  it('updates the editable value used by both preview and confirmed fill', () => {
    const session = buildFillPreviewSession(scan, profile, [{ fieldId: 'name', profileKey: 'identity.name', value: '示例候选人' }]);
    const updated = updateFillPreviewSessionValue(session, 'name', '修改后的姓名');

    expect(updated.items[0].nextValue).toBe('修改后的姓名');
    expect(updated.fields[0].value).toBe('修改后的姓名');
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


describe('preview session retention', () => {
  function memoryStorage(initial: Record<string, unknown> = {}) {
    const values = { ...initial };
    const requested: Array<string | string[] | null | undefined> = [];
    return {
      values,
      requested,
      storage: {
        get: async (keys?: string | string[] | null) => {
          requested.push(keys);
          if (keys == null) return { ...values };
          return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]));
        },
        set: async (items: Record<string, unknown>) => { Object.assign(values, items); },
        remove: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
      },
    };
  }

  it('rejects expired previews using the dedicated index without reading all storage', async () => {
    const expired = { ...buildProfilePreviewSession(profile), id: 'expired', createdAt: new Date(0).toISOString() };
    const state = memoryStorage({
      unrelated: 'private',
      [previewStorageKey(expired.id)]: expired,
      [PREVIEW_SESSION_INDEX_KEY]: [{ id: expired.id, createdAt: expired.createdAt }],
    });
    await expect(loadPreviewSession(state.storage, expired.id, PREVIEW_SESSION_TTL_MS + 1)).resolves.toBeUndefined();
    expect(state.values).not.toHaveProperty(previewStorageKey(expired.id));
    expect(state.requested).not.toContain(null);
    expect(state.requested).not.toContain(undefined);
    expect(state.values.unrelated).toBe('private');
  });

  it('loads and indexes a legacy session that has no index entry', async () => {
    const legacy = { ...buildProfilePreviewSession(profile), id: 'legacy', createdAt: new Date(10_000).toISOString() };
    const state = memoryStorage({ [previewStorageKey(legacy.id)]: legacy });
    await expect(loadPreviewSession(state.storage, legacy.id, 20_000)).resolves.toEqual(legacy);
    expect(state.values[PREVIEW_SESSION_INDEX_KEY]).toEqual([{ id: legacy.id, createdAt: legacy.createdAt }]);
    expect(state.requested).not.toContain(null);
    expect(state.requested).not.toContain(undefined);
  });

  it('serializes concurrent stores and caps indexed preview sessions', async () => {
    const state = memoryStorage({ unrelated: 'private' });
    const sessions = Array.from({ length: PREVIEW_SESSION_MAX + 2 }, (_, index) => ({
      ...buildProfilePreviewSession(profile),
      id: `session-${index}`,
      createdAt: new Date(10_000 + index).toISOString(),
    }));
    await Promise.all(sessions.map((session) => storePreviewSession(state.storage, session, 20_000)));

    const index = state.values[PREVIEW_SESSION_INDEX_KEY] as Array<{ id: string }>;
    expect(index).toHaveLength(PREVIEW_SESSION_MAX);
    expect(index.map((entry) => entry.id)).toEqual(sessions.slice(-PREVIEW_SESSION_MAX).reverse().map((session) => session.id));
    expect(Object.keys(state.values).filter((key) => key.startsWith('resume-autofill.preview.'))).toHaveLength(PREVIEW_SESSION_MAX);
    expect(state.values.unrelated).toBe('private');
    expect(state.requested).not.toContain(null);
    expect(state.requested).not.toContain(undefined);
  });
});
