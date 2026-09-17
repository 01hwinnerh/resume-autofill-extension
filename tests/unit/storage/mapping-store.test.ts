import { describe, expect, it } from 'vitest';
import { createMappingId, type MappingScope, type UserFieldMapping } from '../../../src/shared/mapping';
import { MappingStore } from '../../../src/storage/mapping-store';
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
  it('deletes several mappings in one serialized write', async () => {
    const store = new MappingStore(new MemoryStorage()); const first = mapping('first'); const second = mapping('second'); const third = mapping('third');
    await store.replace([first, second, third]); await store.deleteMany([first.id, third.id]);
    expect(await store.list()).toEqual([second]);
  });
  it('falls back when persisted v1 data is malformed', async () => {
    const storage = new MemoryStorage(); await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [null] });
    await expect(new MappingStore(storage).list()).resolves.toEqual([]);
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
