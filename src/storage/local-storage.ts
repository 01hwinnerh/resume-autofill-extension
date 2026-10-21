import { STORAGE_TRANSACTION, STORAGE_TRANSACTION_RECOVERY_STATE, STORAGE_TRANSACTION_RESOLVE, type StorageCompareAndSetResult, type StorageRecoveryState, type StorageTransactionRequest, type StorageTransactionResolutionRequest, type StorageTransactionResult } from './coordinated-transaction';
import { StorageError, type StorageErrorCode, type StoragePort } from './storage-port';

interface BrowserStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

interface StorageChange { newValue?: unknown }
interface RevisionedValue { revision?: unknown }

function isCompareAndSetResponse(value: unknown): value is StorageCompareAndSetResult {
  if (!value || typeof value !== 'object' || typeof (value as { ok?: unknown }).ok !== 'boolean') return false;
  if ((value as { ok: boolean }).ok) return true;
  const error = (value as { error?: unknown }).error;
  return !!error && typeof error === 'object'
    && ['conflict', 'recovery_required', 'write_failed', 'invalid_request'].includes(String((error as { code?: unknown }).code))
    && typeof (error as { message?: unknown }).message === 'string';
}

declare const browser: {
  storage: {
    local: BrowserStorageArea;
    onChanged: {
      addListener(listener: (changes: Record<string, StorageChange>, areaName: string) => void): void;
      removeListener(listener: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  };
  runtime: { sendMessage(message: unknown): Promise<unknown> };
};

export const STORAGE_COMPARE_AND_SET = 'storage-compare-and-set' as const;

export class LocalStorage implements StoragePort {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await browser.storage.local.get(key);
    return result[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  }

  async transaction(request: StorageTransactionRequest): Promise<StorageTransactionResult> {
    return browser.runtime.sendMessage({ type: STORAGE_TRANSACTION, request }) as Promise<StorageTransactionResult>;
  }

  async recoveryState(): Promise<StorageRecoveryState | undefined> {
    return browser.runtime.sendMessage({ type: STORAGE_TRANSACTION_RECOVERY_STATE }) as Promise<StorageRecoveryState | undefined>;
  }

  async resolveTransaction(request: StorageTransactionResolutionRequest): Promise<StorageTransactionResult> {
    return browser.runtime.sendMessage({ type: STORAGE_TRANSACTION_RESOLVE, request }) as Promise<StorageTransactionResult>;
  }

  async compareAndSet<T>(key: string, expectedRevision: number, value: T): Promise<boolean> {
    const response = await browser.runtime.sendMessage({ type: STORAGE_COMPARE_AND_SET, key, expectedRevision, value });
    if (!isCompareAndSetResponse(response)) {
      const error = new StorageError('write_failed', 'write', key, response);
      error.message = '存储 CAS 返回了无法识别的响应，未确认数据已持久化。';
      throw error;
    }
    if (response.ok) return true;
    if (response.error.code === 'conflict') return false;
    const code: StorageErrorCode = response.error.code === 'recovery_required' ? 'recovery_required' : 'write_failed';
    const error = new StorageError(code, 'write', key, response.error);
    error.message = response.error.message;
    Object.assign(error, { outcome: response.error.outcome });
    throw error;
  }

  subscribe<T>(key: string, listener: (value: T | undefined) => void): () => void {
    const onChanged = (changes: Record<string, StorageChange>, areaName: string) => {
      if (areaName === 'local' && key in changes) listener(changes[key].newValue as T | undefined);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }
}

export function storedRevision(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const revision = (value as RevisionedValue).revision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}
