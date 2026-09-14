import type { RuntimePageField } from '../form-engine/runtime-types';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { FieldValue } from '../shared/profile';

import type { VerificationOutcome } from './fill-types';

function mismatch(fieldId: string): VerificationOutcome {
  return {
    fieldId,
    verified: false,
    reason: 'current value does not match expected value',
  };
}

function stringValue(value: FieldValue): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

export function verifyField(field: RuntimePageField, expected: FieldValue): VerificationOutcome {
  if (field.kind === 'radio') {
    const expectedValue = stringValue(expected);
    const checked = field.elements.find((element): element is HTMLInputElement => element instanceof HTMLInputElement
      && element.type.toLowerCase() === 'radio'
      && element.checked);
    if (expectedValue === undefined || !checked || normalizeLabel(checked.value) !== normalizeLabel(expectedValue)) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  const control = field.elements[0];
  if (field.kind === 'checkbox') {
    if (!(control instanceof HTMLInputElement) || typeof expected !== 'boolean' || control.checked !== expected) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  const expectedValue = stringValue(expected);
  if (!(control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLSelectElement)
    || expectedValue === undefined
    || normalizeLabel(control.value) !== normalizeLabel(expectedValue)) {
    return mismatch(field.fieldId);
  }
  return { fieldId: field.fieldId, verified: true };
}
