import { normalizeMappingScope, type NormalizedUserFieldMapping, type UserFieldMapping } from '../shared/mapping';
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
  if (typeof mapping.id !== 'string' || !mapping.scope || typeof mapping.scope !== 'object'
    || typeof mapping.fingerprint !== 'string' || typeof mapping.profileKey !== 'string'
    || typeof mapping.createdAt !== 'string') return false;
  const scope = mapping.scope as Record<string, unknown>;
  if (scope.kind === 'global') return true;
  if (scope.kind === 'host') return typeof scope.host === 'string';
  if (scope.kind === 'path') return typeof scope.host === 'string' && typeof scope.path === 'string';
  return typeof scope.host === 'string' && (scope.path === undefined || typeof scope.path === 'string');
}

export class MappingStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<NormalizedUserFieldMapping[]> {
    let value: MappingEnvelope | undefined;
    try {
      value = await this.storage.get<MappingEnvelope>(MAPPINGS_KEY);
    } catch (cause) {
      throw new StorageError('read_failed', 'read', MAPPINGS_KEY, cause);
    }
    return isMappingEnvelope(value)
      ? value.mappings.map((mapping) => ({ ...mapping, scope: normalizeMappingScope(mapping.scope) }))
      : [];
  }

  async upsert(mapping: UserFieldMapping): Promise<void> {
    const normalized = { ...mapping, scope: normalizeMappingScope(mapping.scope) };
    return this.update((mappings) => {
      const index = mappings.findIndex((candidate) => candidate.id === normalized.id);
      if (index === -1) mappings.push(normalized);
      else mappings[index] = normalized;
      return mappings;
    });
  }

  async delete(id: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.id !== id));
  }

  async deleteByProfileKey(profileKey: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.profileKey !== profileKey));
  }

  private update(transform: (mappings: NormalizedUserFieldMapping[]) => NormalizedUserFieldMapping[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const mappings = transform(await this.list());
      try {
        await this.storage.set<MappingEnvelope>(MAPPINGS_KEY, { schemaVersion: MAPPINGS_SCHEMA_VERSION, mappings });
      } catch (cause) {
        throw new StorageError('write_failed', 'write', MAPPINGS_KEY, cause);
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
