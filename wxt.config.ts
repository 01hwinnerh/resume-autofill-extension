import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Resume Autofill Assistant',
    description: 'Review-first form filling for job applications',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    host_permissions: ['http://*/*', 'https://*/*'],
  },
});
