import { describe, expect, it } from 'vitest';

import { PROFILE_SCHEMA_VERSION } from '../../../src/shared/profile';
import type { Profile } from '../../../src/shared/profile';

describe('profile contracts', () => {
  it('exposes the current serializable profile schema version', () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(1);
  });

  it('keeps profile values serializable and preserves custom keys', () => {
    const profile: Profile = {
      schemaVersion: 1,
      fields: {
        'contact.email': {
          key: 'contact.email',
          label: '邮箱',
          type: 'text',
          value: 'candidate@example.test',
          policy: 'auto',
        },
        'custom.acceptAdjustment': {
          key: 'custom.acceptAdjustment',
          label: '是否接受调剂',
          type: 'boolean',
          value: true,
          policy: 'review',
        },
      },
    };

    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  });
});
