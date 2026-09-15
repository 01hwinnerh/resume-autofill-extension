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
  return candidate.schemaVersion === MAPPINGS_SCHEMA_VERSION
    && Array.isArray(candidate.mappings)
    && candidate.mappings.every(isUserFieldMapping);
}

function isUserFieldMapping(value: unknown): value is UserFieldMapping {
  if (!value || typeof value !== 'object') return false;
  const mapping = value as Partial<UserFieldMapping>;
  return typeof mapping.id === 'string'
    && !!mapping.scope
    && typeof mapping.scope === 'object'
    && typeof mapping.scope.host === 'string'
    && (mapping.scope.path === undefined || typeof mapping.scope.path === 'string')
    && typeof mapping.fingerprint === 'string'
    && typeof mapping.profileKey === 'string'
    && typeof mapping.createdAt === 'string';
}

export class MappingStore {
  private writeQueue: Promise<void> = Promise.resolve();

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
    return this.update((mappings) => {
      const index = mappings.findIndex((candidate) => candidate.id === mapping.id);
      if (index === -1) mappings.push(mapping);
      else mappings[index] = mapping;
      return mappings;
    });
  }

  async delete(id: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.id !== id));
  }

  async deleteByProfileKey(profileKey: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.profileKey !== profileKey));
  }

  private update(transform: (mappings: UserFieldMapping[]) => UserFieldMapping[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const mappings = transform(await this.list());
      try {
        await this.storage.set<MappingEnvelope>(MAPPINGS_KEY, {
          schemaVersion: MAPPINGS_SCHEMA_VERSION,
          mappings,
        });
      } catch (cause) {
        throw new StorageError('write_failed', 'write', MAPPINGS_KEY, cause);
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
