import { applicationStageLabel, type ApplicationRecord, type NewApplicationEvent, type NewApplicationRecord } from '../shared/application-record';
import { StorageError, type StoragePort } from './storage-port';

const APPLICATIONS_KEY = 'resume-autofill.applications.v1';
const SCHEMA_VERSION = 1 as const;

interface ApplicationEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  records: ApplicationRecord[];
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    && Array.isArray(envelope.records)
    && envelope.records.every(isApplicationRecord);
}

export class ApplicationStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<ApplicationRecord[]> {
    try {
      const value = await this.storage.get<ApplicationEnvelope>(APPLICATIONS_KEY);
      return isEnvelope(value) ? [...value.records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
    } catch (cause) {
      throw new StorageError('read_failed', 'read', APPLICATIONS_KEY, cause);
    }
  }

  async create(input: NewApplicationRecord): Promise<ApplicationRecord> {
    const now = input.appliedAt ?? new Date().toISOString();
    const firstEvent = {
      id: createId('event'),
      stage: 'applied' as const,
      label: applicationStageLabel('applied'),
      occurredAt: now,
      note: input.note?.trim() || undefined,
    };
    const record: ApplicationRecord = {
      id: createId('application'),
      company: input.company.trim(),
      role: input.role.trim(),
      url: input.url,
      sourceHost: input.sourceHost,
      appliedAt: now,
      updatedAt: now,
      currentStage: 'applied',
      currentStageLabel: firstEvent.label,
      events: [firstEvent],
    };
    if (!record.company || !record.role) throw new Error('请填写公司和职位名称');
    await this.update((records) => [record, ...records]);
    return record;
  }

  async addEvent(recordId: string, input: NewApplicationEvent): Promise<ApplicationRecord> {
    let updated: ApplicationRecord | undefined;
    await this.update((records) => records.map((record) => {
      if (record.id !== recordId) return record;
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const label = applicationStageLabel(input.stage, input.label);
      const event = { id: createId('event'), stage: input.stage, label, occurredAt, note: input.note?.trim() || undefined };
      const events = [...record.events, event];
      const latest = events.reduce((current, candidate) => candidate.occurredAt >= current.occurredAt ? candidate : current);
      updated = {
        ...record,
        currentStage: latest.stage,
        currentStageLabel: latest.label,
        updatedAt: occurredAt > record.updatedAt ? occurredAt : record.updatedAt,
        events,
      };
      return updated;
    }));
    if (!updated) throw new Error('未找到这条投递记录');
    return updated;
  }

  async delete(recordId: string): Promise<void> {
    await this.update((records) => records.filter((record) => record.id !== recordId));
  }

  private update(transform: (records: ApplicationRecord[]) => ApplicationRecord[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const records = transform(await this.list());
      try {
        await this.storage.set<ApplicationEnvelope>(APPLICATIONS_KEY, { schemaVersion: SCHEMA_VERSION, records });
      } catch (cause) {
        throw new StorageError('write_failed', 'write', APPLICATIONS_KEY, cause);
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
