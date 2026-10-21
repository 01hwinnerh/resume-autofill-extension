import { beforeEach, describe, expect, it, vi } from 'vitest';

const values: Record<string, unknown> = {};
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      session: {
        get: vi.fn(async (key?: string | string[] | null) => {
          if (key == null) return { ...values };
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.filter((item) => item in values).map((item) => [item, values[item]]));
        }),
        set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, items); }),
        remove: vi.fn(async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }),
      },
    },
  },
}));

import {
  PENDING_APPLICATION_KEY,
  PENDING_APPLICATION_MAX,
  PENDING_APPLICATION_TTL_MS,
  clearPendingApplication,
  loadPendingApplication,
  matchPendingApplications,
  savePendingApplication,
} from '../../../src/storage/pending-application';

const draft = (id: string) => ({ company: `公司${id}`, role: `职位${id}`, url: `https://jobs.test/apply?id=${id}`, sourceHost: 'jobs.test' });

describe('pending application collection', () => {
  beforeEach(() => { for (const key of Object.keys(values)) delete values[key]; });

  it('keeps two job drafts independently and selects the current target', async () => {
    const now = Date.now();
    await Promise.all([
      savePendingApplication(draft('a'), now - 1_000),
      savePendingApplication(draft('b'), now),
    ]);
    expect(await loadPendingApplication({ url: draft('a').url }, now)).toMatchObject({ company: '公司a' });
    expect(await loadPendingApplication({ url: draft('b').url }, now)).toMatchObject({ company: '公司b' });
    await clearPendingApplication(draft('a'));
    expect(await loadPendingApplication({ url: draft('a').url }, now)).toBeUndefined();
    expect(await loadPendingApplication({ url: draft('b').url }, now)).toBeDefined();
  });

  it('expires drafts after 24 hours and enforces the collection limit', async () => {
    for (let index = 0; index < PENDING_APPLICATION_MAX + 3; index += 1) await savePendingApplication(draft(String(index)), index + 1);
    const envelope = values[PENDING_APPLICATION_KEY] as { drafts: unknown[] };
    expect(envelope.drafts).toHaveLength(PENDING_APPLICATION_MAX);
    expect(await loadPendingApplication(undefined, PENDING_APPLICATION_TTL_MS + 10_000)).toBeUndefined();
  });

  it('reads the legacy single-draft shape', async () => {
    values[PENDING_APPLICATION_KEY] = { ...draft('legacy'), updatedAt: new Date(5_000).toISOString() };
    expect(await loadPendingApplication({ url: draft('legacy').url }, 5_000)).toMatchObject({ company: '公司legacy' });
  });
});

describe('pending application safe matching', () => {
  beforeEach(() => { for (const key of Object.keys(values)) delete values[key]; });

  it('falls back to the only fresh draft on the same host', async () => {
    const now = Date.now();
    await savePendingApplication(draft('one'), now);
    const match = await matchPendingApplications('https://jobs.test/applications', now);
    expect(match).toMatchObject({ kind: 'single-host', selected: { role: '职位one' } });
  });

  it('returns multiple same-host drafts instead of silently picking the newest', async () => {
    const now = Date.now();
    await savePendingApplication(draft('older'), now - 1_000);
    await savePendingApplication(draft('newer'), now);
    const match = await matchPendingApplications('https://jobs.test/personal-center', now);
    expect(match.kind).toBe('multiple-host');
    expect(match.selected).toBeUndefined();
    expect(match.candidates.map((item) => item.role)).toEqual(['职位newer', '职位older']);
  });

  it('does not match another host and filters expired drafts', async () => {
    const now = Date.now();
    await savePendingApplication(draft('other'), now);
    expect((await matchPendingApplications('https://else.test/applications', now)).kind).toBe('none');
    expect((await matchPendingApplications('https://jobs.test/applications', now + PENDING_APPLICATION_TTL_MS + 1)).kind).toBe('none');
  });

  it('removes only the selected draft after confirmation', async () => {
    const now = Date.now();
    const selected = await savePendingApplication(draft('selected'), now);
    await savePendingApplication(draft('kept'), now - 1);
    await clearPendingApplication({ targetKey: selected.targetKey });
    expect(await loadPendingApplication({ url: draft('selected').url }, now)).toBeUndefined();
    expect(await loadPendingApplication({ url: draft('kept').url }, now)).toBeDefined();
  });
});
