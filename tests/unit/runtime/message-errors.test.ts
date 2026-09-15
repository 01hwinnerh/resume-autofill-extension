import { describe, expect, it } from 'vitest';

import { CONTENT_SCRIPT_TIMEOUT_MS } from '../../../src/runtime/runtime-errors';
import type { PageResponse, RuntimeCommand } from '../../../src/shared/messages';

describe('runtime message contracts', () => {
  it('uses the confirmed five-second content runtime timeout', () => {
    expect(CONTENT_SCRIPT_TIMEOUT_MS).toBe(5000);
  });

  it('keeps UI commands separate from page responses', () => {
    const command: RuntimeCommand = { type: 'scan-active-tab' };
    const response: PageResponse = {
      type: 'error',
      requestId: 'request-1',
      error: {
        code: 'CONTENT_SCRIPT_TIMEOUT',
        message: 'The page runtime did not respond in time.',
        retryable: true,
      },
    };

    expect(command.type).toBe('scan-active-tab');
    expect(response.type).toBe('error');
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });
});
