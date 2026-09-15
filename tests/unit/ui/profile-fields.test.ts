import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, buildProfileField, isCustomProfileKey } from '../../../src/ui/profile-fields';

describe('profile field catalog', () => {
  it('accepts only keys in the custom namespace', () => {
    expect(isCustomProfileKey('custom.acceptAdjustment')).toBe(true);
    expect(isCustomProfileKey('acceptAdjustment')).toBe(false);
    expect(isCustomProfileKey('custom.')).toBe(false);
  });

  it('contains P0 and enhanced education, work, and project fields', () => {
    const keys = new Set(PROFILE_FIELDS.map((item) => item.key));
    ['identity.namePinyin', 'employment.yearsOfExperience', 'skills.english', 'links.portfolio',
      'educations.0.gpa', 'educations.0.thesis', 'workExperiences.0.referencePhone',
      'projects.0.teamSize', 'projects.0.attachmentReference'].forEach((key) => expect(keys.has(key)).toBe(true));
  });

  it('marks sensitive fields for review and strips UI-only metadata when persisted', () => {
    const salary = PROFILE_FIELDS.find((item) => item.key === 'workExperiences.0.currentSalary')!;
    expect(salary.policy).toBe('review');
    expect(buildProfileField(salary, 'value')).toEqual({ key: salary.key, label: salary.label, type: salary.type, policy: 'review', value: 'value' });
  });
});
