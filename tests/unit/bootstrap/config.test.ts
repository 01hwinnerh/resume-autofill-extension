import { describe, expect, it } from 'vitest';

import formRuntime from '../../../entrypoints/form-runtime';
import config from '../../../wxt.config';

describe('extension manifest configuration', () => {
  it('requests only the review-first permissions needed by the extension shell', () => {
    const manifest = config.manifest as { permissions?: string[] };

    expect(config.manifest).toMatchObject({
      name: 'Resume Autofill Assistant',
      description: 'Review-first form filling for job applications',
      permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    });
    expect(config.manifest).not.toHaveProperty('host_permissions');
    expect(manifest.permissions).not.toContain('<all_urls>');
  });

  it('keeps the dynamically injected form runtime inert at load time', () => {
    document.body.innerHTML = '<input name="candidate-name" value="" />';
    const pageBeforeRuntime = document.body.innerHTML;

    formRuntime.main();

    expect(document.body.innerHTML).toBe(pageBeforeRuntime);
  });
});
