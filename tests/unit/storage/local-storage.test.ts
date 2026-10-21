import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_TRANSACTION_RECOVERY_STATE, STORAGE_TRANSACTION_RESOLVE } from '../../../src/storage/coordinated-transaction';
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

  it('returns false only for an explicit revision conflict', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: { code: 'conflict', message: 'revision changed' } });
    await expect(new LocalStorage().compareAndSet('key', 2, { revision: 3 })).resolves.toBe(false);
  });

  it('propagates manual recovery and rejects malformed CAS responses', async () => {
    const storage = new LocalStorage();
    sendMessage.mockResolvedValueOnce({ ok: false, error: { code: 'recovery_required', outcome: 'manual-recovery-required', message: '请处理恢复日志' } });
    await expect(storage.compareAndSet('key', 2, { revision: 3 })).rejects.toMatchObject({ code: 'recovery_required', message: '请处理恢复日志', outcome: 'manual-recovery-required' });
    sendMessage.mockResolvedValueOnce({ ok: { ok: false } });
    await expect(storage.compareAndSet('key', 2, { revision: 3 })).rejects.toMatchObject({ code: 'write_failed' });
  });

  it('routes recovery inspection and explicit resolution through background', async () => {
    sendMessage.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ok: true, outcome: 'resolved-kept-current', transactionId: 'tx' });
    const storage = new LocalStorage();
    await storage.recoveryState();
    const request = { transactionId: 'tx', action: 'keep-current' as const, expected: [], expectedJournal: { transactionId: 'tx' } };
    await storage.resolveTransaction(request);
    expect(sendMessage).toHaveBeenNthCalledWith(1, { type: STORAGE_TRANSACTION_RECOVERY_STATE });
    expect(sendMessage).toHaveBeenNthCalledWith(2, { type: STORAGE_TRANSACTION_RESOLVE, request });
  });

  it('subscribes to local storage changes and ignores other areas', () => {
    const listener = vi.fn(); const storage = new LocalStorage(); const unsubscribe = storage.subscribe('key', listener);
    const changed = addListener.mock.calls[0][0];
    changed({ key: { newValue: 'new' } }, 'session'); changed({ key: { newValue: 'new' } }, 'local');
    expect(listener).toHaveBeenCalledOnce(); expect(listener).toHaveBeenCalledWith('new');
    unsubscribe(); expect(removeListener).toHaveBeenCalledWith(changed);
  });
});
