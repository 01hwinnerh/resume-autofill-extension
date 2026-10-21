import { describe, expect, it } from 'vitest';
import { createMappingId, type MappingScope, type UserFieldMapping } from '../../../src/shared/mapping';
import { MappingCollisionError, MappingStore, remapMappings } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  setCount = 0;
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.setCount += 1; this.values.set(key, value); }
  async compareAndSet<T>(key: string, expectedRevision: number, value: T): Promise<boolean> {
    const current = this.values.get(key) as { revision?: number } | undefined;
    if ((current?.revision ?? 0) !== expectedRevision) return false;
    await this.set(key, value); return true;
  }
}
const scope: MappingScope = { kind: 'path', host: 'example.test', path: '/apply' };
const mapping = (fingerprint: string, profileKey = `profile.${fingerprint}`, sectionIndex?: number, createdAt = '2026-09-14T00:00:00.000Z'): UserFieldMapping => ({
  id: createMappingId(fingerprint, scope, sectionIndex), scope, fingerprint, profileKey, sectionIndex, createdAt,
});

describe('MappingStore', () => {
  it('returns an empty list when nothing is stored', async () => { await expect(new MappingStore(new MemoryStorage()).list()).resolves.toEqual([]); });
  it('normalizes legacy scopes and IDs when reading', async () => {
    const storage = new MemoryStorage(); await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [{ ...mapping('old'), id: 'legacy-id', scope: { host: 'example.test', path: '/apply' } }] });
    await expect(new MappingStore(storage).list()).resolves.toMatchObject([{ id: createMappingId('old', scope), scope }]);
  });
  it('overwrites the old profile key for the same fingerprint, scope, and section', async () => {
    const store = new MappingStore(new MemoryStorage());
    await store.upsert(mapping('same', 'educations.0.school', 0));
    await store.upsert(mapping('same', 'educations.0.major', 0, '2026-09-15T00:00:00.000Z'));
    expect(await store.list()).toEqual([mapping('same', 'educations.0.major', 0, '2026-09-15T00:00:00.000Z')]);
  });
  it('normalizes legacy IDs and deduplicates by newest createdAt, then later position', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [
      { ...mapping('same', 'old', 1), id: 'old-a' },
      { ...mapping('same', 'newer', 1, '2026-09-16T00:00:00.000Z'), id: 'old-b' },
      { ...mapping('same', 'last', 1, '2026-09-16T00:00:00.000Z'), id: 'old-c' },
    ] });
    expect(await new MappingStore(storage).list()).toEqual([mapping('same', 'last', 1, '2026-09-16T00:00:00.000Z')]);
  });
  it('replaces all mappings with normalized, deduplicated records', async () => {
    const store = new MappingStore(new MemoryStorage());
    await store.replace([{ ...mapping('same', 'first'), id: 'legacy-1' }, { ...mapping('same', 'second'), id: 'legacy-2' }]);
    expect(await store.list()).toEqual([mapping('same', 'second')]);
  });
  it('keeps repeated section indexes as separate identities', () => {
    expect(createMappingId('same', scope, 0)).not.toBe(createMappingId('same', scope, 1));
    expect(createMappingId('same', scope, 0)).toBe(createMappingId('same', scope, 0));
  });
  it('applies a structural remap sequence in one write', async () => {
    const storage = new MemoryStorage(); const store = new MappingStore(storage);
    await store.replace([mapping('school', 'educations.2.school'), mapping('major', 'educations.1.major')]);
    const writesBefore = storage.setCount;
    await store.remapProfileKeys([
      { 'educations.2.school': 'educations.1.school', 'educations.1.major': null },
      { 'educations.1.school': 'educations.0.school' },
    ]);
    expect(storage.setCount - writesBefore).toBe(1);
    expect(await store.list()).toEqual([mapping('school', 'educations.0.school', 0)]);
  });
  it('regenerates IDs after section remaps and rejects semantic collisions', () => {
    const first = mapping('same', 'educations.1.school', 1);
    const second = mapping('same', 'educations.2.major', 2);
    expect(() => remapMappings([first, second], [{ 'educations.1.school': 'educations.0.school', 'educations.2.major': 'educations.0.major' }])).toThrow(MappingCollisionError);
    const remapped = remapMappings([first], [{ 'educations.1.school': 'educations.0.school' }]);
    expect(remapped[0]).toMatchObject({ id: createMappingId('same', scope, 0), profileKey: 'educations.0.school', sectionIndex: 0 });
  });

  it('deduplicates only mappings that become semantically identical after remap', () => {
    const result = remapMappings([
      mapping('same', 'educations.1.school', 1),
      mapping('same', 'educations.2.school', 2, '2026-09-15T00:00:00.000Z'),
    ], [{ 'educations.1.school': 'educations.0.school', 'educations.2.school': 'educations.0.school' }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: createMappingId('same', scope, 0), profileKey: 'educations.0.school' });
  });

  it('deletes several mappings in one serialized write', async () => {
    const store = new MappingStore(new MemoryStorage()); const first = mapping('first'); const second = mapping('second'); const third = mapping('third');
    await store.replace([first, second, third]); await store.deleteMany([first.id, third.id]);
    expect(await store.list()).toEqual([second]);
  });
  it('rejects malformed persisted v1 data and never overwrites it', async () => {
    const storage = new MemoryStorage(); const corrupt = { schemaVersion: 1, mappings: [null] };
    await storage.set('resume-autofill.mappings.v1', corrupt); const store = new MappingStore(storage);
    await expect(store.list()).rejects.toMatchObject({ name: 'CorruptStorageDataError', code: 'corrupt_data' });
    await expect(store.upsert(mapping('new'))).rejects.toMatchObject({ code: 'corrupt_data' });
    expect(storage.values.get('resume-autofill.mappings.v1')).toEqual(corrupt);
  });
  it('rejects a future schema version and does not overwrite it', async () => {
    const storage = new MemoryStorage(); const future = { schemaVersion: 2, revision: 3, mappings: [mapping('first')] };
    await storage.set('resume-autofill.mappings.v1', future); const store = new MappingStore(storage);
    await expect(store.list()).rejects.toThrow(/较新版本.*升级扩展/);
    await expect(store.upsert(mapping('second'))).rejects.toThrow(/较新版本.*数据未被修改/);
    expect(storage.values.get('resume-autofill.mappings.v1')).toEqual(future);
  });
  it('serializes concurrent upserts', async () => {
    const store = new MappingStore(new MemoryStorage()); await Promise.all([store.upsert(mapping('first')), store.upsert(mapping('second'))]); expect(await store.list()).toEqual([mapping('first'), mapping('second')]);
  });
  it('retries concurrent writes from two store instances without losing mappings', async () => {
    const storage = new MemoryStorage(); const first = new MappingStore(storage); const second = new MappingStore(storage);
    await Promise.all([first.upsert(mapping('first')), second.upsert(mapping('second'))]);
    expect(await first.list()).toEqual([mapping('first'), mapping('second')]);
  });
  it('migrates a v1 envelope without a revision on its next write', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [mapping('legacy')] });
    await new MappingStore(storage).upsert(mapping('new'));
    expect(storage.values.get('resume-autofill.mappings.v1')).toMatchObject({ schemaVersion: 1, revision: 1, mappings: [mapping('legacy'), mapping('new')] });
  });
  it('translates storage failures into a write StorageError', async () => {
    const cause = new Error('backend failed'); const storage: StoragePort = { get: async () => undefined, set: async () => { throw cause; } };
    await expect(new MappingStore(storage).upsert(mapping('private-value'))).rejects.toMatchObject({ name: 'StorageError', code: 'write_failed', operation: 'write', key: 'resume-autofill.mappings.v1', cause });
  });
});


