export function highlightField(element: HTMLElement, durationMs = 1600): void {
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  const previousOutline = element.style.outline;
  const previousOffset = element.style.outlineOffset;
  element.style.outline = '3px solid #1677ff';
  element.style.outlineOffset = '3px';
  globalThis.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOffset;
  }, durationMs);
}
