import { describe, expect, it } from 'vitest';
import { createPortableConfig, importPortableConfig, parsePortableConfig, stringifyPortableConfig, summarizePortableConfig, type PortableConfigV1 } from '../../../src/config/portable-config';
import { ProfileStore } from '../../../src/profile/profile-store';
import type { ApplicationRecord } from '../../../src/shared/application-record';
import { createMappingId, type UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { ApplicationStore } from '../../../src/storage/application-store';
import { executeStorageTransaction, type StorageTransactionRequest, type StorageTransactionResult } from '../../../src/storage/coordinated-transaction';
import { MappingCollisionError, MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
}
class FailNextMappingWriteStorage extends MemoryStorage {
  failNextMappingWrite = false;
  override async set<T>(key: string, value: T): Promise<void> { if (key === 'resume-autofill.mappings.v1' && this.failNextMappingWrite) { this.failNextMappingWrite = false; throw new Error('mapping write failed'); } await super.set(key, value); }
}
class ConcurrentWriteBeforeTransactionStorage extends MemoryStorage {
  async transaction(request: StorageTransactionRequest): Promise<StorageTransactionResult> {
    const current = this.values.get('resume-autofill.profile.v1') as { revision: number; profile: Profile };
    await this.set('resume-autofill.profile.v1', { ...current, revision: current.revision + 1, profile: { ...current.profile, fields: { ...current.profile.fields, concurrent: { key: 'concurrent', label: '并发', type: 'text', value: '保留', policy: 'auto' } } } });
    return executeStorageTransaction(this, request);
  }
}
const profile: Profile = { schemaVersion: 1, fields: {
  'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '迁移用户', policy: 'auto' },
  'educations.0.school': { key: 'educations.0.school', label: '学校名称', type: 'text', value: '示例大学', policy: 'auto' },
  'educations.1.school': { key: 'educations.1.school', label: '学校名称', type: 'text', value: '示例研究院', policy: 'auto' },
  'workExperiences.0.company': { key: 'workExperiences.0.company', label: '公司名称', type: 'text', value: '示例公司', policy: 'review' },
  'projects.0.name': { key: 'projects.0.name', label: '项目名称', type: 'text', value: '示例项目', policy: 'review' },
  'custom.noticePeriod': { key: 'custom.noticePeriod', label: '到岗周期', type: 'text', value: '两周', policy: 'review' },
} };
const mappings: UserFieldMapping[] = [{ id: createMappingId('text|到岗周期', { kind: 'path', host: 'jobs.example.com', path: '/apply' }), scope: { kind: 'path', host: 'jobs.example.com', path: '/apply' }, fingerprint: 'text|到岗周期', profileKey: 'custom.noticePeriod', createdAt: '2026-09-16T08:00:00.000Z' }];
const applications: ApplicationRecord[] = [{ id: 'record-1', company: '示例公司', role: '前端工程师', url: 'https://jobs.example.com/apply', sourceHost: 'jobs.example.com', appliedAt: '2026-09-16T08:00:00.000Z', updatedAt: '2026-09-17T08:00:00.000Z', currentStage: 'interview_1', currentStageLabel: '一面', events: [
  { id: 'event-1', stage: 'applied', label: '已投递', occurredAt: '2026-09-16T08:00:00.000Z' },
  { id: 'event-2', stage: 'interview_1', label: '一面', occurredAt: '2026-09-17T08:00:00.000Z', note: '视频' },
] }];

function stores(storage: MemoryStorage) { return [new ProfileStore(storage), new MappingStore(storage), new ApplicationStore(storage)] as const; }

describe('portable config', () => {
  it('round-trips V2 profile, mappings and complete application events', () => {
    const exported = createPortableConfig(profile, mappings, applications, '2026-09-16T08:21:00.000Z');
    const imported = parsePortableConfig(stringifyPortableConfig(exported));
    expect(imported).toEqual(exported); expect(imported.schemaVersion).toBe(2);
    if (imported.schemaVersion === 2) expect(imported.applications).toEqual(applications);
  });
  it('summarizes all three data categories', () => {
    expect(summarizePortableConfig(createPortableConfig(profile, mappings, applications))).toEqual({ profileFieldCount: 6, customFieldCount: 1, educationCount: 2, workCount: 1, projectCount: 1, mappingCount: 1, applicationCount: 1, applicationEventCount: 2, preservesApplications: false });
  });
  it.each([
    ['invalid JSON', '{'], ['unknown format', JSON.stringify({ format: 'other', schemaVersion: 2 })], ['future version', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 3 })],
    ['invalid profile', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 2, exportedAt: '2026-09-16T08:00:00.000Z', profile: {}, mappings: [], applications: [] })],
    ['invalid application', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 2, exportedAt: '2026-09-16T08:00:00.000Z', profile: { schemaVersion: 1, fields: {} }, mappings: [], applications: [{}] })],
  ])('rejects %s before touching storage', (_name, json) => { expect(() => parsePortableConfig(json)).toThrow(); });
  it('fully replaces applications for V2', async () => {
    const storage = new MemoryStorage(); const [profileStore, mappingStore, applicationStore] = stores(storage);
    await applicationStore.create({ company: '旧公司', role: '旧职位', url: '', sourceHost: '' });
    await importPortableConfig(createPortableConfig(profile, mappings, applications), profileStore, mappingStore, applicationStore);
    expect(await profileStore.load()).toEqual(profile); expect(await mappingStore.list()).toEqual(mappings); expect(await applicationStore.list()).toEqual(applications);
  });
  it('keeps current applications when importing V1', async () => {
    const storage = new MemoryStorage(); const [profileStore, mappingStore, applicationStore] = stores(storage);
    const old = await applicationStore.create({ company: '保留公司', role: '工程师', url: '', sourceHost: '' });
    const v1: PortableConfigV1 = { format: 'resume-autofill-config', schemaVersion: 1, exportedAt: '2026-09-16T08:00:00.000Z', profile, mappings };
    await importPortableConfig(parsePortableConfig(JSON.stringify(v1)), profileStore, mappingStore, applicationStore);
    expect((await applicationStore.list()).map((record) => record.id)).toEqual([old.id]);
  });
  it('rejects mapping identity collisions before starting the transaction', async () => {
    const storage = new MemoryStorage(); const [profileStore, mappingStore, applicationStore] = stores(storage);
    const conflict = { ...mappings[0]!, profileKey: 'custom.other', createdAt: '2026-09-17T08:00:00.000Z' };
    await expect(importPortableConfig(createPortableConfig(profile, [mappings[0]!, conflict], applications), profileStore, mappingStore, applicationStore)).rejects.toBeInstanceOf(MappingCollisionError);
    expect(storage.values.has('resume-autofill.transaction.v1')).toBe(false);
    expect(storage.values.has('resume-autofill.profile.v1')).toBe(false);
  });

  it('rejects an import when another page writes after snapshots are read', async () => {
    const storage = new ConcurrentWriteBeforeTransactionStorage(); const [profileStore, mappingStore, applicationStore] = stores(storage);
    await profileStore.save({ schemaVersion: 1, fields: {} });
    await expect(importPortableConfig(createPortableConfig(profile, mappings, applications), profileStore, mappingStore, applicationStore)).rejects.toThrow(/已被其他页面更新/);
    expect((await profileStore.load()).fields.concurrent?.value).toBe('保留');
    expect(await mappingStore.list()).toEqual([]);
    expect(await applicationStore.list()).toEqual([]);
  });

  it('rolls back profile, mappings and applications when one write fails', async () => {
    const storage = new FailNextMappingWriteStorage(); const [profileStore, mappingStore, applicationStore] = stores(storage);
    const previousProfile: Profile = { schemaVersion: 1, fields: { 'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '原用户', policy: 'auto' } } };
    await profileStore.save(previousProfile); const previousApplication = await applicationStore.create({ company: '原公司', role: '工程师', url: '', sourceHost: '' }); storage.failNextMappingWrite = true;
    await expect(importPortableConfig(createPortableConfig(profile, mappings, applications), profileStore, mappingStore, applicationStore)).rejects.toThrow(/已恢复导入前/);
    expect(await profileStore.load()).toEqual(previousProfile); expect(await mappingStore.list()).toEqual([]); expect((await applicationStore.list())[0]?.id).toBe(previousApplication.id);
  });
});
