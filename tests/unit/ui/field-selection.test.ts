import { describe, expect, it } from 'vitest';
import type { FieldMatch, FieldStatus } from '../../../src/shared/form';
import { canQuickFill, defaultSelectedFieldIds, filterFields, previewReasons, selectionRequiresPreview, toggleVisibleSelection } from '../../../src/ui/field-selection';
import type { Profile } from '../../../src/shared/profile';

function match(id: string, status: FieldStatus, label = id): FieldMatch {
  return {
    descriptor: { fieldId: id, kind: 'text', label, options: [], currentValue: null, framePath: [], fingerprint: id },
    candidates: status === 'unsupported' ? [] : [{ profileKey: `profile.${id}`, score: .6, source: 'generic', reasons: [] }],
    selected: status === 'unsupported' ? undefined : { profileKey: `profile.${id}`, score: .6, source: 'generic', reasons: [] },
    status,
  };
}

describe('field selection helpers', () => {
  const fields = [match('a', 'matched', '邮箱'), match('b', 'needs_confirmation', '手机号'), match('c', 'unsupported', '未知'), match('d', 'skipped_existing', '姓名')];

  it('selects matched by default but not confirmation or unavailable fields', () => {
    expect(defaultSelectedFieldIds(fields)).toEqual(['a']);
  });

  it('selects and deselects only selectable fields in the current visible result', () => {
    expect(toggleVisibleSelection(['a'], [fields[1], fields[2]], true)).toEqual(['a', 'b']);
    expect(toggleVisibleSelection(['a', 'b'], [fields[1], fields[2]], false)).toEqual(['a']);
  });

  it('requires preview unless every selected field passes the strict >50% safety policy', () => {
    const profile: Profile = { schemaVersion: 1, fields: {
      'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '候选人', policy: 'auto' },
      'contact.phone': { key: 'contact.phone', label: '电话', type: 'text', value: '100', policy: 'auto' },
    } };
    const safe = match('safe', 'matched'); safe.selected = safe.candidates[0] = { profileKey: 'identity.name', score: .51, source: 'generic', reasons: [] };
    const threshold = match('threshold', 'matched'); threshold.selected = threshold.candidates[0] = { profileKey: 'identity.name', score: .5, source: 'generic', reasons: [] };
    const sensitive = match('sensitive', 'matched'); sensitive.selected = sensitive.candidates[0] = { profileKey: 'contact.phone', score: .9, source: 'generic', reasons: [] };
    expect(canQuickFill(safe, profile)).toBe(true); expect(canQuickFill(threshold, profile)).toBe(false); expect(previewReasons(threshold, profile)).toContain('匹配置信度不高于 50%');
    expect(selectionRequiresPreview([safe, sensitive], ['safe', 'sensitive'], profile)).toBe(true);
    expect(selectionRequiresPreview([safe], ['safe'], profile, ['safe'])).toBe(true);
  });

  it('combines status filtering and search', () => {
    expect(filterFields(fields, 'needs_confirmation', '手机').map((item) => item.descriptor.fieldId)).toEqual(['b']);
    expect(filterFields(fields, 'matched', '手机')).toEqual([]);
  });
});
