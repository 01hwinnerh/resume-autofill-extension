import { createMappingId, inferMappingSectionIndex, normalizeMappingScope, type NormalizedUserFieldMapping, type UserFieldMapping } from '../shared/mapping';
import { StorageError, type StoragePort } from './storage-port';

const MAPPINGS_KEY = 'resume-autofill.mappings.v1';
const MAPPINGS_SCHEMA_VERSION = 1 as const;

export type ProfileKeyRemap = Record<string, string | null>;

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

export function isUserFieldMapping(value: unknown): value is UserFieldMapping {
  if (!value || typeof value !== 'object') return false;
  const mapping = value as Partial<UserFieldMapping>;
  if (typeof mapping.id !== 'string' || !mapping.scope || typeof mapping.scope !== 'object'
    || typeof mapping.fingerprint !== 'string' || typeof mapping.profileKey !== 'string'
    || typeof mapping.createdAt !== 'string'
    || (mapping.sectionIndex !== undefined && (!Number.isInteger(mapping.sectionIndex) || mapping.sectionIndex < 0))) return false;
  const scope = mapping.scope as Record<string, unknown>;
  if (scope.kind === 'global') return true;
  if (scope.kind === 'host') return typeof scope.host === 'string';
  if (scope.kind === 'path') return typeof scope.host === 'string' && typeof scope.path === 'string';
  return typeof scope.host === 'string' && (scope.path === undefined || typeof scope.path === 'string');
}

function normalizeMapping(mapping: UserFieldMapping): NormalizedUserFieldMapping {
  const scope = normalizeMappingScope(mapping.scope);
  const sectionIndex = mapping.sectionIndex ?? inferMappingSectionIndex(mapping.profileKey);
  return { ...mapping, id: createMappingId(mapping.fingerprint, scope, sectionIndex), scope, ...(sectionIndex === undefined ? {} : { sectionIndex }) };
}

function normalizeAndDedupe(mappings: UserFieldMapping[]): NormalizedUserFieldMapping[] {
  const deduped = new Map<string, NormalizedUserFieldMapping>();
  for (const item of mappings) {
    const mapping = normalizeMapping(item);
    const existing = deduped.get(mapping.id);
    if (!existing || mapping.createdAt >= existing.createdAt) deduped.set(mapping.id, mapping);
  }
  return [...deduped.values()];
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
    return isMappingEnvelope(value) ? normalizeAndDedupe(value.mappings) : [];
  }

  async upsert(mapping: UserFieldMapping): Promise<void> {
    return this.update((mappings) => [...mappings, normalizeMapping(mapping)]);
  }

  async replace(mappings: UserFieldMapping[]): Promise<void> {
    return this.update(() => mappings);
  }

  async updateMapping(id: string, mapping: UserFieldMapping): Promise<void> {
    return this.update((mappings) => {
      const remaining = mappings.filter((candidate) => candidate.id !== id);
      const index = mappings.findIndex((candidate) => candidate.id === id);
      remaining.splice(index < 0 ? remaining.length : Math.min(index, remaining.length), 0, normalizeMapping(mapping));
      return remaining;
    });
  }

  async remapProfileKeys(remaps: ProfileKeyRemap[]): Promise<void> {
    if (!remaps.length) return;
    return this.update((mappings) => mappings.flatMap((mapping) => {
      let profileKey: string | null = mapping.profileKey;
      for (const remap of remaps) {
        if (profileKey !== null && Object.prototype.hasOwnProperty.call(remap, profileKey)) profileKey = remap[profileKey];
      }
      return profileKey === null ? [] : [{ ...mapping, profileKey, sectionIndex: inferMappingSectionIndex(profileKey) }];
    }));
  }

  async deleteMany(ids: string[]): Promise<void> {
    const selected = new Set(ids);
    return this.update((mappings) => mappings.filter((mapping) => !selected.has(mapping.id)));
  }

  async delete(id: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.id !== id));
  }

  async deleteByProfileKey(profileKey: string): Promise<void> {
    return this.update((mappings) => mappings.filter((mapping) => mapping.profileKey !== profileKey));
  }

  private update(transform: (mappings: NormalizedUserFieldMapping[]) => UserFieldMapping[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const mappings = normalizeAndDedupe(transform(await this.list()));
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
