export interface StoragePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export type StorageErrorCode = 'read_failed' | 'write_failed';
export type StorageOperation = 'read' | 'write';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly operation: StorageOperation;
  readonly key: string;
  readonly cause: unknown;

  constructor(
    code: StorageErrorCode,
    operation: StorageOperation,
    key: string,
    cause: unknown,
  ) {
    super(`Storage ${operation} failed for key ${key}`);
    this.name = 'StorageError';
    this.code = code;
    this.operation = operation;
    this.key = key;
    this.cause = cause;
  }
}
