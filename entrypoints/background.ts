import { defineBackground } from 'wxt/utils/define-background';
import { AdapterRegistry } from '../src/adapters/adapter-registry';
import { ByteDanceJobsAdapter } from '../src/adapters/bytedance-jobs-adapter';
import { createApplicationController, handleRuntimeCommand } from '../src/runtime/application-controller';
import { LocalStorage, STORAGE_COMPARE_AND_SET, storedRevision } from '../src/storage/local-storage';
import { MappingStore } from '../src/storage/mapping-store';
import { ProfileStore } from '../src/profile/profile-store';
import type { RuntimeCommand } from '../src/shared/messages';
import { browser } from 'wxt/browser';

const CONCURRENT_STORAGE_KEYS = new Set(['resume-autofill.profile.v1', 'resume-autofill.mappings.v1', 'resume-autofill.applications.v1']);

export default defineBackground(() => {
  const storage = new LocalStorage();
  const adapterRegistry = new AdapterRegistry();
  let storageWriteQueue = Promise.resolve();
  adapterRegistry.register(new ByteDanceJobsAdapter());
  const controller = createApplicationController({
    browser,
    profileStore: new ProfileStore(storage),
    mappingStore: new MappingStore(storage),
    adapterRegistry,
  });

  browser.runtime.onMessage.addListener((message: RuntimeCommand | { type: typeof STORAGE_COMPARE_AND_SET; key: string; expectedRevision: number; value: unknown }) => {
    if (message.type === STORAGE_COMPARE_AND_SET) {
      const operation = storageWriteQueue.then(async () => {
        if (!CONCURRENT_STORAGE_KEYS.has(message.key)) return { ok: false };
        const current = await storage.get<unknown>(message.key);
        if (storedRevision(current) !== message.expectedRevision) return { ok: false };
        await storage.set(message.key, message.value);
        return { ok: true };
      });
      storageWriteQueue = operation.then(() => undefined, () => undefined);
      return operation;
    }
    if (!['scan-active-tab', 'fill-confirmed-fields', 'focus-active-field'].includes(message.type)) return undefined;
    return handleRuntimeCommand(controller, message);
  });
});
