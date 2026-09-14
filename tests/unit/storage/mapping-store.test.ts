import { describe, expect, it } from 'vitest';
import type { UserFieldMapping } from '../../../src/shared/mapping';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}

const mapping = (id: string): UserFieldMapping => ({
  id,
  scope: { host: 'example.test', path: '/apply' },
  fingerprint: `fingerprint-${id}`,
  profileKey: `profile.${id}`,
  createdAt: '2026-09-14T00:00:00.000Z',
});

describe('MappingStore', () => {
  it('returns an empty list when nothing is stored', async () => {
    await expect(new MappingStore(new MemoryStorage()).list()).resolves.toEqual([]);
  });

  it('upserts a mapping by ID', async () => {
    const store = new MappingStore(new MemoryStorage());
    const first = mapping('first');
    const updated = { ...first, profileKey: 'profile.updated' };

    await store.upsert(first);
    await store.upsert(updated);

    await expect(store.list()).resolves.toEqual([updated]);
  });

  it('preserves unrelated mappings during an upsert', async () => {
    const store = new MappingStore(new MemoryStorage());
    const first = mapping('first');
    const second = mapping('second');

    await store.upsert(first);
    await store.upsert(second);

    await expect(store.list()).resolves.toEqual([first, second]);
  });

  it('falls back when the persisted mapping envelope is malformed', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.mappings.v1', { schemaVersion: 2, mappings: [mapping('first')] });

    await expect(new MappingStore(storage).list()).resolves.toEqual([]);
  });

  it('falls back when a persisted mapping item is malformed', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.mappings.v1', { schemaVersion: 1, mappings: [null] });

    await expect(new MappingStore(storage).list()).resolves.toEqual([]);
  });

  it('serializes concurrent upserts so neither mapping is lost', async () => {
    const values = new Map<string, unknown>();
    const storage: StoragePort = {
      get: async <T>(key: string) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return values.get(key) as T | undefined;
      },
      set: async <T>(key: string, value: T) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        values.set(key, value);
      },
    };
    const store = new MappingStore(storage);

    await Promise.all([store.upsert(mapping('first')), store.upsert(mapping('second'))]);

    await expect(store.list()).resolves.toEqual([mapping('first'), mapping('second')]);
  });

  it('translates storage failures into a write StorageError', async () => {
    const cause = new Error('backend failed');
    const storage: StoragePort = {
      get: async () => undefined,
      set: async () => {
        throw cause;
      },
    };

    await expect(new MappingStore(storage).upsert(mapping('private-value'))).rejects.toMatchObject({
      name: 'StorageError',
      code: 'write_failed',
      operation: 'write',
      key: 'resume-autofill.mappings.v1',
      cause,
    });
    await expect(new MappingStore(storage).upsert(mapping('private-value'))).rejects.not.toThrow('private-value');
  });
});
