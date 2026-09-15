import { normalizeLabel } from './normalize-label';

const COMPONENT_FIELD_CONTAINERS = [
  '.semi-form-field',
  '[class*="form-item"]',
  '[class*="formItem"]',
  '[class*="field-item"]',
  '[data-field-name]',
];

const COMPONENT_LABEL_SELECTORS = [
  '.semi-form-field-label-text',
  '.semi-form-field-label',
  '[class*="form-item-label"]',
  '[class*="formItemLabel"]',
  '[class*="field-label"]',
  '[data-field-label]',
  'label',
];

function cleanLabel(value: string | null | undefined): string | undefined {
  const normalized = normalizeLabel(value).replace(/^[*＊]\s*/, '').replace(/\s*[:：*＊]\s*$/, '').trim();
  return normalized && normalized.length <= 100 ? normalized : undefined;
}

function labelFor(element: HTMLElement): string | undefined {
  if ('labels' in element) {
    const labels = (element as HTMLInputElement).labels;
    const native = cleanLabel(labels?.[0]?.textContent);
    if (native) return native;
  }
  const id = element.id;
  if (!id) return undefined;
  const label = Array.from(element.ownerDocument.querySelectorAll('label')).find((candidate) => candidate.htmlFor === id);
  return cleanLabel(label?.textContent);
}

function ariaLabelledBy(element: HTMLElement): string | undefined {
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  if (!ids.length) return undefined;
  return cleanLabel(ids.map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '').join(' '));
}

function dataLabel(element: HTMLElement): string | undefined {
  for (const attribute of ['data-label', 'data-field-label', 'data-field-name', 'title']) {
    const value = cleanLabel(element.getAttribute(attribute));
    if (value) return value;
  }
  return undefined;
}

function componentLabel(element: HTMLElement): string | undefined {
  const container = element.closest<HTMLElement>(COMPONENT_FIELD_CONTAINERS.join(','));
  if (!container) return undefined;
  for (const selector of COMPONENT_LABEL_SELECTORS) {
    const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector));
    for (const candidate of candidates) {
      if (candidate === element || candidate.contains(element)) continue;
      const value = cleanLabel(candidate.getAttribute('data-field-label') ?? candidate.textContent);
      if (value) return value;
    }
  }
  return undefined;
}

function nearbyLabel(element: HTMLElement): string | undefined {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
    const sibling = current.previousElementSibling;
    if (!(sibling instanceof HTMLElement)) continue;
    const semanticClass = sibling.className.toString().toLowerCase();
    if (!/(label|title|caption)/.test(semanticClass)) continue;
    const value = cleanLabel(sibling.textContent);
    if (value) return value;
  }
  return undefined;
}

function directLegend(fieldset: HTMLElement): string | undefined {
  const legend = Array.from(fieldset.children).find((child) => child.tagName === 'LEGEND');
  return cleanLabel(legend?.textContent);
}

function directHeading(section: HTMLElement): string | undefined {
  const heading = Array.from(section.children).find((child) => /^H[1-6]$/.test(child.tagName));
  return cleanLabel(heading?.textContent);
}

function componentSectionHeading(container: HTMLElement): string | undefined {
  const selectors = ['[class*="section-title"]', '[class*="sectionTitle"]', '[class*="card-title"]', '[class*="cardTitle"]', 'h1', 'h2', 'h3', 'h4'];
  for (const selector of selectors) {
    const heading = container.querySelector<HTMLElement>(`:scope > ${selector}, :scope > * > ${selector}`);
    const value = cleanLabel(heading?.textContent);
    if (value) return value;
  }
  return undefined;
}

export function resolveLabel(element: HTMLElement): string {
  const associated = labelFor(element);
  if (associated) return associated;
  const wrapping = cleanLabel(element.closest('label')?.textContent);
  if (wrapping) return wrapping;
  const labelledBy = ariaLabelledBy(element);
  if (labelledBy) return labelledBy;
  const aria = cleanLabel(element.getAttribute('aria-label'));
  if (aria) return aria;
  const component = componentLabel(element);
  if (component) return component;
  const nearby = nearbyLabel(element);
  if (nearby) return nearby;
  const placeholder = cleanLabel(element.getAttribute('placeholder'));
  if (placeholder) return placeholder;
  const metadata = dataLabel(element);
  if (metadata) return metadata;
  const name = cleanLabel(element.getAttribute('name'));
  if (name) return name;
  return cleanLabel(element.id) ?? '';
}

export function resolveSectionLabel(element: HTMLElement): string | undefined {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === 'FIELDSET') {
      const legend = directLegend(ancestor);
      if (legend) return legend;
    }
    if (ancestor.getAttribute('role') === 'group') {
      const title = cleanLabel(ancestor.getAttribute('title'));
      if (title) return title;
    }
    if (ancestor.tagName === 'SECTION') {
      const heading = directHeading(ancestor);
      if (heading) return heading;
    }
    const classes = ancestor.className.toString().toLowerCase();
    if (/(section|experience|education|project|resume-card|form-card)/.test(classes)) {
      const heading = componentSectionHeading(ancestor);
      if (heading) return heading;
    }
  }
  return undefined;
}
