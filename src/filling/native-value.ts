import { eventFor, isInputElement, isTextareaElement } from '../form-engine/control-elements';

type ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function nativeSetter<T extends HTMLElement>(element: T, property: 'value' | 'checked'): ((value: string | boolean) => void) | undefined {
  const view = element.ownerDocument.defaultView;
  const prototype = property === 'checked'
    ? view?.HTMLInputElement.prototype
    : isInputElement(element)
      ? view?.HTMLInputElement.prototype
      : isTextareaElement(element)
        ? view?.HTMLTextAreaElement.prototype
        : view?.HTMLSelectElement.prototype;
  const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, property)?.set : undefined;

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
  element.dispatchEvent(eventFor(element, 'input'));
  element.dispatchEvent(eventFor(element, 'change'));
}

export function dispatchChange(element: HTMLElement): void {
  element.dispatchEvent(eventFor(element, 'change'));
}
