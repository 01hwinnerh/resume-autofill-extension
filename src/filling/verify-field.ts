import { isInputElement, isSelectElement, isTextareaElement } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { RuntimePageField } from '../form-engine/runtime-types';
import type { FieldValue } from '../shared/profile';

import { readComboboxValue } from './combobox-control';
import type { VerificationOutcome } from './fill-types';
import { normalizeValueForControl } from './input-value';

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
    const checked = field.elements.find((element): element is HTMLInputElement => isInputElement(element)
      && element.type.toLowerCase() === 'radio'
      && element.checked);
    if (expectedValue === undefined || !checked || normalizeLabel(checked.value) !== normalizeLabel(expectedValue)) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  const control = field.elements[0];
  if (field.kind === 'checkbox') {
    if (!isInputElement(control) || typeof expected !== 'boolean' || control.checked !== expected) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  const expectedValue = stringValue(expected);
  if (field.kind === 'select') {
    if (!isSelectElement(control) || expectedValue === undefined) return mismatch(field.fieldId);
    const selected = control.selectedOptions[0];
    if (normalizeLabel(control.value) !== normalizeLabel(expectedValue)
      && (!selected || normalizeLabel(selected.text) !== normalizeLabel(expectedValue))) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }
  if (field.kind === 'combobox') {
    if (!isInputElement(control)
      || expectedValue === undefined
      || normalizeLabel(readComboboxValue(control)) !== normalizeLabel(expectedValue)) {
      return mismatch(field.fieldId);
    }
    return { fieldId: field.fieldId, verified: true };
  }

  if (!(isInputElement(control) || isTextareaElement(control)) || expectedValue === undefined) {
    return mismatch(field.fieldId);
  }
  const normalizedExpected = normalizeValueForControl(control, expectedValue);
  if (normalizedExpected.reason
    || normalizedExpected.value === undefined
    || normalizeLabel(control.value) !== normalizeLabel(normalizedExpected.value)) {
    return mismatch(field.fieldId);
  }
  return { fieldId: field.fieldId, verified: true };
}
