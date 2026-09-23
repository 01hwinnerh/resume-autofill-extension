import {
  APPLICATION_STAGE_PRESETS,
  applicationStageLabel,
  type ApplicationEvent,
  type ApplicationRecord,
  type ApplicationStageId,
  type NewApplicationEvent,
  type NewApplicationRecord,
} from '../shared/application-record';
import { StorageError, UnsupportedSchemaVersionError, type StoragePort } from './storage-port';

export const APPLICATIONS_KEY = 'resume-autofill.applications.v1';
const SCHEMA_VERSION = 1 as const;
const MAX_WRITE_ATTEMPTS = 8;
const STAGES = new Set<string>([...APPLICATION_STAGE_PRESETS.map((item) => item.id), 'custom']);

interface ApplicationEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  revision?: number;
  records: ApplicationRecord[];
}

export interface ApplicationRecordPatch {
  company?: string;
  role?: string;
  url?: string;
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

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validStage(value: unknown): value is ApplicationStageId {
  return typeof value === 'string' && STAGES.has(value);
}

export function isApplicationEvent(value: unknown): value is ApplicationEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ApplicationEvent>;
  return typeof event.id === 'string' && Boolean(event.id.trim())
    && validStage(event.stage) && typeof event.label === 'string' && Boolean(event.label.trim())
    && validDate(event.occurredAt) && (event.note === undefined || typeof event.note === 'string');
}

export function isApplicationRecord(value: unknown): value is ApplicationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ApplicationRecord>;
  return typeof record.id === 'string' && Boolean(record.id.trim())
    && typeof record.company === 'string' && Boolean(record.company.trim())
    && typeof record.role === 'string' && Boolean(record.role.trim())
    && typeof record.url === 'string' && typeof record.sourceHost === 'string'
    && validDate(record.appliedAt) && validDate(record.updatedAt)
    && validStage(record.currentStage) && typeof record.currentStageLabel === 'string'
    && Array.isArray(record.events) && record.events.length > 0 && record.events.every(isApplicationEvent);
}

function isEnvelope(value: unknown): value is ApplicationEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<ApplicationEnvelope>;
  return envelope.schemaVersion === SCHEMA_VERSION
    && (envelope.revision === undefined || (Number.isSafeInteger(envelope.revision) && envelope.revision! >= 0))
    && Array.isArray(envelope.records) && envelope.records.every(isApplicationRecord);
}

function stableSortEvents(events: ApplicationEvent[]): ApplicationEvent[] {
  return events.map((event, index) => ({ event, index }))
    .sort((left, right) => left.event.occurredAt.localeCompare(right.event.occurredAt) || left.index - right.index)
    .map(({ event }) => event);
}

function validatedUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('职位链接必须是有效的 http/https URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('职位链接必须是有效的 http/https URL');
  return url.href;
}

function normalizeEvent(event: ApplicationEvent): ApplicationEvent {
  const label = applicationStageLabel(event.stage, event.stage === 'custom' ? event.label : undefined);
  return { ...event, label, occurredAt: new Date(event.occurredAt).toISOString(), note: event.note?.trim() || undefined };
}

function normalizeRecord(record: ApplicationRecord): ApplicationRecord {
  if (!isApplicationRecord(record)) throw new Error('投递记录内容不完整或字段类型无效');
  const events = stableSortEvents(record.events.map(normalizeEvent));
  const latest = events[events.length - 1]!;
  const url = validatedUrl(record.url);
  return {
    ...record,
    company: record.company.trim(), role: record.role.trim(), url,
    sourceHost: url ? new URL(url).host : record.sourceHost.trim(),
    appliedAt: events.find((event) => event.stage === 'applied')?.occurredAt ?? events[0]!.occurredAt, updatedAt: latest.occurredAt,
    currentStage: latest.stage, currentStageLabel: latest.label, events,
  };
}

function normalizeRecords(records: ApplicationRecord[]): ApplicationRecord[] {
  const ids = new Set<string>();
  return records.map((record) => {
    const normalized = normalizeRecord(structuredClone(record));
    if (ids.has(normalized.id)) throw new Error(`投递记录 ID 重复：${normalized.id}`);
    ids.add(normalized.id);
    return normalized;
  });
}

function decode(value: unknown): { records: ApplicationRecord[]; revision: number } {
  if (value === undefined) return { records: [], revision: 0 };
  if (Array.isArray(value)) {
    if (!value.every(isApplicationRecord)) throw new Error('历史投递记录格式已损坏，数据未被修改');
    return { records: normalizeRecords(value), revision: 0 };
  }
  if (value && typeof value === 'object') {
    const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
    if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) throw new UnsupportedSchemaVersionError(APPLICATIONS_KEY, schemaVersion);
  }
  if (!isEnvelope(value)) throw new Error('投递记录存储格式无法识别或已损坏，数据未被修改');
  return { records: normalizeRecords(value.records), revision: value.revision ?? 0 };
}

