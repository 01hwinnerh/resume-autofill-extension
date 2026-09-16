export function isInputElement(element: unknown): element is HTMLInputElement {
  return typeof element === 'object' && element !== null && 'tagName' in element && element.tagName === 'INPUT';
}

export function isTextareaElement(element: unknown): element is HTMLTextAreaElement {
  return typeof element === 'object' && element !== null && 'tagName' in element && element.tagName === 'TEXTAREA';
}

export function isSelectElement(element: unknown): element is HTMLSelectElement {
  return typeof element === 'object' && element !== null && 'tagName' in element && element.tagName === 'SELECT';
}

export function eventFor(element: Element, type: string): Event {
  const EventConstructor = element.ownerDocument.defaultView?.Event ?? Event;
  return new EventConstructor(type, { bubbles: true });
}

export function mouseEventFor(element: Element, type: string): MouseEvent {
  const MouseEventConstructor = element.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
  return new MouseEventConstructor(type, { bubbles: true });
}
