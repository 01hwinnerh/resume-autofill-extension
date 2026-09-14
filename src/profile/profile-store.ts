import { PROFILE_SCHEMA_VERSION, type Profile } from '../shared/profile';
import { StorageError, type StoragePort } from '../storage/storage-port';

const PROFILE_KEY = 'resume-autofill.profile.v1';
const EMPTY_PROFILE: Profile = { schemaVersion: PROFILE_SCHEMA_VERSION, fields: {} };

function isProfile(value: unknown): value is Profile {
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

export class ProfileStore {
  constructor(private readonly storage: StoragePort) {}

  async load(): Promise<Profile> {
    let value: Profile | undefined;
    try {
      value = await this.storage.get<Profile>(PROFILE_KEY);
    } catch (cause) {
      throw new StorageError('read_failed', 'read', PROFILE_KEY, cause);
    }
    return isProfile(value) ? value : { ...EMPTY_PROFILE, fields: {} };
  }

  async save(profile: Profile): Promise<void> {
    try {
      await this.storage.set(PROFILE_KEY, profile);
    } catch (cause) {
      throw new StorageError('write_failed', 'write', PROFILE_KEY, cause);
    }
  }
}
