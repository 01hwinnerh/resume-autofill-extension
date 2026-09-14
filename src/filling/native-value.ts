type ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function nativeSetter<T extends HTMLElement>(element: T, property: 'value' | 'checked'): ((value: string | boolean) => void) | undefined {
  const prototype = property === 'value'
    ? element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;

  return setter as ((value: string | boolean) => void) | undefined;
}

export function setNativeValue(element: ValueControl, value: string): void {
  const setter = nativeSetter(element, 'value');
  if (!setter) throw new Error('native value setter is unavailable');
  setter.call(element, value);
}

export function setNativeChecked(element: HTMLInputElement, checked: boolean): void {
  const setter = nativeSetter(element, 'checked');
  if (!setter) throw new Error('native checked setter is unavailable');
  setter.call(element, checked);
}

export function dispatchInputAndChange(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function dispatchChange(element: HTMLElement): void {
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
