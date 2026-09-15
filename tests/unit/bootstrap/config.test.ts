import { describe, expect, it, vi } from 'vitest';

const addListener = vi.hoisted(() => vi.fn());

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      onMessage: { addListener },
    },
  },
}));

import formRuntime from '../../../entrypoints/form-runtime';
import config from '../../../wxt.config';

describe('extension manifest configuration', () => {
  it('requests review-first permissions and explicit web-page access', () => {
    const manifest = config.manifest as { permissions?: string[]; host_permissions?: string[] };

    expect(config.manifest).toMatchObject({
      name: 'Resume Autofill Assistant',
      description: 'Review-first form filling for job applications',
      permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
      host_permissions: ['http://*/*', 'https://*/*'],
    });
    expect(manifest.permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).not.toContain('<all_urls>');
  });

  it('registers only a listener and does not scan or mutate the page at load time', () => {
    document.body.innerHTML = '<input name="candidate-name" value="" />';
    const pageBeforeRuntime = document.body.innerHTML;

    formRuntime.main();

    expect(document.body.innerHTML).toBe(pageBeforeRuntime);
    expect(addListener).toHaveBeenCalledOnce();
  });
});
