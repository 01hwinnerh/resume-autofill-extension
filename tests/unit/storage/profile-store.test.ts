import { describe, expect, it } from 'vitest';
import type { Profile } from '../../../src/shared/profile';
import { ProfileStore } from '../../../src/profile/profile-store';
import type { StoragePort } from '../../../src/storage/storage-port';
import { StorageError } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
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

  it('falls back when the persisted profile has an invalid schema version', async () => {
    const storage = new MemoryStorage();
    await storage.set('resume-autofill.profile.v1', { schemaVersion: 2, fields: {} });
    const store = new ProfileStore(storage);

    await expect(store.load()).resolves.toEqual({ schemaVersion: 1, fields: {} });
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
