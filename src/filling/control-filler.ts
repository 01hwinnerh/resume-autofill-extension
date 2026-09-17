import { isInputElement, isSelectElement, isTextareaElement } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import type { RuntimePageField } from '../form-engine/runtime-types';
import type { FieldValue } from '../shared/profile';
import { selectComboboxOption } from './combobox-control';
import type { FillOptions, FillOutcome } from './fill-types';
import { normalizeValueForControl } from './input-value';
import { dispatchChange, dispatchInputAndChange, setNativeChecked, setNativeValue } from './native-value';
import { verifyField } from './verify-field';

function failed(fieldId: string, reason: string): FillOutcome { return { status: 'failed', fieldId, reason }; }
function stringValue(value: FieldValue): string | undefined { return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined; }
function firstControl(field: RuntimePageField): HTMLElement | undefined { return field.elements[0]; }
function hasExistingValue(field: RuntimePageField): boolean {
  const control = firstControl(field);
  if (!control) return false;
  if (field.kind === 'radio') return field.elements.some((element) => isInputElement(element) && element.checked);
  if (field.kind === 'checkbox') return isInputElement(control) && control.checked;
  if (field.kind === 'combobox') return typeof field.currentValue === 'string' && field.currentValue.trim() !== '';
  return (isInputElement(control) || isTextareaElement(control) || isSelectElement(control)) && control.value.trim() !== '';
}

async function settleAndVerify(field: RuntimePageField, expected: FieldValue): Promise<FillOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const verification = verifyField(field, expected);
  return verification.verified ? { status: 'filled', fieldId: field.fieldId } : failed(field.fieldId, verification.reason ?? 'field verification failed');
}

async function fillTextLike(field: RuntimePageField, value: string): Promise<FillOutcome> {
  const control = firstControl(field);
  if (!control || !(isInputElement(control) || isTextareaElement(control))) return failed(field.fieldId, 'control is unavailable');
  if (isInputElement(control) && control.type.toLowerCase() === 'file') return failed(field.fieldId, 'file inputs are not supported');
  const normalized = normalizeValueForControl(control, value);
  if (normalized.reason || normalized.value === undefined) return failed(field.fieldId, normalized.reason ?? 'invalid control value');
  const oldValue = control.value;
  control.focus();
  setNativeValue(control, normalized.value);
  dispatchInputAndChange(control);
  control.blur();
  const firstOutcome = await settleAndVerify(field, value);
  if (firstOutcome.status === 'filled') return firstOutcome;

  const retryableTypes = new Set(['text', 'email', 'tel', 'url', 'search', 'password']);
  const retryable = isTextareaElement(control) || (isInputElement(control) && retryableTypes.has(control.type.toLowerCase()));
  if (!retryable || (control.value !== '' && control.value !== oldValue)) return firstOutcome;

  control.focus();
  setNativeValue(control, normalized.value);
  dispatchInputAndChange(control);
  await new Promise((resolve) => setTimeout(resolve, 0));
  control.blur();
  return settleAndVerify(field, value);
}

async function fillSelect(field: RuntimePageField, value: string): Promise<FillOutcome> {
  const control = firstControl(field);
  if (!isSelectElement(control)) return failed(field.fieldId, 'control is unavailable');
  const exactValue = Array.from(control.options).filter((candidate) => candidate.value === value);
  const exactLabel = Array.from(control.options).filter((candidate) => normalizeLabel(candidate.text) === normalizeLabel(value));
  const matches = exactValue.length ? exactValue : exactLabel;
  if (matches.length === 0) return failed(field.fieldId, 'no matching option');
  if (matches.length > 1) return failed(field.fieldId, 'option match is ambiguous');
  control.focus();
  setNativeValue(control, matches[0].value);
  dispatchInputAndChange(control);
  control.blur();
  return settleAndVerify(field, value);
}

async function fillRadio(field: RuntimePageField, value: string): Promise<FillOutcome> {
  const matches = field.elements.filter((element): element is HTMLInputElement => isInputElement(element) && element.type.toLowerCase() === 'radio' && element.value === value);
  if (matches.length !== 1) return failed(field.fieldId, matches.length ? 'radio option match is ambiguous' : 'no matching option');
  matches[0].focus(); setNativeChecked(matches[0], true); dispatchChange(matches[0]); matches[0].blur();
  return settleAndVerify(field, value);
}

async function fillCheckbox(field: RuntimePageField, value: FieldValue): Promise<FillOutcome> {
  const control = firstControl(field);
  if (!isInputElement(control) || control.type.toLowerCase() !== 'checkbox') return failed(field.fieldId, 'control is unavailable');
  if (typeof value !== 'boolean') return failed(field.fieldId, 'checkbox requires a boolean value');
  control.focus(); setNativeChecked(control, value); dispatchChange(control); control.blur();
  return settleAndVerify(field, value);
}

async function fillCombobox(field: RuntimePageField, value: string): Promise<FillOutcome> {
  const control = firstControl(field);
  if (!isInputElement(control)) return failed(field.fieldId, 'combobox input is unavailable');
  const result = await selectComboboxOption(control, value);
  if (!result.selected) return failed(field.fieldId, result.reason ?? 'combobox selection failed');
  return settleAndVerify(field, value);
}

export async function fillField(field: RuntimePageField, value: FieldValue, options: FillOptions): Promise<FillOutcome> {
  if (!options.confirmed) return failed(field.fieldId, 'fill requires explicit confirmation');
  if (field.manualOnly) return failed(field.fieldId, 'control requires manual interaction');
  if (!options.overwrite && hasExistingValue(field)) return { status: 'skipped_existing', fieldId: field.fieldId };
  if (field.kind === 'checkbox') return fillCheckbox(field, value);
  const normalizedValue = stringValue(value);
  if (normalizedValue === undefined) return failed(field.fieldId, 'control requires a string or number value');
  if (field.kind === 'radio') return fillRadio(field, normalizedValue);
  if (field.kind === 'select') return fillSelect(field, normalizedValue);
  if (field.kind === 'combobox') return fillCombobox(field, normalizedValue);
  return fillTextLike(field, normalizedValue);
}
