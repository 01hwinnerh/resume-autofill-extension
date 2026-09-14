import type { UserFieldMapping } from '../shared/mapping';
import { StorageError, type StoragePort } from './storage-port';

const MAPPINGS_KEY = 'resume-autofill.mappings.v1';
const MAPPINGS_SCHEMA_VERSION = 1 as const;

interface MappingEnvelope {
  schemaVersion: typeof MAPPINGS_SCHEMA_VERSION;
  mappings: UserFieldMapping[];
}

function isMappingEnvelope(value: unknown): value is MappingEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MappingEnvelope>;
  return candidate.schemaVersion === MAPPINGS_SCHEMA_VERSION && Array.isArray(candidate.mappings);
}

export class MappingStore {
  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<UserFieldMapping[]> {
    let value: MappingEnvelope | undefined;
    try {
      value = await this.storage.get<MappingEnvelope>(MAPPINGS_KEY);
    } catch (cause) {
      throw new StorageError('read_failed', 'read', MAPPINGS_KEY, cause);
    }
    return isMappingEnvelope(value) ? value.mappings : [];
  }

  async upsert(mapping: UserFieldMapping): Promise<void> {
    const mappings = await this.list();
    const index = mappings.findIndex((candidate) => candidate.id === mapping.id);
    if (index === -1) mappings.push(mapping);
    else mappings[index] = mapping;

    try {
      await this.storage.set<MappingEnvelope>(MAPPINGS_KEY, {
        schemaVersion: MAPPINGS_SCHEMA_VERSION,
        mappings,
      });
    } catch (cause) {
      throw new StorageError('write_failed', 'write', MAPPINGS_KEY, cause);
    }
  }
}
