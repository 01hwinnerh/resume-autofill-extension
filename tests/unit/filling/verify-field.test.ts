import { describe, expect, it } from 'vitest';

import { verifyField } from '../../../src/filling/verify-field';
import type { RuntimePageField } from '../../../src/form-engine/runtime-types';
import type { PageFieldKind } from '../../../src/shared/form';

function fieldFor(markup: string, kind: PageFieldKind): RuntimePageField {
  document.body.innerHTML = markup;

  return {
    fieldId: 'field-1',
    kind,
    label: 'Test field',
    options: [],
    currentValue: null,
    framePath: [],
    fingerprint: 'test-field',
    elements: Array.from(document.querySelectorAll('input, textarea, select')) as HTMLElement[],
  };
}

describe('verifyField', () => {
  it.each([
    ['text input', '<input value="  Lin  ">', 'text'],
    ['textarea', '<textarea>  Lin  </textarea>', 'textarea'],
    ['select', '<select><option value="">Choose</option><option value="Lin" selected>Lin</option></select>', 'select'],
  ] as const)('verifies normalized string values for %s', (_name, markup, kind) => {
    expect(verifyField(fieldFor(markup, kind), 'lin')).toEqual({
      fieldId: 'field-1',
      verified: true,
    });
  });

  it('verifies the checked radio option across all group elements', () => {
    const field = fieldFor('<input type="radio" name="mode" value="remote"><input type="radio" name="mode" value="office" checked>', 'radio');

    expect(verifyField(field, 'office')).toEqual({ fieldId: 'field-1', verified: true });
  });

  it('verifies checkbox booleans', () => {
    expect(verifyField(fieldFor('<input type="checkbox" checked>', 'checkbox'), true)).toEqual({
      fieldId: 'field-1',
      verified: true,
    });
  });

  it('returns an independent field-level failure when the current value differs', () => {
    expect(verifyField(fieldFor('<input value="Lin">', 'text'), 'Chen')).toEqual({
      fieldId: 'field-1',
      verified: false,
      reason: 'current value does not match expected value',
    });
  });

  it('rejects a matching value when HTML validity fails after blur', () => {
    const result = verifyField(fieldFor('<input type="email" value="not-an-email">', 'text'), 'not-an-email');
    expect(result).toMatchObject({ fieldId: 'field-1', verified: false });
    expect(result.reason).toBeTruthy();
  });
});
