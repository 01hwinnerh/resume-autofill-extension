import { describe, expect, it } from 'vitest';
import { createPortableConfig, importPortableConfig, parsePortableConfig, stringifyPortableConfig, summarizePortableConfig } from '../../../src/config/portable-config';
import { ProfileStore } from '../../../src/profile/profile-store';
import { createMappingId, type UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
}

class FailNextMappingWriteStorage extends MemoryStorage {
  failNextMappingWrite = false;

  override async set<T>(key: string, value: T): Promise<void> {
    if (key === 'resume-autofill.mappings.v1' && this.failNextMappingWrite) {
      this.failNextMappingWrite = false;
      throw new Error('mapping write failed');
    }
    await super.set(key, value);
  }
}

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '迁移用户', policy: 'auto' },
    'educations.0.school': { key: 'educations.0.school', label: '学校名称', type: 'text', value: '示例大学', policy: 'auto' },
    'educations.1.school': { key: 'educations.1.school', label: '学校名称', type: 'text', value: '示例研究院', policy: 'auto' },
    'workExperiences.0.company': { key: 'workExperiences.0.company', label: '公司名称', type: 'text', value: '示例公司', policy: 'review' },
    'projects.0.name': { key: 'projects.0.name', label: '项目名称', type: 'text', value: '示例项目', policy: 'review' },
    'custom.noticePeriod': { key: 'custom.noticePeriod', label: '到岗周期', type: 'text', value: '两周', policy: 'review' },
  },
};

const mappings: UserFieldMapping[] = [{
  id: createMappingId('text|到岗周期', { kind: 'path', host: 'jobs.example.com', path: '/apply' }),
  scope: { kind: 'path', host: 'jobs.example.com', path: '/apply' },
  fingerprint: 'text|到岗周期',
  profileKey: 'custom.noticePeriod',
  createdAt: '2026-09-16T08:00:00.000Z',
}];

describe('portable config', () => {
  it('round-trips an exported JSON config without losing profile fields, policies, or mappings', () => {
    const exported = createPortableConfig(profile, mappings, '2026-09-16T08:21:00.000Z');
    const imported = parsePortableConfig(stringifyPortableConfig(exported));

    expect(imported).toEqual(exported);
    expect(imported.profile).toEqual(profile);
    expect(imported.mappings).toEqual(mappings);
  });

  it('summarizes repeated experiences, custom fields, and mappings', () => {
    expect(summarizePortableConfig(createPortableConfig(profile, mappings))).toEqual({
      profileFieldCount: 6,
      customFieldCount: 1,
      educationCount: 2,
      workCount: 1,
      projectCount: 1,
      mappingCount: 1,
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['unknown format', JSON.stringify({ format: 'other', schemaVersion: 1 })],
    ['future version', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 2 })],
    ['invalid profile', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 1, exportedAt: '2026-09-16T08:00:00.000Z', profile: {}, mappings: [] })],
    ['invalid mapping', JSON.stringify({ format: 'resume-autofill-config', schemaVersion: 1, exportedAt: '2026-09-16T08:00:00.000Z', profile: { schemaVersion: 1, fields: {} }, mappings: [{}] })],
  ])('rejects %s before touching storage', (_name, json) => {
    expect(() => parsePortableConfig(json)).toThrow();
  });

  it('imports the same exported JSON into empty stores', async () => {
    const storage = new MemoryStorage();
    const profileStore = new ProfileStore(storage);
    const mappingStore = new MappingStore(storage);
    const exportedJson = stringifyPortableConfig(createPortableConfig(profile, mappings, '2026-09-16T08:21:00.000Z'));

    await importPortableConfig(parsePortableConfig(exportedJson), profileStore, mappingStore);

    expect(await profileStore.load()).toEqual(profile);
    expect(await mappingStore.list()).toEqual(mappings);
  });

  it('restores the previous profile and mappings when importing mappings fails', async () => {
    const storage = new FailNextMappingWriteStorage();
    const profileStore = new ProfileStore(storage);
    const mappingStore = new MappingStore(storage);
    const previousProfile: Profile = {
      schemaVersion: 1,
      fields: {
        'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '原用户', policy: 'auto' },
      },
    };
    const previousMappings: UserFieldMapping[] = [{
      id: createMappingId('text|原字段', { kind: 'global' }),
      scope: { kind: 'global' },
      fingerprint: 'text|原字段',
      profileKey: 'identity.name',
      createdAt: '2026-09-15T08:00:00.000Z',
    }];
    await profileStore.save(previousProfile);
    await mappingStore.replace(previousMappings);
    storage.failNextMappingWrite = true;

    await expect(importPortableConfig(createPortableConfig(profile, mappings), profileStore, mappingStore)).rejects.toThrow('Storage write failed');

    expect(await profileStore.load()).toEqual(previousProfile);
    expect(await mappingStore.list()).toEqual(previousMappings);
  });
});
