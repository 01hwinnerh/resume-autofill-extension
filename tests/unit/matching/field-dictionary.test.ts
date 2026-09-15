import { describe, expect, it } from 'vitest';
import { findDictionaryField, normalizeDictionaryKey } from '../../../src/matching/field-dictionary';
import { matchFields } from '../../../src/matching/generic-matcher';
import type { Profile } from '../../../src/shared/profile';

describe('field dictionary indexed keys', () => {
  it('normalizes any indexed education, work, and project key to its template', () => {
    expect(normalizeDictionaryKey('educations.12.school')).toBe('educations.$.school');
    expect(findDictionaryField('educations.12.school')?.aliases).toContain('学校');
    expect(findDictionaryField('workExperiences.3.department')?.aliases).toContain('部门');
    expect(findDictionaryField('projects.8.achievements')?.aliases).toContain('项目成果');
  });

  it('uses distinct section aliases to disambiguate repeated labels', () => {
    expect(findDictionaryField('educations.0.startDate')?.sectionAliases).toContain('教育经历');
    expect(findDictionaryField('workExperiences.0.startDate')?.sectionAliases).toContain('工作经历');
    expect(findDictionaryField('projects.0.startDate')?.sectionAliases).toContain('项目经历');
  });

  it('matches an indexed field and uses its section to avoid same-label cross matching', () => {
    const profile: Profile = { schemaVersion: 1, fields: {
      'educations.0.startDate': { key: 'educations.0.startDate', label: '入学时间', type: 'date', value: '2020-09', policy: 'auto' },
      'workExperiences.0.startDate': { key: 'workExperiences.0.startDate', label: '开始时间', type: 'date', value: '2024-07', policy: 'auto' },
      'projects.0.startDate': { key: 'projects.0.startDate', label: '开始时间', type: 'date', value: '2023-01', policy: 'auto' },
    } };
    const [match] = matchFields([{
      fieldId: 'start', kind: 'text', label: '开始时间', sectionLabel: '工作经历', options: [], currentValue: null, framePath: [], fingerprint: 'start',
    }], profile, { mappings: [], pageContext: { host: 'example.test', path: '/apply' } });

    expect(match.selected?.profileKey).toBe('workExperiences.0.startDate');
    expect(match.status).toBe('matched');
  });

  it('includes P1 enhanced fields', () => {
    expect(findDictionaryField('educations.0.gpa')).toBeDefined();
    expect(findDictionaryField('workExperiences.0.referencePhone')).toBeDefined();
    expect(findDictionaryField('projects.0.attachmentReference')).toBeDefined();
  });
});
