import type { RuntimePageField } from '../form-engine/runtime-types';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { FieldValue } from '../shared/profile';

import type { FillOptions, FillOutcome } from './fill-types';
import {
  dispatchChange,
  dispatchInputAndChange,
  setNativeChecked,
  setNativeValue,
} from './native-value';

function failed(fieldId: string, reason: string): FillOutcome {
  return { status: 'failed', fieldId, reason };
}

function stringValue(value: FieldValue): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function firstControl(field: RuntimePageField): HTMLElement | undefined {
  return field.elements[0];
}

function hasExistingValue(field: RuntimePageField): boolean {
  const control = firstControl(field);
  if (!control) return false;

  if (field.kind === 'radio') {
    return field.elements.some((element) => element instanceof HTMLInputElement && element.checked);
  }
  if (field.kind === 'checkbox') {
    return control instanceof HTMLInputElement && control.checked;
  }
  return (control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLSelectElement) && control.value.trim() !== '';
}

function fillTextLike(field: RuntimePageField, value: string): FillOutcome {
  const control = firstControl(field);
  if (!(control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLSelectElement)) {
    return failed(field.fieldId, 'control is unavailable');
  }
  if (control instanceof HTMLInputElement && control.type.toLowerCase() === 'file') {
    return failed(field.fieldId, 'file inputs are not supported');
  }

  setNativeValue(control, value);
  dispatchInputAndChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillSelect(field: RuntimePageField, value: string): FillOutcome {
  const control = firstControl(field);
  if (!(control instanceof HTMLSelectElement)) return failed(field.fieldId, 'control is unavailable');

  const option = Array.from(control.options).find((candidate) => candidate.value === value)
    ?? Array.from(control.options).find((candidate) => normalizeLabel(candidate.text) === normalizeLabel(value));
  if (!option) return failed(field.fieldId, 'no matching option');

  setNativeValue(control, option.value);
  dispatchInputAndChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillRadio(field: RuntimePageField, value: string): FillOutcome {
  const option = field.elements.find((element): element is HTMLInputElement => element instanceof HTMLInputElement
    && element.type.toLowerCase() === 'radio'
    && element.value === value);
  if (!option) return failed(field.fieldId, 'no matching option');

  setNativeChecked(option, true);
  dispatchChange(option);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillCheckbox(field: RuntimePageField, value: FieldValue): FillOutcome {
  const control = firstControl(field);
  if (!(control instanceof HTMLInputElement) || control.type.toLowerCase() !== 'checkbox') {
    return failed(field.fieldId, 'control is unavailable');
  }
  if (typeof value !== 'boolean') return failed(field.fieldId, 'checkbox requires a boolean value');

  setNativeChecked(control, value);
  dispatchChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

export async function fillField(
  field: RuntimePageField,
  value: FieldValue,
  options: FillOptions,
): Promise<FillOutcome> {
  if (!options.confirmed) return failed(field.fieldId, 'fill requires explicit confirmation');
  if (!options.overwrite && hasExistingValue(field)) {
    return { status: 'skipped_existing', fieldId: field.fieldId };
  }

  if (field.kind === 'checkbox') return fillCheckbox(field, value);
  const normalizedValue = stringValue(value);
  if (normalizedValue === undefined) return failed(field.fieldId, 'control requires a string or number value');
  if (field.kind === 'radio') return fillRadio(field, normalizedValue);
  if (field.kind === 'select') return fillSelect(field, normalizedValue);
  return fillTextLike(field, normalizedValue);
}
