import type { StoragePort } from './storage-port';

interface BrowserStorageArea {
  get<T>(key: string): Promise<Record<string, T>>;
  set<T>(items: Record<string, T>): Promise<void>;
}

declare const browser: {
  storage: {
    local: BrowserStorageArea;
  };
};

export class LocalStorage implements StoragePort {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await browser.storage.local.get<T>(key);
    return result[key];
  }

  async set<T>(key: string, value: T): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  }
}
