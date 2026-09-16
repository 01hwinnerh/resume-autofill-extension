import { describe, expect, it } from 'vitest';
import { createMappingId, type UserFieldMapping } from '../../../src/shared/mapping';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
}
const mapping = (id: string): UserFieldMapping => ({ id, scope: { kind: 'path', host: 'example.test', path: '/apply' }, fingerprint: `fingerprint-${id}`, profileKey: `profile.${id}`, createdAt: '2026-09-14T00:00:00.000Z' });

describe('MappingStore', () => {
  it('returns an empty list when nothing is stored', async () => { await expect(new MappingStore(new MemoryStorage()).list()).resolves.toEqual([]); });
  it('normalizes legacy host/path scopes when reading', async () => {
    const storage = new MemoryStorage(); await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [{ ...mapping('old'), scope: { host: 'example.test', path: '/apply' } }] });
    await expect(new MappingStore(storage).list()).resolves.toMatchObject([{ scope: { kind: 'path', host: 'example.test', path: '/apply' } }]);
  });
  it('upserts, deletes, and preserves unrelated mappings', async () => {
    const store = new MappingStore(new MemoryStorage()); const first = mapping('first'); const second = mapping('second');
    await store.upsert(first); await store.upsert(second); await store.upsert({ ...first, profileKey: 'profile.updated' });
    expect(await store.list()).toEqual([{ ...first, profileKey: 'profile.updated' }, second]);
    await store.delete('first'); expect(await store.list()).toEqual([second]); await store.deleteByProfileKey('profile.second'); expect(await store.list()).toEqual([]);
  });
  it('replaces all mappings for portable config import', async () => {
    const store = new MappingStore(new MemoryStorage()); await store.upsert(mapping('old'));
    await store.replace([mapping('new-1'), mapping('new-2')]);
    expect((await store.list()).map((item) => item.id)).toEqual(['new-1', 'new-2']);
  });
  it('rejects an update whose generated ID already belongs to another mapping', async () => {
    const store = new MappingStore(new MemoryStorage()); const first = mapping('first'); const second = mapping('second');
    await store.replace([first, second]);
    await expect(store.updateMapping(first.id, second)).rejects.toThrow('该字段映射已存在。');
    expect(await store.list()).toEqual([first, second]);
  });
  it('deletes several mappings in one serialized write', async () => {
    const store = new MappingStore(new MemoryStorage()); await store.replace([mapping('first'), mapping('second'), mapping('third')]);
    await store.deleteMany(['first', 'third']);
    expect(await store.list()).toEqual([mapping('second')]);
  });
  it('allows the same fingerprint/profile key in every scope with stable IDs', () => {
    const scopes = [{ kind: 'global' } as const, { kind: 'host', host: 'example.test' } as const, { kind: 'path', host: 'example.test', path: '/apply' } as const];
    const ids = scopes.map((scope) => createMappingId('same', 'custom.same', scope));
    expect(new Set(ids).size).toBe(3); expect(ids).toEqual(scopes.map((scope) => createMappingId('same', 'custom.same', scope)));
  });
  it('falls back when persisted data is malformed', async () => {
    const storage = new MemoryStorage(); await storage.set('resume-autofill.mappings.v1', { schemaVersion: 2, mappings: [mapping('first')] });
    await expect(new MappingStore(storage).list()).resolves.toEqual([]); await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [null] }); await expect(new MappingStore(storage).list()).resolves.toEqual([]);
  });
  it('serializes concurrent upserts', async () => {
    const storage = new MemoryStorage(); const store = new MappingStore(storage); await Promise.all([store.upsert(mapping('first')), store.upsert(mapping('second'))]); expect(await store.list()).toEqual([mapping('first'), mapping('second')]);
  });
  it('translates storage failures into a write StorageError', async () => {
    const cause = new Error('backend failed'); const storage: StoragePort = { get: async () => undefined, set: async () => { throw cause; } };
    await expect(new MappingStore(storage).upsert(mapping('private-value'))).rejects.toMatchObject({ name: 'StorageError', code: 'write_failed', operation: 'write', key: 'resume-autofill.mappings.v1', cause });
  });
});
