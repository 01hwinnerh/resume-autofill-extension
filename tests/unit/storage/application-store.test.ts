import { describe, expect, it } from 'vitest';
import { ApplicationStore } from '../../../src/storage/application-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
}

describe('ApplicationStore', () => {
  it('creates a manually confirmed application with an applied event', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    const record = await store.create({ company: '示例公司', role: '前端工程师', url: 'https://jobs.example/apply', sourceHost: 'jobs.example', appliedAt: '2026-09-15T10:00:00.000Z' });
    expect(record).toMatchObject({ company: '示例公司', role: '前端工程师', currentStage: 'applied', currentStageLabel: '已投递' });
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

  it('rejects records without company or role', async () => {
    const store = new ApplicationStore(new MemoryStorage());
    await expect(store.create({ company: '', role: '工程师', url: '', sourceHost: '' })).rejects.toThrow(/公司和职位/);
  });
});
