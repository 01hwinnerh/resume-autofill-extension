import type { StoragePort } from './storage-port';

interface BrowserStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface StorageChange { newValue?: unknown }
interface RevisionedValue { revision?: unknown }
interface CompareAndSetResponse { ok: boolean }

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

  async compareAndSet<T>(key: string, expectedRevision: number, value: T): Promise<boolean> {
    const response = await browser.runtime.sendMessage({ type: STORAGE_COMPARE_AND_SET, key, expectedRevision, value }) as CompareAndSetResponse;
    return response.ok;
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
