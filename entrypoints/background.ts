import { defineBackground } from 'wxt/utils/define-background';
import { AdapterRegistry } from '../src/adapters/adapter-registry';
import { ByteDanceJobsAdapter } from '../src/adapters/bytedance-jobs-adapter';
import { createApplicationController, handleRuntimeCommand } from '../src/runtime/application-controller';
import { executeCoordinatedCompareAndSet, executeStorageTransaction, readStorageRecoveryState, recoverStorageTransaction, resolveStorageTransaction, STORAGE_TRANSACTION, STORAGE_TRANSACTION_RECOVERY_STATE, STORAGE_TRANSACTION_RESOLVE, type StorageTransactionRequest, type StorageTransactionResolutionRequest } from '../src/storage/coordinated-transaction';
import { LocalStorage, STORAGE_COMPARE_AND_SET } from '../src/storage/local-storage';
import { MappingStore } from '../src/storage/mapping-store';
import { ProfileStore } from '../src/profile/profile-store';
import type { RuntimeCommand } from '../src/shared/messages';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
  const storage = new LocalStorage();
  const adapterRegistry = new AdapterRegistry();
  let storageWriteQueue = Promise.resolve();
  const enqueueStorage = <T,>(work: () => Promise<T>): Promise<T> => {
    const operation = storageWriteQueue.then(work);
    storageWriteQueue = operation.then(() => undefined, () => undefined);
    return operation;
  };
  void enqueueStorage(() => recoverStorageTransaction(storage));
  adapterRegistry.register(new ByteDanceJobsAdapter());
  const controller = createApplicationController({
    browser,
    profileStore: new ProfileStore(storage),
    mappingStore: new MappingStore(storage),
    adapterRegistry,
  });

  browser.runtime.onMessage.addListener((message: RuntimeCommand | { type: typeof STORAGE_COMPARE_AND_SET; key: string; expectedRevision: number; value: unknown } | { type: typeof STORAGE_TRANSACTION; request: StorageTransactionRequest } | { type: typeof STORAGE_TRANSACTION_RECOVERY_STATE } | { type: typeof STORAGE_TRANSACTION_RESOLVE; request: StorageTransactionResolutionRequest }) => {
    if (message.type === STORAGE_TRANSACTION) return enqueueStorage(() => executeStorageTransaction(storage, message.request));
    if (message.type === STORAGE_TRANSACTION_RECOVERY_STATE) return enqueueStorage(async () => {
      await recoverStorageTransaction(storage);
      return readStorageRecoveryState(storage);
    });
    if (message.type === STORAGE_TRANSACTION_RESOLVE) return enqueueStorage(() => resolveStorageTransaction(storage, message.request));
    if (message.type === STORAGE_COMPARE_AND_SET) {
      return enqueueStorage(() => executeCoordinatedCompareAndSet(storage, message.key, message.expectedRevision, message.value));
    }
    if (!['scan-active-tab', 'extract-application-candidates', 'fill-confirmed-fields', 'query-fill-operation', 'focus-active-field', 'close-and-focus-active-field'].includes(message.type)) return undefined;
    return handleRuntimeCommand(controller, message);
  });
});
