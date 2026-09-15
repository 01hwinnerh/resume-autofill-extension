import type { RuntimePageField } from '../form-engine/runtime-types';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { FieldValue } from '../shared/profile';

import type { VerificationOutcome } from './fill-types';
import { readComboboxValue } from './combobox-control';

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
  if (field.kind === 'select') {
    if (!(control instanceof HTMLSelectElement) || expectedValue === undefined) return mismatch(field.fieldId);
    const selected = control.selectedOptions[0];
    if (normalizeLabel(control.value) !== normalizeLabel(expectedValue)
      && (!selected || normalizeLabel(selected.text) !== normalizeLabel(expectedValue))) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }
  if (field.kind === 'combobox') {
    if (!(control instanceof HTMLInputElement)
      || expectedValue === undefined
      || normalizeLabel(readComboboxValue(control)) !== normalizeLabel(expectedValue)) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  if (!(control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement)
    || expectedValue === undefined
    || normalizeLabel(control.value) !== normalizeLabel(expectedValue)) {
    return mismatch(field.fieldId);
  }
  return { fieldId: field.fieldId, verified: true };
}
