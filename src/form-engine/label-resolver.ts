import { normalizeLabel } from './normalize-label';

function labelFor(element: HTMLElement): string | undefined {
  const id = element.id;
  if (!id) return undefined;

  const label = Array.from(element.ownerDocument.querySelectorAll('label')).find(
    (candidate) => candidate.htmlFor === id,
  );
  const text = normalizeLabel(label?.textContent);
  return text || undefined;
}

function directLegend(fieldset: HTMLElement): string | undefined {
  const legend = Array.from(fieldset.children).find(
    (child) => child.tagName === 'LEGEND',
  );
  const text = normalizeLabel(legend?.textContent);
  return text || undefined;
}

function directHeading(section: HTMLElement): string | undefined {
  const heading = Array.from(section.children).find((child) => /^H[1-6]$/.test(child.tagName));
  const text = normalizeLabel(heading?.textContent);
  return text || undefined;
}

export function resolveLabel(element: HTMLElement): string {
  const associated = labelFor(element);
  if (associated) return associated;

  const wrapping = normalizeLabel(element.closest('label')?.textContent);
  if (wrapping) return wrapping;

  const ariaLabel = normalizeLabel(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const placeholder = normalizeLabel(element.getAttribute('placeholder'));
  if (placeholder) return placeholder;

  const name = normalizeLabel(element.getAttribute('name'));
  if (name) return name;

  return normalizeLabel(element.id);
}

export function resolveSectionLabel(element: HTMLElement): string | undefined {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === 'FIELDSET') {
      const legend = directLegend(ancestor);
      if (legend) return legend;
    }

    if (ancestor.getAttribute('role') === 'group') {
      const title = normalizeLabel(ancestor.getAttribute('title'));
      if (title) return title;
    }

    if (ancestor.tagName === 'SECTION') {
      const heading = directHeading(ancestor);
      if (heading) return heading;
    }
  }

  return undefined;
}
