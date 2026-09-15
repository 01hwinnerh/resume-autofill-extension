import { describe, expect, it } from 'vitest';

import { isCustomProfileKey } from '../../../src/ui/profile-fields';

describe('custom profile keys', () => {
  it('accepts only keys in the custom namespace', () => {
    expect(isCustomProfileKey('custom.acceptAdjustment')).toBe(true);
    expect(isCustomProfileKey('acceptAdjustment')).toBe(false);
    expect(isCustomProfileKey('custom.')).toBe(false);
  });
});
