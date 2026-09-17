import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Resume Autofill Assistant',
    description: 'Review-first form filling for job applications',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    // Cross-origin ATS frames need explicit host access; runtime injection still happens only after a user scan/fill action.
    host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [{ resources: ['preview.html'], matches: ['http://*/*', 'https://*/*'] }],
  },
});
