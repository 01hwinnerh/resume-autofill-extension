import { describe, expect, it } from 'vitest';
import { ByteDanceJobsAdapter } from '../../../src/adapters/bytedance-jobs-adapter';
import type { PageFieldDescriptor } from '../../../src/shared/form';

function field(overrides: Partial<PageFieldDescriptor>): PageFieldDescriptor {
  return {
    fieldId: 'field-1', kind: 'text', label: '', options: [], currentValue: '', framePath: [], fingerprint: 'fixture', ...overrides,
  };
}

describe('ByteDanceJobsAdapter', () => {
  const adapter = new ByteDanceJobsAdapter();

  it('matches only the ByteDance application route', () => {
    expect(adapter.matches({ host: 'jobs.bytedance.com', title: '申请', url: 'https://jobs.bytedance.com/campus/resume/123/apply' })).toBe(true);
    expect(adapter.matches({ host: 'jobs.bytedance.com', title: '首页', url: 'https://jobs.bytedance.com/campus/' })).toBe(false);
    expect(adapter.matches({ host: 'example.com', title: '申请', url: 'https://example.com/resume/123/apply' })).toBe(false);
  });

  it('maps basic and indexed education labels to profile keys', () => {
    const hints = adapter.discoverHints([
      field({ fieldId: 'email', label: '电子邮箱' }),
      field({ fieldId: 'school', label: '毕业院校', sectionLabel: '教育经历', sectionIndex: 1 }),
      field({ fieldId: 'degree', label: '学历', sectionIndex: 0 }),
    ]);

    expect(hints).toEqual([
      expect.objectContaining({ fieldId: 'email', profileKey: 'contact.email', score: 0.96 }),
      expect.objectContaining({ fieldId: 'school', profileKey: 'educations.1.school', score: 0.96 }),
      expect.objectContaining({ fieldId: 'degree', profileKey: 'educations.0.degree', score: 0.96 }),
    ]);
  });

  it('does not guess an ambiguous date label without section context', () => {
    expect(adapter.discoverHints([field({ label: '开始时间' })])).toEqual([]);
  });
});
