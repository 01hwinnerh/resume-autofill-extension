import { isInputElement, isSelectElement, isTextareaElement } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { RuntimePageField } from '../form-engine/runtime-types';
import type { FieldValue } from '../shared/profile';

import { readComboboxValue } from './combobox-control';
import type { VerificationOutcome } from './fill-types';
import { normalizeValueForControl } from './input-value';

function mismatch(fieldId: string, reason = 'current value does not match expected value'): VerificationOutcome {
  return { fieldId, verified: false, reason };
}

function stringValue(value: FieldValue): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function visible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

function validationError(control: HTMLElement): string | undefined {
  if ('checkValidity' in control && typeof control.checkValidity === 'function' && !control.checkValidity()) {
    return (control as HTMLInputElement).validationMessage || 'field failed HTML validation';
  }
  if (control.getAttribute('aria-invalid') === 'true') return 'field is marked invalid after blur';
  const described = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    .map((id) => control.ownerDocument.getElementById(id))
    .find((item): item is HTMLElement => Boolean(item && visible(item) && normalizeLabel(item.textContent)));
  if (described && /error|错误|无效|必填|invalid|required/i.test(`${described.id} ${described.className} ${described.textContent}`)) {
    return described.textContent?.trim() || 'visible validation error';
  }
  return undefined;
}

export function verifyField(field: RuntimePageField, expected: FieldValue): VerificationOutcome {
  const control = field.elements[0];
  if (control) {
    const error = validationError(control);
    if (error) return mismatch(field.fieldId, error);
  }

  if (field.kind === 'radio') {
    const expectedValue = stringValue(expected);
    const checked = field.elements.find((element): element is HTMLInputElement => isInputElement(element)
      && element.type.toLowerCase() === 'radio' && element.checked);
    return expectedValue !== undefined && checked && normalizeLabel(checked.value) === normalizeLabel(expectedValue)
      ? { fieldId: field.fieldId, verified: true }
      : mismatch(field.fieldId);
  }
  if (field.kind === 'checkbox') {
    return isInputElement(control) && typeof expected === 'boolean' && control.checked === expected
      ? { fieldId: field.fieldId, verified: true }
      : mismatch(field.fieldId);
  }

  const expectedValue = stringValue(expected);
  if (field.kind === 'select') {
    if (!isSelectElement(control) || expectedValue === undefined) return mismatch(field.fieldId);
    const selected = control.selectedOptions[0];
    return normalizeLabel(control.value) === normalizeLabel(expectedValue)
      || Boolean(selected && normalizeLabel(selected.text) === normalizeLabel(expectedValue))
      ? { fieldId: field.fieldId, verified: true }
      : mismatch(field.fieldId);
  }
  if (field.kind === 'combobox') {
    return isInputElement(control) && expectedValue !== undefined
      && normalizeLabel(readComboboxValue(control)) === normalizeLabel(expectedValue)
      ? { fieldId: field.fieldId, verified: true }
      : mismatch(field.fieldId);
  }
  if (!(isInputElement(control) || isTextareaElement(control)) || expectedValue === undefined) return mismatch(field.fieldId);
  const normalizedExpected = normalizeValueForControl(control, expectedValue);
  return !normalizedExpected.reason && normalizedExpected.value !== undefined
    && normalizeLabel(control.value) === normalizeLabel(normalizedExpected.value)
    ? { fieldId: field.fieldId, verified: true }
    : mismatch(field.fieldId);
}
