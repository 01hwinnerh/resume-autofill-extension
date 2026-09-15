import { describe, expect, it } from 'vitest';
import type { Profile } from '../../../src/shared/profile';
import { createCustomField, generateCustomFieldKey, parseFieldValue, profileCompletion } from '../../../src/ui/profile-management';

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '测试用户', policy: 'auto' },
    'contact.email': { key: 'contact.email', label: '邮箱', type: 'text', value: 'user@example.test', policy: 'auto' },
  },
};

describe('profile management logic', () => {
  it('calculates overall and grouped completion from canonical definitions', () => {
    const completion = profileCompletion(profile);
    expect(completion.filled).toBe(2);
    expect(completion.total).toBeGreaterThan(2);
    expect(completion.bySection.basic.filled).toBe(2);
  });

  it('generates stable valid custom keys and typed values', () => {
    expect(generateCustomFieldKey(123456)).toBe('custom.field_2n9c');
    expect(parseFieldValue('multiselect', 'React, TypeScript')).toEqual(['React', 'TypeScript']);
    expect(createCustomField({ label: '签证状态', type: 'boolean', value: 'true', policy: 'review' }, 123456)).toEqual({
      key: 'custom.field_2n9c', label: '签证状态', type: 'boolean', value: true, policy: 'review',
    });
  });
});
