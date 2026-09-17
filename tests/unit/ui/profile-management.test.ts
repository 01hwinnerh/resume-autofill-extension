import { describe, expect, it } from 'vitest';
import { ProfileStore } from '../../../src/profile/profile-store';
import { createMappingId } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';
import { addExperience, applyExperienceAction, createCustomField, deleteExperienceWithRemap, generateCustomFieldKey, moveExperienceWithRemap, parseFieldValue, profileCompletion, saveProfileWithMappingRemaps } from '../../../src/ui/profile-management';
import { EXPERIENCE_FIELD_TEMPLATES } from '../../../src/ui/profile-fields';

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '测试用户', policy: 'auto' },
    'contact.email': { key: 'contact.email', label: '邮箱', type: 'text', value: 'user@example.test', policy: 'auto' },
  },
};

const repeated: Profile = { schemaVersion: 1, fields: {
  'educations.0.school': { key: 'educations.0.school', label: '学校', type: 'text', value: 'A', policy: 'auto' },
  'educations.0.extension': { key: 'educations.0.extension', label: '扩展', type: 'text', value: 'A+', policy: 'auto' },
  'educations.1.school': { key: 'educations.1.school', label: '学校', type: 'text', value: 'B', policy: 'review' },
  'educations.2.school': { key: 'educations.2.school', label: '学校', type: 'text', value: 'C', policy: 'never' },
} };

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  failNextMappingWrite = false;
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> {
    if (key === 'resume-autofill.mappings.v1' && this.failNextMappingWrite) {
      this.failNextMappingWrite = false;
      throw new Error('mapping write failed');
    }
    this.values.set(key, structuredClone(value));
  }
}

