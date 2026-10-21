import { StorageError, UnsupportedSchemaVersionError } from './storage-port';

export type StorageDataState = 'missing' | 'legacy' | 'current' | 'corrupt' | 'future';

export interface StorageInspection {
  key: string;
  state: StorageDataState;
  raw?: unknown;
  schemaVersion?: unknown;
  message?: string;
}

export class CorruptStorageDataError extends StorageError {
  readonly raw: unknown;

  constructor(key: string, raw: unknown, detail = '存储格式无法识别或已损坏') {
    super('corrupt_data', 'read', key, undefined);
    this.name = 'CorruptStorageDataError';
    this.raw = structuredClone(raw);
    this.message = `${detail}（${key}）；数据未被修改。请先导出原始 storage JSON 后再恢复。`;
  }
}

export function futureSchema(key: string, value: unknown, currentVersion: number): never | void {
  if (!value || typeof value !== 'object') return;
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof schemaVersion === 'number' && schemaVersion > currentVersion) throw new UnsupportedSchemaVersionError(key, schemaVersion);
}

export function inspectionFromError(key: string, raw: unknown, error: unknown): StorageInspection {
  if (error instanceof UnsupportedSchemaVersionError) return { key, state: 'future', raw: structuredClone(raw), schemaVersion: error.schemaVersion, message: error.message };
  return { key, state: 'corrupt', raw: structuredClone(raw), message: error instanceof Error ? error.message : '数据已损坏' };
}
