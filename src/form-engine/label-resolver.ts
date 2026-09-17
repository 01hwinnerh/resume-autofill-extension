import { normalizeLabel } from './normalize-label';

const COMPONENT_LABEL_SELECTORS = [
  '.semi-form-field-label-text',
  '.semi-form-field-label',
  '[class*="form-item-label"]',
  '[class*="formItemLabel"]',
  '[class*="field-label"]',
  '[data-field-label]',
  'label',
];

function isComponentFieldContainer(element: HTMLElement): boolean {
  if (element.matches('.semi-form-field, [data-field-name], [data-form-field-id], [data-form-field-name]')) return true;
  const tokens = element.className.toString().split(/\s+/).filter(Boolean);
  return tokens.some((token) => {
    const value = token.toLowerCase();
    if (/(?:label|control|children|wrapper|message|help|extra)$/.test(value)) return false;
    return /form[-_]?item|field[-_]?item/.test(value);
  });
}

function cleanLabel(value: string | null | undefined): string | undefined {
  const normalized = normalizeLabel(value).replace(/^[*＊]\s*/, '').replace(/\s*[:：*＊]\s*$/, '').trim();
  return normalized && normalized.length <= 100 ? normalized : undefined;
}

export function composedParentElement(element: HTMLElement): HTMLElement | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.mode === 'open' && root.host instanceof HTMLElement ? root.host : null;
}

function labelText(label: HTMLLabelElement | null | undefined): string | undefined {
  if (!label) return undefined;
  const clone = label.cloneNode(true) as HTMLLabelElement;
  clone.querySelectorAll('input, textarea, select, button, [role="combobox"], [role="listbox"]').forEach((control) => control.remove());
  return cleanLabel(clone.textContent);
}

function labelFor(element: HTMLElement): string | undefined {
  if ('labels' in element) {
    const labels = (element as HTMLInputElement).labels;
    const native = labelText(labels?.[0]);
    if (native) return native;
  }
  const id = element.id;
  if (!id) return undefined;
  const root = element.getRootNode();
  const labels = root instanceof Document || root instanceof ShadowRoot
    ? root.querySelectorAll('label')
    : element.ownerDocument.querySelectorAll('label');
  const label = Array.from(labels).find((candidate) => candidate.htmlFor === id);
  return labelText(label);
}

function ariaLabelledBy(element: HTMLElement): string | undefined {
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  if (!ids.length) return undefined;
  const root = element.getRootNode();
  return cleanLabel(ids.map((id) => {
    if (root instanceof Document || root instanceof ShadowRoot) return root.getElementById(id)?.textContent ?? '';
    return element.ownerDocument.getElementById(id)?.textContent ?? '';
  }).join(' '));
}

function dataLabel(element: HTMLElement): string | undefined {
  for (const attribute of ['data-label', 'data-field-label', 'data-field-name', 'title']) {
    const value = cleanLabel(element.getAttribute(attribute));
    if (value) return value;
  }
  return undefined;
}

function componentLabel(element: HTMLElement): string | undefined {
  for (let container: HTMLElement | null = element.parentElement; container; container = container.parentElement) {
    if (!isComponentFieldContainer(container)) continue;
    for (const selector of COMPONENT_LABEL_SELECTORS) {
      const candidates = Array.from(container.querySelectorAll<HTMLElement>(selector));
      for (const candidate of candidates) {
        if (candidate === element || candidate.contains(element)) continue;
        const value = cleanLabel(candidate.getAttribute('data-field-label') ?? candidate.textContent);
        if (value) return value;
      }
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

function formilyLabel(element: HTMLElement): string | undefined {
  const container = element.closest<HTMLElement>('[data-form-field-i18n-name]');
  if (!container) return undefined;
  const label = cleanLabel(container.getAttribute('data-form-field-i18n-name'));
  if (!label) return undefined;
  if (container.getAttribute('data-form-field-name') !== 'start_end_time') return label;
  const controls = Array.from(container.querySelectorAll<HTMLElement>('input, textarea, select'));
  const index = controls.indexOf(element);
  const section = normalizeLabel(resolveSectionLabel(element));
  const isEducationRange = /(教育|学历|学校|education|academic)/.test(section);
  if (index === 0) return isEducationRange ? '入学时间' : '开始时间';
  if (index === 1) return isEducationRange ? '毕业时间' : '结束时间';
  return label;
}

export function resolveLabel(element: HTMLElement): string {
  const schema = cleanLabel(element.getAttribute('data-resume-autofill-schema-label'));
  if (schema) return schema;
  const formily = formilyLabel(element);
  if (formily) return formily;
  const associated = labelFor(element);
  if (associated) return associated;
  const wrapping = labelText(element.closest('label'));
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

const FORMILY_SECTION_LABELS: Record<string, string> = {
  education_list: '教育经历',
  career_list: '工作经历',
  internship_list: '实习经历',
  project_list: '项目经历',
};

export function resolveSectionLabel(element: HTMLElement): string | undefined {
  const schema = cleanLabel(element.getAttribute('data-resume-autofill-schema-section'));
  if (schema) return schema;
  for (let ancestor = composedParentElement(element); ancestor; ancestor = composedParentElement(ancestor)) {
    const formilySection = FORMILY_SECTION_LABELS[ancestor.id.replace(/^formily-item-/, '')];
    if (formilySection) return formilySection;
    if (ancestor.tagName === 'FIELDSET') {
      const legend = directLegend(ancestor);
      if (legend) return legend;
    }
    if (ancestor.getAttribute('role') === 'group') {
      const labelledBy = ariaLabelledBy(ancestor);
      if (labelledBy) return labelledBy;
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
