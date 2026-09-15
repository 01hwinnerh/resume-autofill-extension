import { describe, expect, it } from 'vitest';
import type { FieldMatch, FieldStatus } from '../../../src/shared/form';
import { defaultSelectedFieldIds, filterFields, toggleVisibleSelection } from '../../../src/ui/field-selection';

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

  it('combines status filtering and search', () => {
    expect(filterFields(fields, 'needs_confirmation', '手机').map((item) => item.descriptor.fieldId)).toEqual(['b']);
    expect(filterFields(fields, 'matched', '手机')).toEqual([]);
  });
});
