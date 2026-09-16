import { isInputElement, isSelectElement, isTextareaElement } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { RuntimePageField } from '../form-engine/runtime-types';
import type { FieldValue } from '../shared/profile';

import { selectComboboxOption } from './combobox-control';
import type { FillOptions, FillOutcome } from './fill-types';
import { normalizeValueForControl } from './input-value';
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
    return field.elements.some((element) => isInputElement(element) && element.checked);
  }
  if (field.kind === 'checkbox') {
    return isInputElement(control) && control.checked;
  }
  if (field.kind === 'combobox') {
    return typeof field.currentValue === 'string' && field.currentValue.trim() !== '';
  }
  return (isInputElement(control) || isTextareaElement(control) || isSelectElement(control))
    && control.value.trim() !== '';
}

function fillTextLike(field: RuntimePageField, value: string): FillOutcome {
  const control = firstControl(field);
  if (!control || !(isInputElement(control) || isTextareaElement(control) || isSelectElement(control))) {
    return failed(field.fieldId, 'control is unavailable');
  }
  if (isInputElement(control) && control.type.toLowerCase() === 'file') {
    return failed(field.fieldId, 'file inputs are not supported');
  }
  const normalized = normalizeValueForControl(control, value);
  if (normalized.reason || normalized.value === undefined) return failed(field.fieldId, normalized.reason ?? 'invalid control value');

  setNativeValue(control, normalized.value);
  dispatchInputAndChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillSelect(field: RuntimePageField, value: string): FillOutcome {
  const control = firstControl(field);
  if (!isSelectElement(control)) return failed(field.fieldId, 'control is unavailable');

  const option = Array.from(control.options).find((candidate) => candidate.value === value)
    ?? Array.from(control.options).find((candidate) => normalizeLabel(candidate.text) === normalizeLabel(value));
  if (!option) return failed(field.fieldId, 'no matching option');

  setNativeValue(control, option.value);
  dispatchInputAndChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillRadio(field: RuntimePageField, value: string): FillOutcome {
  const option = field.elements.find((element): element is HTMLInputElement => isInputElement(element)
    && element.type.toLowerCase() === 'radio'
    && element.value === value);
  if (!option) return failed(field.fieldId, 'no matching option');

  setNativeChecked(option, true);
  dispatchChange(option);
  return { status: 'filled', fieldId: field.fieldId };
}

function fillCheckbox(field: RuntimePageField, value: FieldValue): FillOutcome {
  const control = firstControl(field);
  if (!isInputElement(control) || control.type.toLowerCase() !== 'checkbox') {
    return failed(field.fieldId, 'control is unavailable');
  }
  if (typeof value !== 'boolean') return failed(field.fieldId, 'checkbox requires a boolean value');

  setNativeChecked(control, value);
  dispatchChange(control);
  return { status: 'filled', fieldId: field.fieldId };
}

async function fillCombobox(field: RuntimePageField, value: string): Promise<FillOutcome> {
  const control = firstControl(field);
  if (!isInputElement(control)) return failed(field.fieldId, 'combobox input is unavailable');
  const result = await selectComboboxOption(control, value);
  return result.selected
    ? { status: 'filled', fieldId: field.fieldId }
    : failed(field.fieldId, result.reason ?? 'combobox selection failed');
}

export async function fillField(
  field: RuntimePageField,
  value: FieldValue,
  options: FillOptions,
): Promise<FillOutcome> {
  if (!options.confirmed) return failed(field.fieldId, 'fill requires explicit confirmation');
  if (field.manualOnly) return failed(field.fieldId, 'control requires manual interaction');
  if (!options.overwrite && hasExistingValue(field)) {
    return { status: 'skipped_existing', fieldId: field.fieldId };
  }

  if (field.kind === 'checkbox') return fillCheckbox(field, value);
  const normalizedValue = stringValue(value);
  if (normalizedValue === undefined) return failed(field.fieldId, 'control requires a string or number value');
  if (field.kind === 'radio') return fillRadio(field, normalizedValue);
  if (field.kind === 'select') return fillSelect(field, normalizedValue);
  if (field.kind === 'combobox') return fillCombobox(field, normalizedValue);
  return fillTextLike(field, normalizedValue);
}
