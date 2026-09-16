import { defineBackground } from 'wxt/utils/define-background';
import { AdapterRegistry } from '../src/adapters/adapter-registry';
import { ByteDanceJobsAdapter } from '../src/adapters/bytedance-jobs-adapter';
import { createApplicationController, handleRuntimeCommand } from '../src/runtime/application-controller';
import { LocalStorage } from '../src/storage/local-storage';
import { MappingStore } from '../src/storage/mapping-store';
import { ProfileStore } from '../src/profile/profile-store';
import type { RuntimeCommand } from '../src/shared/messages';
import { browser } from 'wxt/browser';

export default defineBackground(() => {
  const storage = new LocalStorage();
  const adapterRegistry = new AdapterRegistry();
  adapterRegistry.register(new ByteDanceJobsAdapter());
  const controller = createApplicationController({
    browser,
    profileStore: new ProfileStore(storage),
    mappingStore: new MappingStore(storage),
    adapterRegistry,
  });

  browser.runtime.onMessage.addListener((message: RuntimeCommand) => {
    if (!['scan-active-tab', 'fill-confirmed-fields', 'focus-active-field'].includes(message.type)) return undefined;
    return handleRuntimeCommand(controller, message);
  });
});
