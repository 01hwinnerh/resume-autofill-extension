import { describe, expect, it } from 'vitest';

import { MESSAGE_TYPES } from '../../../src/shared/messages';
import type {
  ConfirmedFill,
  PageMessage,
} from '../../../src/shared/messages';

describe('message contracts', () => {
  it('exposes the page message discriminants', () => {
    expect(MESSAGE_TYPES).toEqual(['scan-page', 'fill-fields']);
  });

  it('keeps scan and confirmed-fill messages discriminated and serializable', () => {
    const scanMessage: PageMessage = {
      type: 'scan-page',
      requestId: 'request-scan-1',
    };
    const confirmedFill: ConfirmedFill = {
      fieldId: 'field-1',
      profileKey: 'contact.email',
      value: 'candidate@example.test',
    };
    const fillMessage: PageMessage = {
      type: 'fill-fields',
      requestId: 'request-fill-1',
      fields: [confirmedFill],
    };

    expect(JSON.parse(JSON.stringify(scanMessage))).toEqual(scanMessage);
    expect(JSON.parse(JSON.stringify(fillMessage))).toEqual(fillMessage);
    expect(scanMessage.type).toBe('scan-page');
    expect(fillMessage.type).toBe('fill-fields');
  });
});