describe('profile management logic', () => {
  it('calculates overall and grouped completion from canonical definitions', () => {
    const completion = profileCompletion(profile);
    expect(completion.filled).toBe(2);
    expect(completion.total).toBeGreaterThan(2);
    expect(completion.bySection.basic.filled).toBe(2);
  });

  it('materializes every blank field when adding an experience', () => {
    const added = addExperience(profile, 'education');
    expect(Object.keys(added.fields)).toHaveLength(Object.keys(profile.fields).length + EXPERIENCE_FIELD_TEMPLATES.education.length);
    expect(added.fields['educations.0.school']).toMatchObject({ key: 'educations.0.school', value: null, label: '学校' });
    expect(added.fields['educations.0.thesis']).toMatchObject({ value: null, policy: 'review' });
  });

  it('materializes a complete copy before overriding copied values', () => {
    const copied = addExperience(repeated, 'education', 0, 3);
    expect(EXPERIENCE_FIELD_TEMPLATES.education.every((definition) => copied.fields[`educations.3.${definition.key}`])).toBe(true);
    expect(copied.fields['educations.3.school'].value).toBe('A');
    expect(copied.fields['educations.3.major'].value).toBeNull();
    expect(copied.fields['educations.3.extension']).toMatchObject({ key: 'educations.3.extension', value: 'A+' });
  });

  it('deletes and moves records with complete definition and extension-field remaps', () => {
    const deleted = deleteExperienceWithRemap(repeated, 'education', 1);
    expect(deleted.profile.fields['educations.1.school']).toMatchObject({ value: 'C', policy: 'never', key: 'educations.1.school' });
    expect(deleted.remap['educations.1.major']).toBeNull();
    expect(deleted.remap['educations.2.major']).toBe('educations.1.major');
    expect(deleted.remap['educations.0.extension']).toBe('educations.0.extension');

    const moved = moveExperienceWithRemap(repeated, 'education', 2, -1);
    expect(moved.profile.fields['educations.1.school']).toMatchObject({ value: 'C', policy: 'never' });
    expect(moved.profile.fields['educations.2.school']).toMatchObject({ value: 'B', policy: 'review' });
    expect(moved.remap['educations.2.school']).toBe('educations.1.school');
    expect(moved.remap['educations.1.major']).toBe('educations.2.major');
  });

  it('clears standard fields instead of removing the last education record', () => {
    const single: Profile = { schemaVersion: 1, fields: {
      'educations.0.school': { key: 'educations.0.school', label: '学校', type: 'text', value: 'A', policy: 'auto' },
      'educations.0.degree': { key: 'educations.0.degree', label: '学历', type: 'enum', value: '本科', policy: 'review' },
      'educations.0.extension': { key: 'educations.0.extension', label: '扩展', type: 'text', value: '保留', policy: 'auto' },
    } };

    const deleted = deleteExperienceWithRemap(single, 'education', 0);
    expect(deleted.profile.fields['educations.0.school'].value).toBeNull();
    expect(deleted.profile.fields['educations.0.degree']).toMatchObject({ value: null, policy: 'review' });
    expect(deleted.profile.fields['educations.0.extension'].value).toBe('保留');
    expect(deleted.remap).toEqual({});
    expect(applyExperienceAction({ profile: single, counts: { education: 1, work: 0, project: 0 }, pendingRemaps: [] }, 'education', 'delete').counts.education).toBe(1);
  });

  it('applies rapid structural actions sequentially from the latest editor state', () => {
    const initial = { profile: repeated, counts: { education: 3, work: 1, project: 1 }, pendingRemaps: [] };
    const moved = applyExperienceAction(initial, 'education', 'up', 2);
    const deleted = applyExperienceAction(moved, 'education', 'delete', 0);

    expect(deleted.counts.education).toBe(2);
    expect(deleted.profile.fields['educations.0.school'].value).toBe('C');
    expect(deleted.profile.fields['educations.1.school'].value).toBe('B');
    expect(deleted.pendingRemaps).toHaveLength(2);
    expect(deleted.pendingRemaps[0]['educations.2.school']).toBe('educations.1.school');
    expect(deleted.pendingRemaps[1]['educations.1.school']).toBe('educations.0.school');

    const blank = { profile, counts: { education: 1, work: 1, project: 1 }, pendingRemaps: [] };
    const addedTwice = applyExperienceAction(applyExperienceAction(blank, 'education', 'add'), 'education', 'add');
    expect(addedTwice.counts.education).toBe(3);
    expect(addedTwice.profile.fields['educations.1.school']).toBeDefined();
    expect(addedTwice.profile.fields['educations.2.school']).toBeDefined();
  });

  it('applies the full remap sequence while saving the profile', async () => {
    const storage = new MemoryStorage(); const profileStore = new ProfileStore(storage); const mappingStore = new MappingStore(storage);
    const scope = { kind: 'global' } as const;
    await profileStore.save(repeated);
    await mappingStore.upsert({ id: createMappingId('school', scope, 2), scope, fingerprint: 'school', profileKey: 'educations.2.school', sectionIndex: 2, createdAt: '2026-09-17T00:00:00.000Z' });
    const next = deleteExperienceWithRemap(repeated, 'education', 0);
    const moved = moveExperienceWithRemap(next.profile, 'education', 1, -1);

    await saveProfileWithMappingRemaps(moved.profile, [next.remap, moved.remap], profileStore, mappingStore);

    expect(await profileStore.load()).toEqual(moved.profile);
    expect(await mappingStore.list()).toMatchObject([{ profileKey: 'educations.0.school' }]);
  });

  it('restores both stores when mapping remap persistence fails', async () => {
    const storage = new MemoryStorage(); const profileStore = new ProfileStore(storage); const mappingStore = new MappingStore(storage);
    const scope = { kind: 'global' } as const;
    const originalMapping = { id: createMappingId('school', scope, 2), scope, fingerprint: 'school', profileKey: 'educations.2.school', sectionIndex: 2, createdAt: '2026-09-17T00:00:00.000Z' };
    await profileStore.save(repeated); await mappingStore.upsert(originalMapping);
    const mutation = deleteExperienceWithRemap(repeated, 'education', 0);
    storage.failNextMappingWrite = true;

    await expect(saveProfileWithMappingRemaps(mutation.profile, [mutation.remap], profileStore, mappingStore)).rejects.toThrow('Storage write failed');
    expect(await profileStore.load()).toEqual(repeated);
    expect(await mappingStore.list()).toEqual([originalMapping]);
  });

  it('generates stable valid custom keys and typed values', () => {
    expect(generateCustomFieldKey(123456)).toBe('custom.field_2n9c');
    expect(parseFieldValue('multiselect', 'React, TypeScript')).toEqual(['React', 'TypeScript']);
    expect(createCustomField({ label: '签证状态', type: 'boolean', value: 'true', policy: 'review' }, 123456)).toEqual({
      key: 'custom.field_2n9c', label: '签证状态', type: 'boolean', value: true, policy: 'review',
    });
  });
});
