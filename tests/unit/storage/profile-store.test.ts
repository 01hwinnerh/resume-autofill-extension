import { describe, expect, it } from 'vitest';
import type { Profile } from '../../../src/shared/profile';
import { ProfileStore } from '../../../src/profile/profile-store';
import type { StoragePort } from '../../../src/storage/storage-port';
import { StorageError } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, unknown>();
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
    this.listeners.get(key)?.forEach((listener) => listener(value));
  }

  async compareAndSet<T>(key: string, expectedRevision: number, value: T): Promise<boolean> {
    const current = this.values.get(key) as { revision?: number } | undefined;
    if ((current?.revision ?? 0) !== expectedRevision) return false;
    await this.set(key, value);
    return true;
  }

  subscribe<T>(key: string, listener: (value: T | undefined) => void): () => void {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener as (value: unknown) => void); this.listeners.set(key, listeners);
    return () => listeners.delete(listener as (value: unknown) => void);
  }
}

describe('ProfileStore', () => {
  it('returns a schema-valid empty profile when nothing is stored', async () => {
    const store = new ProfileStore(new MemoryStorage());

    await expect(store.load()).resolves.toEqual({ schemaVersion: 1, fields: {} });
  });

  it('round-trips a profile through the storage port', async () => {
    const storage = new MemoryStorage();
    const store = new ProfileStore(storage);
    const profile: Profile = { schemaVersion: 1, fields: {} };

    await store.save(profile);

    await expect(store.load()).resolves.toEqual(profile);
  });

  it('serializes concurrent updates so rapid preview edits do not overwrite each other', async () => {
    const store = new ProfileStore(new MemoryStorage());
    await store.save({
      schemaVersion: 1,
      fields: {
        name: { key: 'name', label: '姓名', type: 'text', value: '原姓名', policy: 'auto' },
        city: { key: 'city', label: '城市', type: 'text', value: '原城市', policy: 'auto' },
      },
    });

    const updateName = store.update((profile) => ({ ...profile, fields: { ...profile.fields, name: { ...profile.fields.name, value: '新姓名' } } }));
    const updateCity = store.update((profile) => ({ ...profile, fields: { ...profile.fields, city: { ...profile.fields.city, value: '新城市' } } }));
    await Promise.all([updateName, updateCity]);

    expect((await store.load()).fields).toMatchObject({ name: { value: '新姓名' }, city: { value: '新城市' } });
  });

  it('preserves changes from two store instances that update different fields concurrently', async () => {
    const storage = new MemoryStorage();
    const first = new ProfileStore(storage); const second = new ProfileStore(storage);
    await first.save({ schemaVersion: 1, fields: {
      name: { key: 'name', label: '姓名', type: 'text', value: '原姓名', policy: 'auto' },
      city: { key: 'city', label: '城市', type: 'text', value: '原城市', policy: 'auto' },
    } });
    await Promise.all([
      first.update((profile) => ({ ...profile, fields: { ...profile.fields, name: { ...profile.fields.name, value: '新姓名' } } })),
      second.update((profile) => ({ ...profile, fields: { ...profile.fields, city: { ...profile.fields.city, value: '新城市' } } })),
    ]);
    expect((await first.load()).fields).toMatchObject({ name: { value: '新姓名' }, city: { value: '新城市' } });
  });

  it('merges concurrent snapshot saves from two loaded store instances by changed field', async () => {
    const storage = new MemoryStorage(); const seed = new ProfileStore(storage);
    await seed.save({ schemaVersion: 1, fields: {
      name: { key: 'name', label: '姓名', type: 'text', value: '原姓名', policy: 'auto' },
      city: { key: 'city', label: '城市', type: 'text', value: '原城市', policy: 'auto' },
    } });
    const first = new ProfileStore(storage); const second = new ProfileStore(storage);
    const [firstSnapshot, secondSnapshot] = await Promise.all([first.load(), second.load()]);
    firstSnapshot.fields.name = { ...firstSnapshot.fields.name, value: '新姓名' };
    secondSnapshot.fields.city = { ...secondSnapshot.fields.city, value: '新城市' };
    await Promise.all([first.save(firstSnapshot), second.save(secondSnapshot)]);
    expect((await seed.load()).fields).toMatchObject({ name: { value: '新姓名' }, city: { value: '新城市' } });
  });

  it('notifies subscribers when another store writes without changing the public profile schema', async () => {
    const storage = new MemoryStorage(); const first = new ProfileStore(storage); const second = new ProfileStore(storage);
    const changes: Profile[] = []; const unsubscribe = first.subscribe((profile) => changes.push(profile));
    await second.save({ schemaVersion: 1, fields: {} }); unsubscribe();
    expect(changes).toEqual([{ schemaVersion: 1, fields: {} }]);
  });

  it('rejects a future schema version and does not overwrite it', async () => {
    const storage = new MemoryStorage(); const future = { schemaVersion: 2, revision: 4, fields: {} };
    await storage.set('resume-autofill.profile.v1', future);
    const store = new ProfileStore(storage);
    await expect(store.load()).rejects.toThrow(/较新版本.*升级扩展/);
    await expect(store.save({ schemaVersion: 1, fields: {} })).rejects.toThrow(/较新版本.*数据未被修改/);
    expect(await storage.get('resume-autofill.profile.v1')).toEqual(future);
  });

  it('falls back when a persisted profile field is malformed', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.profile.v1', {
      schemaVersion: 1,
      fields: { email: { key: 'email', label: 'Email', type: 'text' } },
    });

    await expect(new ProfileStore(storage).load()).resolves.toEqual({ schemaVersion: 1, fields: {} });
  });

  it('translates storage read failures without exposing field values', async () => {
    const cause = new Error('backend failed');
    const storage: StoragePort = {
      get: async () => {
        throw cause;
      },
      set: async () => undefined,
    };
    const store = new ProfileStore(storage);

    await expect(store.load()).rejects.toMatchObject({
      name: 'StorageError',
      code: 'read_failed',
      operation: 'read',
      key: 'resume-autofill.profile.v1',
      cause,
    });
  });

  it('translates storage write failures into StorageError', async () => {
    const cause = new Error('backend failed');
    const storage: StoragePort = {
      get: async () => undefined,
      set: async () => {
        throw cause;
      },
    };
    const store = new ProfileStore(storage);

    await expect(store.save({ schemaVersion: 1, fields: {} })).rejects.toBeInstanceOf(StorageError);
    await expect(store.save({ schemaVersion: 1, fields: {} })).rejects.toMatchObject({
      code: 'write_failed',
      operation: 'write',
      key: 'resume-autofill.profile.v1',
      cause,
    });
  });
});
