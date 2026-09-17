import type { PageFieldDescriptor, PageFieldKind } from '../shared/form';
import type { FieldValue } from '../shared/profile';
import { createFingerprint } from './fingerprint';
import { resolveLabel, resolveSectionLabel } from './label-resolver';
import { normalizeLabel } from './normalize-label';
import type { RuntimePageField, ScanContext } from './runtime-types';
import { isInputElement, isSelectElement, isTextareaElement } from './control-elements';

const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image', 'file', 'password', 'color', 'range']);
type RepeatCategory = 'education' | 'work' | 'project';
interface SectionInfo { index: number; label?: string; semanticSource?: string }

function optionalAttribute(element: HTMLElement, name: string): string | undefined { return element.getAttribute(name) || undefined; }
function isDisabled(element: HTMLElement): boolean { return element.matches(':disabled'); }
function isHidden(element: HTMLElement): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return true;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}
function supportedInput(element: HTMLInputElement): boolean { return !isDisabled(element) && !isHidden(element) && !EXCLUDED_INPUT_TYPES.has(element.type.toLowerCase()); }
function optionsFor(select: HTMLSelectElement) { return Array.from(select.options).map((option) => ({ label: resolveLabel(option) || normalizeLabel(option.text), value: option.value })); }
function radioOptions(inputs: HTMLInputElement[]) { return inputs.map((input) => ({ label: resolveLabel(input), value: input.value })); }

function repeatCategory(label: string | undefined): RepeatCategory | undefined {
  const value = normalizeLabel(label);
  if (/教育|学历|education|academic/.test(value)) return 'education';
  if (/工作|实习|职业|work|employment|experience/.test(value)) return 'work';
  if (/项目|project/.test(value)) return 'project';
  return undefined;
}

function directSemanticLabel(container: HTMLElement): string | undefined {
  const metadata = ['aria-label', 'title', 'data-label']
    .map((name) => container.getAttribute(name)?.trim()).find(Boolean);
  const heading = Array.from(container.children).find((child) => child.tagName === 'LEGEND' || /^H[1-6]$/.test(child.tagName));
  const value = heading?.textContent?.trim() || metadata;
  return value && value.length <= 100 ? normalizeLabel(value) : undefined;
}

function categoryEvidence(element: HTMLElement): RepeatCategory | undefined {
  const resolved = repeatCategory(resolveSectionLabel(element));
  if (resolved) return resolved;
  for (let ancestor: HTMLElement | null = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const evidence = [ancestor.id, ancestor.className.toString(), directSemanticLabel(ancestor), ancestor.getAttribute('data-testid'), ancestor.getAttribute('data-automation-id')].filter(Boolean).join(' ');
    const category = repeatCategory(evidence);
    if (category) return category;
  }
  return undefined;
}

function controlSignature(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('input, textarea, select'))
    .map((control) => normalizeLabel(control.getAttribute('name') || control.getAttribute('data-field-name') || resolveLabel(control)).replace(/\d+/g, '$'))
    .filter(Boolean);
}

function hasRepeatedSiblingStructure(container: HTMLElement): boolean {
  const signature = controlSignature(container);
  if (signature.length < 2 || !container.parentElement) return false;
  return Array.from(container.parentElement.children).some((sibling) => {
    if (!(sibling instanceof HTMLElement) || sibling === container || sibling.tagName !== 'DIV') return false;
    const siblingSignature = controlSignature(sibling);
    if (siblingSignature.length < 2) return false;
    const overlap = signature.filter((item) => siblingSignature.includes(item)).length;
    const classesMatch = container.className && container.className === sibling.className;
    return overlap >= Math.min(2, signature.length) && (classesMatch || overlap === signature.length);
  });
}