function normalizeText(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
function normalizeUrl(value: string): string {
  try { const url = new URL(value); url.hash = ''; url.search = ''; url.pathname = url.pathname.replace(/\/$/, '') || '/'; return url.toString(); }
  catch { return value.trim(); }
}
function normalizeHost(value: string): string { return value.trim().replace(/^www\./i, '').toLocaleLowerCase(); }

export class ApplicationStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  async list(): Promise<ApplicationRecord[]> {
    const { records } = await this.read();
    return this.sorted(records);
  }

  subscribe(listener: (records: ApplicationRecord[]) => void, onError?: (error: StorageError) => void): () => void {
    if (!this.storage.subscribe) return () => undefined;
    return this.storage.subscribe<unknown>(APPLICATIONS_KEY, (value) => {
      try { listener(this.sorted(decode(value).records)); }
      catch (cause) {
        const error = cause instanceof StorageError
          ? cause
          : new StorageError('read_failed', 'read', APPLICATIONS_KEY, cause);
        if (!(cause instanceof StorageError) && cause instanceof Error) error.message = `读取投递记录失败：${cause.message}`;
        onError?.(error);
      }
    });
  }

  private sorted(records: ApplicationRecord[]): ApplicationRecord[] {
    return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async replaceAll(records: ApplicationRecord[]): Promise<void> {
    const normalized = normalizeRecords(records);
    await this.update(() => normalized);
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
    if (!input.company.trim() || !input.role.trim()) throw new Error('请填写公司和职位名称');
    const now = input.appliedAt ?? new Date().toISOString();
    const firstEvent: ApplicationEvent = { id: createApplicationId(), stage: 'applied', label: applicationStageLabel('applied'), occurredAt: now, note: input.note?.trim() || undefined };
    const record = normalizeRecord({ id: createApplicationId(), company: input.company, role: input.role, url: input.url, sourceHost: input.sourceHost, appliedAt: now, updatedAt: now, currentStage: 'applied', currentStageLabel: firstEvent.label, events: [firstEvent] });
    await this.update((records) => [record, ...records]); return record;
  }

  async updateRecord(recordId: string, patch: ApplicationRecordPatch): Promise<ApplicationRecord> {
    let updated: ApplicationRecord | undefined;
    await this.update((records) => records.map((record) => {
      if (record.id !== recordId) return record;
      updated = normalizeRecord({ ...record, ...patch });
      return updated;
    }));
    if (!updated) throw new Error('未找到这条投递记录');
    return updated;
  }

  async addEvent(recordId: string, input: NewApplicationEvent): Promise<ApplicationRecord> {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    return this.changeEvents(recordId, (events) => [...events, { id: createApplicationId(), stage: input.stage, label: applicationStageLabel(input.stage, input.label), occurredAt, note: input.note }]);
  }

  async updateEvent(recordId: string, eventId: string, input: NewApplicationEvent): Promise<ApplicationRecord> {
    return this.changeEvents(recordId, (events) => {
      if (!events.some((event) => event.id === eventId)) throw new Error('未找到该时间线节点');
      return events.map((event) => event.id === eventId ? { ...event, stage: input.stage, label: applicationStageLabel(input.stage, input.label), occurredAt: input.occurredAt ?? event.occurredAt, note: input.note } : event);
    });
  }

  async removeEvent(recordId: string, eventId: string): Promise<ApplicationRecord> {
    return this.changeEvents(recordId, (events) => {
      if (!events.some((event) => event.id === eventId)) throw new Error('未找到该时间线节点');
      if (events.length <= 1) throw new Error('不能删除唯一的时间线节点；若整条记录误建，请删除投递记录');
      return events.filter((event) => event.id !== eventId);
    });
  }

  async delete(recordId: string): Promise<void> { await this.update((records) => records.filter((record) => record.id !== recordId)); }

  private async changeEvents(recordId: string, transform: (events: ApplicationEvent[]) => ApplicationEvent[]): Promise<ApplicationRecord> {
    let updated: ApplicationRecord | undefined;
    await this.update((records) => records.map((record) => {
      if (record.id !== recordId) return record;
      const events = transform(structuredClone(record.events));
      updated = normalizeRecord({ ...record, events });
      return updated;
    }));
    if (!updated) throw new Error('未找到这条投递记录');
    return updated;
  }

  private async read(): Promise<{ records: ApplicationRecord[]; revision: number }> {
    try { return decode(await this.storage.get<unknown>(APPLICATIONS_KEY)); }
    catch (cause) {
      if (cause instanceof UnsupportedSchemaVersionError) throw cause;
      const error = new StorageError('read_failed', 'read', APPLICATIONS_KEY, cause);
      if (cause instanceof Error) error.message = `读取投递记录失败：${cause.message}`;
      throw error;
    }
  }

  private update(transform: (records: ApplicationRecord[]) => ApplicationRecord[]): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
        const current = await this.read(); const records = normalizeRecords(transform(structuredClone(current.records)));
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
