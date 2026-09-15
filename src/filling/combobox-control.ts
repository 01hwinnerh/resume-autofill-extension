import { normalizeLabel } from '../form-engine/normalize-label';
import { dispatchInputAndChange, setNativeValue } from './native-value';

const OPTION_SELECTOR = [
  '[role="option"]',
  '[data-value]',
  '[class*="select-option"]',
  '[class*="selectOption"]',
].join(',');

function available(element: HTMLElement): boolean {
  return !element.hidden
    && element.getAttribute('aria-hidden') !== 'true'
    && element.style.display !== 'none'
    && element.style.visibility !== 'hidden';
}

function optionValues(element: HTMLElement): string[] {
  return [
    element.getAttribute('data-value'),
    element.getAttribute('aria-label'),
    element.textContent,
  ].map((value) => normalizeLabel(value)).filter(Boolean);
}

function popupRoots(control: HTMLInputElement): ParentNode[] {
  const document = control.ownerDocument;
  const controlledId = control.getAttribute('aria-controls') || control.getAttribute('aria-owns');
  const controlled = controlledId ? document.getElementById(controlledId) : null;
  if (controlled) return [controlled];

  const roots = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="listbox"], [class*="select-dropdown"], [class*="selectDropdown"], [class*="select__dropdown"]',
  )).filter(available);
  return roots.length ? roots : [document];
}

function optionCandidates(control: HTMLInputElement): HTMLElement[] {
  return popupRoots(control)
    .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(OPTION_SELECTOR)))
    .filter(available)
    .filter((option, index, options) => options.indexOf(option) === index);
}

function selectedValue(control: HTMLInputElement): string {
  const ariaValue = control.getAttribute('aria-valuetext');
  if (ariaValue?.trim()) return ariaValue;
  const formItem = control.closest<HTMLElement>('[data-form-field-id], [data-form-field-name]') ?? control.parentElement;
  const selected = formItem?.querySelector<HTMLElement>(
    '[aria-selected="true"], [class*="selection-item"], [class*="selectionItem"], [class*="selected-value"], [data-selected-value]',
  );
  return selected?.getAttribute('data-selected-value')
    || selected?.getAttribute('data-value')
    || selected?.textContent?.trim()
    || control.value;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function exactOption(control: HTMLInputElement, expected: string): Promise<HTMLElement[]> {
  const normalizedExpected = normalizeLabel(expected);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const matches = optionCandidates(control).filter((option) => optionValues(option).includes(normalizedExpected));
    if (matches.length) return matches;
    await wait(50);
  }
  return [];
}

export function readComboboxValue(control: HTMLInputElement): string {
  return selectedValue(control).trim();
}

export async function selectComboboxOption(
  control: HTMLInputElement,
  expected: string,
): Promise<{ selected: boolean; reason?: string }> {
  control.focus();
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  control.click();
  setNativeValue(control, expected);
  dispatchInputAndChange(control);

  const matches = await exactOption(control, expected);
  if (matches.length === 0) return { selected: false, reason: 'combobox has no exact option match' };
  if (matches.length > 1) return { selected: false, reason: 'combobox option match is ambiguous' };

  const option = matches[0];
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option.click();
  await wait(50);

  return normalizeLabel(readComboboxValue(control)) === normalizeLabel(expected)
    ? { selected: true }
    : { selected: false, reason: 'combobox selection could not be verified' };
}
