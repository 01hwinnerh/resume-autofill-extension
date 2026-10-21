import { mouseEventFor } from '../form-engine/control-elements';
import { normalizeLabel } from '../form-engine/normalize-label';
import { dispatchInputAndChange, setNativeValue } from './native-value';

const OPTION_SELECTOR = '[role="option"],[data-value],[class*="select-option"],[class*="selectOption"]';
const POPUP_SELECTOR = '[role="listbox"],[class*="select-dropdown"],[class*="selectDropdown"],[class*="select__dropdown"]';

function available(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current;) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.getAttribute('aria-disabled') === 'true' || current.hasAttribute('inert') || current.matches(':disabled')) return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null);
  }
  return true;
}

function optionValues(element: HTMLElement): string[] {
  return [element.getAttribute('data-value'), element.getAttribute('aria-label'), element.textContent]
    .map((value) => normalizeLabel(value)).filter(Boolean);
}

function visiblePopups(control: HTMLInputElement): HTMLElement[] {
  const roots = new Set<ParentNode>([control.ownerDocument, control.getRootNode() as Document | ShadowRoot]);
  return [...roots].flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(POPUP_SELECTOR))).filter(available);
}

function popupRoots(control: HTMLInputElement, previous: Set<HTMLElement>): ParentNode[] {
  const controlledIds = `${control.getAttribute('aria-controls') ?? ''} ${control.getAttribute('aria-owns') ?? ''}`.trim().split(/\s+/).filter(Boolean);
  if (controlledIds.length) {
    const root = control.getRootNode() as Document | ShadowRoot;
    return controlledIds.map((id) => root.getElementById(id) ?? control.ownerDocument.getElementById(id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement && available(element));
  }
  const opened = visiblePopups(control).filter((root) => !previous.has(root));
  return opened.length === 1 ? opened : [];
}

function optionCandidates(control: HTMLInputElement, previous: Set<HTMLElement>): HTMLElement[] {
  return popupRoots(control, previous).flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>(OPTION_SELECTOR)))
    .filter(available).filter((option, index, options) => options.indexOf(option) === index);
}

function selectedValue(control: HTMLInputElement): string {
  const ariaValue = control.getAttribute('aria-valuetext');
  if (ariaValue?.trim()) return ariaValue;
  const formItem = control.closest<HTMLElement>('[data-form-field-id], [data-form-field-name]') ?? control.parentElement;
  const selected = formItem?.querySelector<HTMLElement>('[aria-selected="true"],[class*="selection-item"],[class*="selectionItem"],[class*="selected-value"],[data-selected-value]');
  return selected?.getAttribute('data-selected-value') || selected?.getAttribute('data-value') || selected?.textContent?.trim() || control.value;
}

function waitForExactOption(control: HTMLInputElement, expected: string, timeoutMs: number, previous: Set<HTMLElement>, signal?: AbortSignal): Promise<HTMLElement[]> {
  const normalizedExpected = normalizeLabel(expected);
  const matches = () => optionCandidates(control, previous).filter((option) => optionValues(option).includes(normalizedExpected));
  const initial = matches();
  if (initial.length) return Promise.resolve(initial);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HTMLElement[]) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const observer = new MutationObserver(() => {
      const result = matches();
      if (result.length) finish(result);
    });
    const timer = setTimeout(() => finish([]), timeoutMs);
    const onAbort = () => finish([]);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) return finish([]);
    observer.observe(control.ownerDocument.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'aria-controls', 'aria-owns', 'aria-disabled', 'class', 'style'] });
    const root = control.getRootNode();
    if (root instanceof ShadowRoot) observer.observe(root, { childList: true, subtree: true, attributes: true });
  });
}

export function readComboboxValue(control: HTMLInputElement): string { return selectedValue(control).trim(); }

export async function selectComboboxOption(
  control: HTMLInputElement,
  expected: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ selected: boolean; reason?: string }> {
  const previousPopups = new Set(visiblePopups(control));
  const originalValue = control.value;
  control.focus();
  control.dispatchEvent(mouseEventFor(control, 'mousedown'));
  control.click();
  setNativeValue(control, expected);
  dispatchInputAndChange(control);

  const matches = await waitForExactOption(control, expected, options.timeoutMs ?? 1500, previousPopups, options.signal);
  const reject = (reason: string) => {
    setNativeValue(control, originalValue);
    dispatchInputAndChange(control);
    control.blur();
    return { selected: false, reason };
  };
  if (options.signal?.aborted) return reject('combobox selection was cancelled');
  if (matches.length === 0) return reject('combobox has no exact option match');
  if (matches.length > 1) return reject('combobox option match is ambiguous');

  matches[0].dispatchEvent(mouseEventFor(matches[0], 'mousedown'));
  matches[0].click();
  control.blur();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return normalizeLabel(readComboboxValue(control)) === normalizeLabel(expected)
    ? { selected: true }
    : reject('combobox selection could not be verified');
}
