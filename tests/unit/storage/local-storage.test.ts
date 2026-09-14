import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage } from '../../../src/storage/local-storage';

describe('LocalStorage', () => {
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    get.mockReset();
    set.mockReset();
    vi.stubGlobal('browser', { storage: { local: { get, set } } });
  });

  it('reads and writes through browser.storage.local', async () => {
    get.mockResolvedValue({ key: 'value' });
    const storage = new LocalStorage();

    await expect(storage.get<string>('key')).resolves.toBe('value');
    await storage.set('key', 'value');

    expect(get).toHaveBeenCalledWith('key');
    expect(set).toHaveBeenCalledWith({ key: 'value' });
  });
});
