import { describe, expect, it } from 'vitest';
import { repeatSectionWarnings } from '../../../src/matching/repeat-section-warnings';
import type { PageFieldDescriptor } from '../../../src/shared/form';
import type { Profile } from '../../../src/shared/profile';

function field(sectionLabel?: string, sectionIndex?: number): PageFieldDescriptor {
  return { fieldId: `field-${sectionIndex ?? 'none'}`, kind: 'text', label: '学校', options: [], currentValue: '', sectionLabel, sectionIndex, framePath: [], fingerprint: 'school' };
}

const profile: Profile = { schemaVersion: 1, fields: {
  'educations.0.school': { key: 'educations.0.school', label: '学校', type: 'text', value: 'A', policy: 'auto' },
  'educations.1.school': { key: 'educations.1.school', label: '学校', type: 'text', value: 'B', policy: 'auto' },
  'educations.2.school': { key: 'educations.2.school', label: '学校', type: 'text', value: null, policy: 'auto' },
} };

describe('repeatSectionWarnings', () => {
  it('warns only when a recognized page section has fewer slots than populated records', () => {
    expect(repeatSectionWarnings([field('教育经历', 0)], profile)).toEqual([expect.objectContaining({
      category: 'education', profileCount: 2, pageCount: 1,
      message: '教育经历资料有 2 段，页面只有 1 段，请手动新增后重新扫描。',
    })]);
  });

  it('does not guess a shortage when section count cannot be recognized', () => {
    expect(repeatSectionWarnings([field(undefined, undefined)], profile)).toEqual([]);
  });
});
