import { describe, expect, it } from 'vitest';
import { failureFeedback, fieldPreparationHint } from '../../../src/ui/fill-feedback';
import type { PageFieldDescriptor } from '../../../src/shared/form';

function field(overrides: Partial<PageFieldDescriptor>): PageFieldDescriptor {
  return { fieldId: 'field-1', kind: 'text', label: '测试字段', options: [], currentValue: '', framePath: [], fingerprint: 'test', ...overrides };
}

describe('fill feedback', () => {
  it('turns technical failures into actionable Chinese guidance', () => {
    expect(failureFeedback('date input requires a valid YYYY-MM-DD value')).toMatchObject({ title: '日期格式无法写入', category: 'format' });
    expect(failureFeedback('combobox has no exact option match')).toMatchObject({ title: '没有找到完全一致的选项', category: 'option' });
    expect(failureFeedback('field is unavailable')).toMatchObject({ title: '页面字段已变化或暂不可用', category: 'page' });
    expect(failureFeedback('current value does not match expected value')).toMatchObject({ title: '页面没有保留写入结果', category: 'verification' });
  });

  it('explains controls that need strict values before filling', () => {
    expect(fieldPreparationHint(field({ inputType: 'date' }))).toContain('YYYY-MM-DD');
    expect(fieldPreparationHint(field({ inputType: 'month' }))).toContain('YYYY-MM');
    expect(fieldPreparationHint(field({ kind: 'select' }))).toContain('完全一致');
    expect(fieldPreparationHint(field({ kind: 'combobox' }))).toContain('唯一');
    expect(fieldPreparationHint(field({ kind: 'text' }))).toBeUndefined();
  });
});
