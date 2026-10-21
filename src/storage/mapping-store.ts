import { createMappingId, inferMappingSectionIndex, normalizeMappingScope, type NormalizedUserFieldMapping, type UserFieldMapping } from '../shared/mapping';
import { CorruptStorageDataError, futureSchema, inspectionFromError, type StorageInspection } from './storage-codec';
import { StorageError, type StoragePort } from './storage-port';

export const MAPPINGS_KEY = 'resume-autofill.mappings.v1';
const MAPPINGS_SCHEMA_VERSION = 1 as const;
const MAX_WRITE_ATTEMPTS = 8;

export type ProfileKeyRemap = Record<string, string | null>;

interface MappingEnvelope {
  schemaVersion: typeof MAPPINGS_SCHEMA_VERSION;
  revision?: number;
  mappings: UserFieldMapping[];
}

function isMappingEnvelope(value: unknown): value is MappingEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MappingEnvelope>;
  return candidate.schemaVersion === MAPPINGS_SCHEMA_VERSION
    && (candidate.revision === undefined || (Number.isSafeInteger(candidate.revision) && candidate.revision! >= 0))
    && Array.isArray(candidate.mappings)
    && candidate.mappings.every(isUserFieldMapping);
}

export function isUserFieldMapping(value: unknown): value is UserFieldMapping {
  if (!value || typeof value !== 'object') return false;
  const mapping = value as Partial<UserFieldMapping>;
  if (typeof mapping.id !== 'string' || !mapping.scope || typeof mapping.scope !== 'object'
    || typeof mapping.fingerprint !== 'string' || typeof mapping.profileKey !== 'string'
    || typeof mapping.createdAt !== 'string'
    || (mapping.frameIdentity !== undefined && typeof mapping.frameIdentity !== 'string')
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
  return { ...mapping, id: createMappingId(mapping.fingerprint, scope, sectionIndex, mapping.frameIdentity), scope, ...(sectionIndex === undefined ? {} : { sectionIndex }) };
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

export class MappingCollisionError extends Error {
  readonly mappingId: string;
  constructor(mappingId: string, leftKey: string, rightKey: string) {
    super(`字段映射碰撞：${mappingId} 同时指向 ${leftKey} 和 ${rightKey}，事务未写入。请先删除或调整其中一条映射。`);
    this.name = 'MappingCollisionError'; this.mappingId = mappingId;
  }
}

function sameMappingSemantics(left: NormalizedUserFieldMapping, right: NormalizedUserFieldMapping): boolean {
  return left.fingerprint === right.fingerprint && left.profileKey === right.profileKey
    && left.sectionIndex === right.sectionIndex && left.frameIdentity === right.frameIdentity
    && JSON.stringify(left.scope) === JSON.stringify(right.scope);
}

function normalizeStrict(mappings: UserFieldMapping[]): NormalizedUserFieldMapping[] {
  const normalized = new Map<string, NormalizedUserFieldMapping>();
  for (const item of mappings) {
    const mapping = normalizeMapping(item); const existing = normalized.get(mapping.id);
    if (!existing) { normalized.set(mapping.id, mapping); continue; }
    if (!sameMappingSemantics(existing, mapping)) throw new MappingCollisionError(mapping.id, existing.profileKey, mapping.profileKey);
  }
  return [...normalized.values()];
}

export function remapMappings(mappings: UserFieldMapping[], remaps: ProfileKeyRemap[]): NormalizedUserFieldMapping[] {
  const remapped = normalizeAndDedupe(mappings).flatMap((mapping) => {
    let profileKey: string | null = mapping.profileKey;
    for (const remap of remaps) {
      if (profileKey !== null && Object.prototype.hasOwnProperty.call(remap, profileKey)) profileKey = remap[profileKey];
    }
    if (profileKey === null) return [];
    const sectionIndex = inferMappingSectionIndex(profileKey);
    return [{ ...mapping, id: createMappingId(mapping.fingerprint, mapping.scope, sectionIndex, mapping.frameIdentity), profileKey, sectionIndex }];
  });
  return normalizeStrict(remapped);
}

export interface MappingSnapshot { mappings: NormalizedUserFieldMapping[]; revision: number }
export function mappingEnvelope(mappings: UserFieldMapping[], revision: number): MappingEnvelope {
  return { schemaVersion: MAPPINGS_SCHEMA_VERSION, revision, mappings: normalizeStrict(mappings) };
}

function decode(value: unknown): MappingSnapshot {
  if (value === undefined) return { mappings: [], revision: 0 };
  futureSchema(MAPPINGS_KEY, value, MAPPINGS_SCHEMA_VERSION);
  if (!isMappingEnvelope(value)) throw new CorruptStorageDataError(MAPPINGS_KEY, value, '字段映射存储格式无法识别或已损坏');
  return { mappings: normalizeAndDedupe(value.mappings), revision: value.revision ?? 0 };
}

export class MappingStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<NormalizedUserFieldMapping[]> {
    return (await this.read()).mappings;
  }

  async snapshot(): Promise<MappingSnapshot> {
    const current = await this.read();
    return { mappings: structuredClone(current.mappings), revision: current.revision };
  }

  async inspect(): Promise<StorageInspection> {
    const raw = await this.storage.get<unknown>(MAPPINGS_KEY);
    if (raw === undefined) return { key: MAPPINGS_KEY, state: 'missing' };
    try {
      const decoded = decode(raw);
      const legacy = !!raw && typeof raw === 'object' && (raw as { revision?: unknown }).revision === undefined;
      return { key: MAPPINGS_KEY, state: legacy ? 'legacy' : 'current', raw: structuredClone(raw), schemaVersion: MAPPINGS_SCHEMA_VERSION, message: `revision ${decoded.revision}` };
    } catch (error) { return inspectionFromError(MAPPINGS_KEY, raw, error); }
  }

  subscribe(listener: (mappings: NormalizedUserFieldMapping[]) => void): () => void {
    if (!this.storage.subscribe) return () => undefined;
    return this.storage.subscribe<unknown>(MAPPINGS_KEY, (value) => listener(decode(value).mappings));
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
    return this.update((mappings) => remapMappings(mappings, remaps));
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

  private async read(): Promise<{ mappings: NormalizedUserFieldMapping[]; revision: number }> {
    try {
      return decode(await this.storage.get<unknown>(MAPPINGS_KEY));
    } catch (cause) {
      if (cause instanceof StorageError) throw cause;
      throw new StorageError('read_failed', 'read', MAPPINGS_KEY, cause);
    }
  }

  private update(transform: (mappings: NormalizedUserFieldMapping[]) => UserFieldMapping[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
        const current = await this.read();
        const mappings = normalizeAndDedupe(transform(current.mappings));
        const envelope: MappingEnvelope = { schemaVersion: MAPPINGS_SCHEMA_VERSION, revision: current.revision + 1, mappings };
        try {
          if (this.storage.compareAndSet) {
            if (await this.storage.compareAndSet(MAPPINGS_KEY, current.revision, envelope)) return;
            continue;
          }
          await this.storage.set(MAPPINGS_KEY, envelope);
          return;
        } catch (cause) {
          if (cause instanceof StorageError) throw cause;
          throw new StorageError('write_failed', 'write', MAPPINGS_KEY, cause);
        }
      }
      throw new StorageError('conflict', 'write', MAPPINGS_KEY, new Error('optimistic write retries exhausted'));
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
