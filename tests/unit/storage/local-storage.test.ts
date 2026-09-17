import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage, STORAGE_COMPARE_AND_SET } from '../../../src/storage/local-storage';

describe('LocalStorage', () => {
  const get = vi.fn(); const set = vi.fn(); const sendMessage = vi.fn();
  const addListener = vi.fn(); const removeListener = vi.fn();

  beforeEach(() => {
    get.mockReset(); set.mockReset(); sendMessage.mockReset(); addListener.mockReset(); removeListener.mockReset();
    vi.stubGlobal('browser', { storage: { local: { get, set }, onChanged: { addListener, removeListener } }, runtime: { sendMessage } });
  });

  it('reads and writes through browser.storage.local', async () => {
    get.mockResolvedValue({ key: 'value' });
    const storage = new LocalStorage();
    await expect(storage.get<string>('key')).resolves.toBe('value'); await storage.set('key', 'value');
    expect(get).toHaveBeenCalledWith('key'); expect(set).toHaveBeenCalledWith({ key: 'value' });
  });

  it('routes compare-and-set through the serialized background writer', async () => {
    sendMessage.mockResolvedValue({ ok: true }); const storage = new LocalStorage();
    await expect(storage.compareAndSet('key', 2, { revision: 3 })).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledWith({ type: STORAGE_COMPARE_AND_SET, key: 'key', expectedRevision: 2, value: { revision: 3 } });
  });

  it('subscribes to local storage changes and ignores other areas', () => {
    const listener = vi.fn(); const storage = new LocalStorage(); const unsubscribe = storage.subscribe('key', listener);
    const changed = addListener.mock.calls[0][0];
    changed({ key: { newValue: 'new' } }, 'session'); changed({ key: { newValue: 'new' } }, 'local');
    expect(listener).toHaveBeenCalledOnce(); expect(listener).toHaveBeenCalledWith('new');
    unsubscribe(); expect(removeListener).toHaveBeenCalledWith(changed);
  });
});
