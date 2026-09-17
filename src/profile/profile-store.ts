import { PROFILE_SCHEMA_VERSION, type Profile, type ProfileField } from '../shared/profile';
import { StorageError, UnsupportedSchemaVersionError, type StoragePort } from '../storage/storage-port';

export const PROFILE_KEY = 'resume-autofill.profile.v1';
const EMPTY_PROFILE: Profile = { schemaVersion: PROFILE_SCHEMA_VERSION, fields: {} };
const MAX_WRITE_ATTEMPTS = 8;

interface ProfileEnvelope {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  revision: number;
  profile: Profile;
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Profile>;
  return candidate.schemaVersion === PROFILE_SCHEMA_VERSION
    && !!candidate.fields
    && typeof candidate.fields === 'object'
    && !Array.isArray(candidate.fields)
    && Object.entries(candidate.fields).every(([key, field]) => isProfileField(key, field));
}

function isProfileField(key: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const field = value as Record<string, unknown>;
  return field.key === key
    && typeof field.label === 'string'
    && ['text', 'date', 'number', 'enum', 'boolean', 'multiselect'].includes(field.type as string)
    && isFieldValue(field.value)
    && ['auto', 'review', 'never'].includes(field.policy as string);
}

function isFieldValue(value: unknown): boolean {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function decode(value: unknown): { profile: Profile; revision: number } {
  if (value && typeof value === 'object') {
    const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
    if (typeof schemaVersion === 'number' && schemaVersion > PROFILE_SCHEMA_VERSION) throw new UnsupportedSchemaVersionError(PROFILE_KEY, schemaVersion);
  }
  if (isProfile(value)) return { profile: value, revision: 0 };
  if (value && typeof value === 'object') {
    const envelope = value as Partial<ProfileEnvelope>;
    if (envelope.schemaVersion === PROFILE_SCHEMA_VERSION
      && typeof envelope.revision === 'number'
      && Number.isSafeInteger(envelope.revision)
      && envelope.revision >= 0
      && isProfile(envelope.profile)) return { profile: envelope.profile, revision: envelope.revision };
  }
  return { profile: { ...EMPTY_PROFILE, fields: {} }, revision: 0 };
}

function sameField(a: ProfileField | undefined, b: ProfileField | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeProfileChanges(base: Profile, desired: Profile, latest: Profile): Profile {
  const fields = { ...latest.fields };
  for (const key of new Set([...Object.keys(base.fields), ...Object.keys(desired.fields)])) {
    if (sameField(base.fields[key], desired.fields[key])) continue;
    if (desired.fields[key]) fields[key] = desired.fields[key];
    else delete fields[key];
  }
  return { schemaVersion: PROFILE_SCHEMA_VERSION, fields };
}

export class ProfileStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private cachedProfile?: Profile;

  constructor(private readonly storage: StoragePort) {}

  async load(): Promise<Profile> {
    const { profile } = await this.read();
    this.cachedProfile = structuredClone(profile);
    return structuredClone(profile);
  }

  async save(profile: Profile): Promise<void> {
    const base = this.cachedProfile ? structuredClone(this.cachedProfile) : undefined;
    const operation = this.writeQueue.then(async () => {
      const saved = await this.optimisticUpdate((latest) => base ? mergeProfileChanges(base, profile, latest) : profile);
      this.cachedProfile = structuredClone(saved);
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async update(mutator: (profile: Profile) => Profile): Promise<Profile> {
    let updated!: Profile;
    const operation = this.writeQueue.then(async () => {
      updated = await this.optimisticUpdate(mutator);
      this.cachedProfile = structuredClone(updated);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return updated;
  }

  subscribe(listener: (profile: Profile) => void): () => void {
    if (!this.storage.subscribe) return () => undefined;
    return this.storage.subscribe<unknown>(PROFILE_KEY, (value) => listener(decode(value).profile));
  }

  private async read(): Promise<{ profile: Profile; revision: number }> {
    try {
      return decode(await this.storage.get<unknown>(PROFILE_KEY));
    } catch (cause) {
      if (cause instanceof UnsupportedSchemaVersionError) throw cause;
      throw new StorageError('read_failed', 'read', PROFILE_KEY, cause);
    }
  }

  private async optimisticUpdate(mutator: (profile: Profile) => Profile): Promise<Profile> {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const current = await this.read();
      const profile = mutator(structuredClone(current.profile));
      const envelope: ProfileEnvelope = { schemaVersion: PROFILE_SCHEMA_VERSION, revision: current.revision + 1, profile };
      try {
        if (this.storage.compareAndSet) {
          if (await this.storage.compareAndSet(PROFILE_KEY, current.revision, envelope)) return profile;
          continue;
        }
        await this.storage.set(PROFILE_KEY, envelope);
        return profile;
      } catch (cause) {
        throw new StorageError('write_failed', 'write', PROFILE_KEY, cause);
      }
    }
    throw new StorageError('conflict', 'write', PROFILE_KEY, new Error('optimistic write retries exhausted'));
  }
}
