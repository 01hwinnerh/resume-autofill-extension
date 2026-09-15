import { isInputElement, isSelectElement, isTextareaElement } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { RuntimePageField } from '../form-engine/runtime-types';
import type { FieldValue } from '../shared/profile';

import { selectComboboxOption } from './combobox-control';
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

function validDateValue(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function invalidInputReason(control: HTMLInputElement, value: string): string | undefined {
  const type = control.type.toLowerCase();
  if (type === 'date' && !validDateValue(value)) return 'date input requires a valid YYYY-MM-DD value';
  if (type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return 'month input requires a valid YYYY-MM value';
  if (type === 'number' && (value.trim() === '' || !Number.isFinite(Number(value)))) return 'number input requires a numeric value';
  return undefined;
}

function fillTextLike(field: RuntimePageField, value: string): FillOutcome {
  const control = firstControl(field);
  if (!control || !(isInputElement(control) || isTextareaElement(control) || isSelectElement(control))) {
    return failed(field.fieldId, 'control is unavailable');
  }
  if (isInputElement(control) && control.type.toLowerCase() === 'file') {
    return failed(field.fieldId, 'file inputs are not supported');
  }
  if (isInputElement(control)) {
    const reason = invalidInputReason(control, value);
    if (reason) return failed(field.fieldId, reason);
  }

  setNativeValue(control, value);
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
