import { defineConfig } from 'wxt';

const testOnlyManifest = process.env.WXT_ENV === 'test'
  ? { host_permissions: ['http://127.0.0.1/*'] }
  : {};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Resume Autofill Assistant',
    description: 'Review-first form filling for job applications',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    ...testOnlyManifest,
  },
});
