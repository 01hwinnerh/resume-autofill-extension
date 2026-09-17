export interface StoragePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  /** Atomic when implemented by the background-backed browser storage adapter. */
  compareAndSet?<T>(key: string, expectedRevision: number, value: T): Promise<boolean>;
  subscribe?<T>(key: string, listener: (value: T | undefined) => void): () => void;
}

export type StorageErrorCode = 'read_failed' | 'write_failed' | 'conflict' | 'unsupported_schema';
export type StorageOperation = 'read' | 'write';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly operation: StorageOperation;
  readonly key: string;
  readonly cause: unknown;

  constructor(code: StorageErrorCode, operation: StorageOperation, key: string, cause: unknown) {
    super(`Storage ${operation} failed for key ${key}`);
    this.name = 'StorageError';
    this.code = code;
    this.operation = operation;
    this.key = key;
    this.cause = cause;
  }
}

export class UnsupportedSchemaVersionError extends StorageError {
  readonly schemaVersion: unknown;

  constructor(key: string, schemaVersion: unknown) {
    super('unsupported_schema', 'read', key, undefined);
    this.name = 'UnsupportedSchemaVersionError';
    this.schemaVersion = schemaVersion;
    this.message = `检测到较新版本的数据（版本 ${String(schemaVersion)}），当前扩展无法安全读取。请升级扩展后重试；数据未被修改。`;
  }
}