function hasItemEvidence(container: HTMLElement): boolean {
  if (container.querySelectorAll('input, textarea, select').length < 2) return false;
  const hasIndex = Array.from(container.attributes).some((attribute) => /(?:^|[-_:])index$/i.test(attribute.name) && attribute.value.trim() !== '');
  const hasDelete = Array.from(container.querySelectorAll<HTMLElement>('button, [role="button"]')).some((button) => /删除|移除|delete|remove/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''} ${button.getAttribute('title') ?? ''}`));
  // data-testid/data-automation-id may contribute category semantics, but are not structural proof of repetition.
  return hasIndex || hasDelete || hasRepeatedSiblingStructure(container);
}

function divRepeatContainer(element: HTMLElement): HTMLElement | undefined {
  if (!categoryEvidence(element)) return undefined;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === 'DIV' && hasItemEvidence(ancestor)) return ancestor;
  }
  return undefined;
}

function sectionContainer(element: HTMLElement): HTMLElement | undefined {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const isFormilyArrayCard = Array.from(ancestor.classList).some((token) => token.startsWith('apply-form-array-card__'));
    if (isFormilyArrayCard || ancestor.tagName === 'FIELDSET' || ancestor.getAttribute('role') === 'group') return ancestor;
  }
  const divContainer = divRepeatContainer(element);
  if (divContainer) return divContainer;
  return element.closest<HTMLElement>('section') ?? undefined;
}

function buildSectionInfo(controls: Element[]): Map<HTMLElement, SectionInfo> {
  const info = new Map<HTMLElement, SectionInfo>();
  const containers: Record<RepeatCategory, HTMLElement[]> = { education: [], work: [], project: [] };
  for (const control of controls) {
    if (!(control instanceof HTMLElement)) continue;
    const container = sectionContainer(control); const category = categoryEvidence(control);
    if (container && category && !containers[category].includes(container)) containers[category].push(container);
  }
  for (const [category, items] of Object.entries(containers) as Array<[RepeatCategory, HTMLElement[]]>) {
    items.sort((left, right) => left === right ? 0 : left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    items.forEach((container, index) => {
      const label = directSemanticLabel(container);
      const isFormilyArrayCard = Array.from(container.classList).some((token) => token.startsWith('apply-form-array-card__'));
      info.set(container, {
        index,
        label,
        semanticSource: isFormilyArrayCard ? undefined : `${container.tagName === 'DIV' ? 'div-repeat' : 'repeat'}:${category}${label ? `:${label}` : ''}`,
      });
    });
  }
  return info;
}

function formilyContainer(element: HTMLElement): HTMLElement | undefined {
  return element.closest<HTMLElement>('[data-form-field-id], [data-form-field-name]') ?? undefined;
}

function isComboboxControl(element: HTMLElement): element is HTMLInputElement {
  return isInputElement(element) && element.getAttribute('role') === 'combobox';
}

function comboboxCurrentValue(element: HTMLInputElement): string {
  const ariaValue = element.getAttribute('aria-valuetext');
  if (ariaValue?.trim()) return ariaValue.trim();
  const container = formilyContainer(element) ?? element.parentElement;
  const selected = container?.querySelector<HTMLElement>('[class*="selection-item"], [class*="selectionItem"], [class*="selected-value"], [data-selected-value]');
  return selected?.textContent?.trim() || element.value;
}

function buildField(element: HTMLElement, elements: HTMLElement[], kind: PageFieldKind, currentValue: FieldValue, options: Array<{ label: string; value: string }>, fieldId: string, context: ScanContext, sectionInfo: Map<HTMLElement, SectionInfo>): RuntimePageField {
  const formily = formilyContainer(element);
  const label = resolveLabel(element);
  const name = optionalAttribute(element, 'name') ?? optionalAttribute(formily ?? element, 'data-form-field-name');
  const htmlId = element.id || formily?.id || undefined;
  const resolvedSectionLabel = resolveSectionLabel(element); const container = sectionContainer(element); const info = container ? sectionInfo.get(container) : undefined;
  const sectionLabel = info?.label && repeatCategory(resolvedSectionLabel) ? info.label : resolvedSectionLabel;
  const annotatedIndex = Number.parseInt(element.getAttribute('data-resume-autofill-section-index') ?? '', 10);
  const sectionIndex = Number.isFinite(annotatedIndex) ? annotatedIndex : info?.index;
  return {
    fieldId, kind, inputType: isInputElement(element) ? element.type.toLowerCase() : undefined,
    label, name, htmlId, placeholder: optionalAttribute(element, 'placeholder'), ariaLabel: optionalAttribute(element, 'aria-label'),
    autocomplete: optionalAttribute(element, 'autocomplete'), options, currentValue, sectionLabel, sectionIndex,
    semanticSource: optionalAttribute(element, 'data-resume-autofill-semantic-source') ?? info?.semanticSource ?? (formily ? 'formily-dom' : undefined),
    framePath: [...context.framePath],
    // sectionIndex deliberately stays out of the fingerprint to preserve old saved mappings.
    fingerprint: createFingerprint({ kind, label, name, htmlId, sectionLabel: resolvedSectionLabel, framePath: context.framePath }),
    elements,
  };
}

export function scanDocument(document: Document, context: ScanContext): RuntimePageField[] {
  const fields: RuntimePageField[] = []; const groupedRadios = new Set<string>();
  const controls = Array.from(document.querySelectorAll('input, textarea, select')); const sectionInfo = buildSectionInfo(controls);
  for (const control of controls) {
    if (isInputElement(control)) {
      if (!supportedInput(control)) continue;
      if (control.type.toLowerCase() === 'radio' && control.name) {
        const container = sectionContainer(control); const groupKey = `${control.name}:${container ? Array.from(sectionInfo.keys()).indexOf(container) : -1}`;
        if (groupedRadios.has(groupKey)) continue; groupedRadios.add(groupKey);
        const group = controls.filter((candidate): candidate is HTMLInputElement => isInputElement(candidate) && candidate.type.toLowerCase() === 'radio' && candidate.name === control.name && sectionContainer(candidate) === container && supportedInput(candidate));
        const checked = group.find((option) => option.checked);
        fields.push(buildField(control, group, 'radio', checked?.value ?? null, radioOptions(group), `field-${fields.length + 1}`, context, sectionInfo)); continue;
      }
      const kind: PageFieldKind = control.type.toLowerCase() === 'checkbox' ? 'checkbox' : isComboboxControl(control) ? 'combobox' : 'text';
      const currentValue = kind === 'checkbox' ? control.checked : kind === 'combobox' ? comboboxCurrentValue(control) : control.value;
      fields.push(buildField(control, [control], kind, currentValue, [], `field-${fields.length + 1}`, context, sectionInfo)); continue;
    }
    if (isTextareaElement(control) && !isDisabled(control) && !isHidden(control)) {
      fields.push(buildField(control, [control], 'textarea', control.value, [], `field-${fields.length + 1}`, context, sectionInfo)); continue;
    }
    if (isSelectElement(control) && !isDisabled(control) && !isHidden(control)) fields.push(buildField(control, [control], 'select', control.value, optionsFor(control), `field-${fields.length + 1}`, context, sectionInfo));
  }
  return fields;
}

export function toDescriptor(field: RuntimePageField): PageFieldDescriptor { const { elements: _elements, ...descriptor } = field; return descriptor; }
