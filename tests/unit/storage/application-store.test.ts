import { describe, expect, it } from 'vitest';
import { ApplicationStore, createApplicationId } from '../../../src/storage/application-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
  async compareAndSet<T>(key: string, expectedRevision: number, value: T): Promise<boolean> {
    const current = this.values.get(key) as { revision?: number } | undefined;
    if ((current?.revision ?? 0) !== expectedRevision) return false;
    await this.set(key, value); return true;
  }
}

describe('ApplicationStore', () => {
  it('creates a manually confirmed application with an applied event', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    const record = await store.create({ company: '示例公司', role: '前端工程师', url: 'https://jobs.example/apply', sourceHost: 'jobs.example', appliedAt: '2026-09-15T10:00:00.000Z' });
    expect(record).toMatchObject({ company: '示例公司', role: '前端工程师', currentStage: 'applied', currentStageLabel: '已投递' });
    expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(record.events).toEqual([expect.objectContaining({ stage: 'applied', label: '已投递', occurredAt: '2026-09-15T10:00:00.000Z' })]);
  });

  it('appends preset and custom stages with timestamps', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    const record = await store.create({ company: '示例公司', role: '前端工程师', url: '', sourceHost: '', appliedAt: '2026-09-15T10:00:00.000Z' });
    await store.addEvent(record.id, { stage: 'interview_1', occurredAt: '2026-09-16T02:00:00.000Z', note: '视频面试' });
    const updated = await store.addEvent(record.id, { stage: 'custom', label: 'HR 面', occurredAt: '2026-09-17T03:00:00.000Z' });
    expect(updated.currentStageLabel).toBe('HR 面');
    expect(updated.events.map((event) => event.label)).toEqual(['已投递', '一面', 'HR 面']);
    expect(updated.events[1]?.note).toBe('视频面试');
  });

  it('keeps all timeline events and derives current stage from the latest timestamp', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    const record = await store.create({ company: '示例公司', role: '前端工程师', url: '', sourceHost: '', appliedAt: '2026-09-15T10:00:00.000Z' });
    await store.addEvent(record.id, { stage: 'interview_2', occurredAt: '2026-09-20T10:00:00.000Z' });
    const updated = await store.addEvent(record.id, { stage: 'written_test', occurredAt: '2026-09-17T10:00:00.000Z' });

    expect(updated.currentStage).toBe('interview_2');
    expect(updated.currentStageLabel).toBe('二面');
    expect(updated.events.map((event) => event.label)).toEqual(['已投递', '二面', '笔试']);
    expect(updated.events).toHaveLength(3);
  });

  it('serializes concurrent record creation and supports deletion', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    const [first] = await Promise.all([
      store.create({ company: 'A', role: '工程师', url: '', sourceHost: '' }),
      store.create({ company: 'B', role: '设计师', url: '', sourceHost: '' }),
    ]);
    expect(await store.list()).toHaveLength(2);
    await store.delete(first.id);
    expect((await store.list()).map((item) => item.company)).toEqual(['B']);
  });

  it('keeps records created concurrently by two store instances', async () => {
    const storage = new MemoryStorage(); const first = new ApplicationStore(storage); const second = new ApplicationStore(storage);
    await Promise.all([
      first.create({ company: 'A', role: '工程师', url: '', sourceHost: '' }),
      second.create({ company: 'B', role: '设计师', url: '', sourceHost: '' }),
    ]);
    expect((await first.list()).map((record) => record.company).sort()).toEqual(['A', 'B']);
  });

  it('migrates a legacy v1 envelope without revision on the next write', async () => {
    const storage = new MemoryStorage(); const store = new ApplicationStore(storage);
    const old = await store.create({ company: '旧公司', role: '工程师', url: '', sourceHost: '' });
    await storage.set('resume-autofill.applications.v1', { schemaVersion: 1, records: [old] });
    await store.create({ company: '新公司', role: '设计师', url: '', sourceHost: '' });
    expect(storage.values.get('resume-autofill.applications.v1')).toMatchObject({ schemaVersion: 1, revision: 1, records: expect.arrayContaining([old]) });
  });

  it('rejects a future schema and never overwrites it', async () => {
    const storage = new MemoryStorage(); const future = { schemaVersion: 2, revision: 9, records: [] };
    await storage.set('resume-autofill.applications.v1', future);
    const store = new ApplicationStore(storage);
    await expect(store.list()).rejects.toThrow(/较新版本.*升级扩展/);
    await expect(store.create({ company: 'A', role: '工程师', url: '', sourceHost: '' })).rejects.toThrow(/较新版本.*数据未被修改/);
    expect(storage.values.get('resume-autofill.applications.v1')).toEqual(future);
  });

  it('rejects records without company or role', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    await expect(store.create({ company: '', role: '工程师', url: '', sourceHost: '' })).rejects.toThrow(/公司和职位/);
  });
});


describe('application duplicate detection', () => {
  it('finds normalized URL duplicates and recent same-host identity duplicates', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    await store.create({ company: ' 示例   公司 ', role: '前端   工程师', url: 'https://jobs.example.com/apply?id=1', sourceHost: 'jobs.example.com', appliedAt: new Date().toISOString() });

    const byUrl = await store.findDuplicates({ company: '示例 公司', role: '前端 工程师', url: 'https://jobs.example.com/apply?id=2#form', sourceHost: 'www.jobs.example.com' });
    expect(byUrl).toHaveLength(1);

    const otherRole = await store.findDuplicates({ company: '示例公司', role: '后端工程师', url: 'https://jobs.example.com/apply?id=3', sourceHost: 'jobs.example.com' });
    expect(otherRole).toHaveLength(0);
  });

  it('does not remove meaningful internal whitespace during duplicate checks', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    await store.create({ company: 'AB 公司', role: '前端 工程师', url: 'https://jobs.example.com/a', sourceHost: 'jobs.example.com', appliedAt: new Date().toISOString() });
    expect(await store.findDuplicates({ company: 'AB公司', role: '前端工程师', url: 'https://jobs.example.com/b', sourceHost: 'jobs.example.com' })).toHaveLength(0);
  });

  it('uses an injectable UUID source for deterministic tests', () => {
    expect(createApplicationId(() => '00000000-0000-4000-8000-000000000001')).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('does not flag an old same-host record when the URL differs', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    await store.create({ company: '示例公司', role: '工程师', url: 'https://jobs.example.com/old', sourceHost: 'jobs.example.com', appliedAt: '2020-01-01T00:00:00.000Z' });
    expect(await store.findDuplicates({ company: '示例公司', role: '工程师', url: 'https://jobs.example.com/new', sourceHost: 'jobs.example.com' })).toHaveLength(0);
  });
});