describe('frame-scoped mappings', () => {
  it('isolates same-fingerprint fields in two semantic frames and keeps legacy fallback', async () => {
    const { matchFields } = await import('../../../src/matching/generic-matcher');
    const profile = {
      schemaVersion: 1 as const,
      fields: {
        'custom.left': { key: 'custom.left', label: '左侧', type: 'text' as const, value: 'L', policy: 'auto' as const },
        'custom.right': { key: 'custom.right', label: '右侧', type: 'text' as const, value: 'R', policy: 'auto' as const },
        'custom.legacy': { key: 'custom.legacy', label: '旧映射', type: 'text' as const, value: 'O', policy: 'auto' as const },
      },
    };
    const base = { id: '', scope, fingerprint: 'same-field', sectionIndex: undefined, createdAt: '2026-09-23T00:00:00.000Z' };
    const mappings: UserFieldMapping[] = [
      { ...base, id: createMappingId('same-field', scope, undefined, 'frame:left'), profileKey: 'custom.left', frameIdentity: 'frame:left' },
      { ...base, id: createMappingId('same-field', scope, undefined, 'frame:right'), profileKey: 'custom.right', frameIdentity: 'frame:right' },
    ];
    const fields = ['left', 'right'].map((side) => ({ fieldId: side, kind: 'text' as const, label: '同名字段', options: [], currentValue: '', framePath: [], frameIdentity: `frame:${side}`, frameUrl: `https://example.test/${side}`, fingerprint: 'same-field' }));
    expect(matchFields(fields, profile, { mappings, pageContext: { host: 'example.test', path: '/apply' } }).map((item) => item.selected?.profileKey)).toEqual(['custom.left', 'custom.right']);

    const legacy: UserFieldMapping = { ...base, id: 'legacy', profileKey: 'custom.legacy' };
    expect(matchFields([fields[0]], profile, { mappings: [legacy], pageContext: { host: 'example.test', path: '/apply' } })[0].selected?.profileKey).toBe('custom.legacy');

    const legacyTitleIdentity: UserFieldMapping = {
      ...base,
      id: 'legacy-title',
      profileKey: 'custom.left',
      frameIdentity: 'https://example.test/left|name:left-frame|title:First step',
    };
    const stableDescriptor = {
      ...fields[0],
      frameIdentity: 'https://example.test/left|ancestors:https://example.test|name:left-frame',
    };
    expect(matchFields([stableDescriptor], profile, { mappings: [legacyTitleIdentity], pageContext: { host: 'example.test', path: '/apply' } })[0].selected?.profileKey).toBe('custom.left');
    expect(matchFields([{ ...stableDescriptor, frameIdentity: 'https://example.test/left|ancestors:https://example.test|name:right-frame' }], profile, { mappings: [legacyTitleIdentity], pageContext: { host: 'example.test', path: '/apply' } })[0].selected?.profileKey).not.toBe('custom.left');
  });
});
