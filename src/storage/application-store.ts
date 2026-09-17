import { applicationStageLabel, type ApplicationRecord, type NewApplicationEvent, type NewApplicationRecord } from '../shared/application-record';
import { StorageError, UnsupportedSchemaVersionError, type StoragePort } from './storage-port';

export const APPLICATIONS_KEY = 'resume-autofill.applications.v1';
const SCHEMA_VERSION = 1 as const;
const MAX_WRITE_ATTEMPTS = 8;

interface ApplicationEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  revision?: number;
  records: ApplicationRecord[];
}

export function createApplicationId(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)): string {
  if (randomUUID) return randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isApplicationRecord(value: unknown): value is ApplicationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ApplicationRecord>;
  return typeof record.id === 'string'
    && typeof record.company === 'string'
    && typeof record.role === 'string'
    && typeof record.url === 'string'
    && typeof record.sourceHost === 'string'
    && typeof record.appliedAt === 'string'
    && typeof record.updatedAt === 'string'
    && typeof record.currentStage === 'string'
    && typeof record.currentStageLabel === 'string'
    && Array.isArray(record.events);
}

function isEnvelope(value: unknown): value is ApplicationEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<ApplicationEnvelope>;
  return envelope.schemaVersion === SCHEMA_VERSION
    && (envelope.revision === undefined || (Number.isSafeInteger(envelope.revision) && envelope.revision! >= 0))
    && Array.isArray(envelope.records)
    && envelope.records.every(isApplicationRecord);
}

function decode(value: unknown): { records: ApplicationRecord[]; revision: number } {
  if (value && typeof value === 'object') {
    const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
    if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) throw new UnsupportedSchemaVersionError(APPLICATIONS_KEY, schemaVersion);
  }
  return isEnvelope(value) ? { records: value.records, revision: value.revision ?? 0 } : { records: [], revision: 0 };
}

function normalizeText(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function normalizeUrl(value: string): string {
  try {
    const url = new URL(value); url.hash = ''; url.search = ''; url.pathname = url.pathname.replace(/\/$/, '') || '/'; return url.toString();
  } catch { return value.trim(); }
}
function normalizeHost(value: string): string { return value.trim().replace(/^www\./i, '').toLocaleLowerCase(); }

export class ApplicationStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<ApplicationRecord[]> {
    const { records } = await this.read();
    return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findDuplicates(input: NewApplicationRecord, withinDays = 30): Promise<ApplicationRecord[]> {
    const records = await this.list(); const company = normalizeText(input.company); const role = normalizeText(input.role);
    const url = normalizeUrl(input.url); const host = normalizeHost(input.sourceHost); const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
    return records.filter((record) => {
      const sameUrl = normalizeUrl(record.url) === url;
      const sameIdentity = normalizeText(record.company) === company && normalizeText(record.role) === role;
      const recentSameHost = normalizeHost(record.sourceHost) === host && Date.parse(record.appliedAt) >= cutoff;
      return sameIdentity && (sameUrl || recentSameHost);
    });
  }

  async create(input: NewApplicationRecord): Promise<ApplicationRecord> {
    const now = input.appliedAt ?? new Date().toISOString();
    const firstEvent = { id: createApplicationId(), stage: 'applied' as const, label: applicationStageLabel('applied'), occurredAt: now, note: input.note?.trim() || undefined };
    const record: ApplicationRecord = { id: createApplicationId(), company: input.company.trim(), role: input.role.trim(), url: input.url, sourceHost: input.sourceHost, appliedAt: now, updatedAt: now, currentStage: 'applied', currentStageLabel: firstEvent.label, events: [firstEvent] };
    if (!record.company || !record.role) throw new Error('请填写公司和职位名称');
    await this.update((records) => [record, ...records]); return record;
  }

  async addEvent(recordId: string, input: NewApplicationEvent): Promise<ApplicationRecord> {
    let updated: ApplicationRecord | undefined;
    await this.update((records) => {
      updated = undefined;
      return records.map((record) => {
        if (record.id !== recordId) return record;
        const occurredAt = input.occurredAt ?? new Date().toISOString(); const label = applicationStageLabel(input.stage, input.label);
        const event = { id: createApplicationId(), stage: input.stage, label, occurredAt, note: input.note?.trim() || undefined };
        const events = [...record.events, event]; const latest = events.reduce((current, candidate) => candidate.occurredAt >= current.occurredAt ? candidate : current);
        updated = { ...record, currentStage: latest.stage, currentStageLabel: latest.label, updatedAt: occurredAt > record.updatedAt ? occurredAt : record.updatedAt, events };
        return updated;
      });
    });
    if (!updated) throw new Error('未找到这条投递记录'); return updated;
  }

  async delete(recordId: string): Promise<void> { await this.update((records) => records.filter((record) => record.id !== recordId)); }

  private async read(): Promise<{ records: ApplicationRecord[]; revision: number }> {
    try { return decode(await this.storage.get<unknown>(APPLICATIONS_KEY)); }
    catch (cause) {
      if (cause instanceof UnsupportedSchemaVersionError) throw cause;
      throw new StorageError('read_failed', 'read', APPLICATIONS_KEY, cause);
    }
  }

  private update(transform: (records: ApplicationRecord[]) => ApplicationRecord[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
        const current = await this.read(); const records = transform(structuredClone(current.records));
        const envelope: ApplicationEnvelope = { schemaVersion: SCHEMA_VERSION, revision: current.revision + 1, records };
        try {
          if (this.storage.compareAndSet) { if (await this.storage.compareAndSet(APPLICATIONS_KEY, current.revision, envelope)) return; continue; }
          await this.storage.set(APPLICATIONS_KEY, envelope); return;
        } catch (cause) { throw new StorageError('write_failed', 'write', APPLICATIONS_KEY, cause); }
      }
      throw new StorageError('conflict', 'write', APPLICATIONS_KEY, new Error('optimistic write retries exhausted'));
    });
    this.writeQueue = operation.catch(() => undefined); return operation;
  }
}
