import type { PageFieldDescriptor, PageFieldKind } from '../shared/form';
import type { FieldValue } from '../shared/profile';
import { createFingerprint } from './fingerprint';
import { resolveLabel, resolveSectionLabel } from './label-resolver';
import { normalizeLabel } from './normalize-label';
import type { RuntimePageField, ScanContext } from './runtime-types';

const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'button', 'submit', 'reset', 'image', 'file', 'password', 'color', 'range']);
type RepeatCategory = 'education' | 'work' | 'project';

function optionalAttribute(element: HTMLElement, name: string): string | undefined { return element.getAttribute(name) || undefined; }
function isDisabled(element: HTMLElement): boolean { return element.matches(':disabled'); }
function supportedInput(element: HTMLInputElement): boolean { return !isDisabled(element) && !EXCLUDED_INPUT_TYPES.has(element.type.toLowerCase()); }
function optionsFor(select: HTMLSelectElement) { return Array.from(select.options).map((option) => ({ label: resolveLabel(option) || normalizeLabel(option.text), value: option.value })); }
function radioOptions(inputs: HTMLInputElement[]) { return inputs.map((input) => ({ label: resolveLabel(input), value: input.value })); }

function repeatCategory(label: string | undefined): RepeatCategory | undefined {
  const value = normalizeLabel(label);
  if (/教育|学历|education|academic/.test(value)) return 'education';
  if (/工作|实习|职业|work|employment|experience/.test(value)) return 'work';
  if (/项目|project/.test(value)) return 'project';
  return undefined;
}

function sectionContainer(element: HTMLElement): HTMLElement | undefined {
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const isFormilyArrayCard = Array.from(ancestor.classList).some((token) => token.startsWith('apply-form-array-card__'));
    if (isFormilyArrayCard || ancestor.tagName === 'FIELDSET' || ancestor.tagName === 'SECTION' || ancestor.getAttribute('role') === 'group') return ancestor;
  }
  return undefined;
}

function buildSectionIndexes(controls: Element[]): Map<HTMLElement, number> {
  const indexes = new Map<HTMLElement, number>();
  const containers: Record<RepeatCategory, HTMLElement[]> = { education: [], work: [], project: [] };
  for (const control of controls) {
    if (!(control instanceof HTMLElement)) continue;
    const container = sectionContainer(control); const category = repeatCategory(resolveSectionLabel(control));
    if (container && category && !containers[category].includes(container)) containers[category].push(container);
  }
  for (const items of Object.values(containers)) items.forEach((container, index) => indexes.set(container, index));
  return indexes;
}

function formilyContainer(element: HTMLElement): HTMLElement | undefined {
  return element.closest<HTMLElement>('[data-form-field-id], [data-form-field-name]') ?? undefined;
}

function isComboboxControl(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.getAttribute('role') === 'combobox';
}

function comboboxCurrentValue(element: HTMLInputElement): string {
  const ariaValue = element.getAttribute('aria-valuetext');
  if (ariaValue?.trim()) return ariaValue.trim();
  const container = formilyContainer(element) ?? element.parentElement;
  const selected = container?.querySelector<HTMLElement>(
    '[class*="selection-item"], [class*="selectionItem"], [class*="selected-value"], [data-selected-value]',
  );
  return selected?.textContent?.trim() || element.value;
}

function buildField(element: HTMLElement, elements: HTMLElement[], kind: PageFieldKind, currentValue: FieldValue, options: Array<{ label: string; value: string }>, fieldId: string, context: ScanContext, sectionIndexes: Map<HTMLElement, number>): RuntimePageField {
  const formily = formilyContainer(element);
  const label = resolveLabel(element);
  const name = optionalAttribute(element, 'name') ?? optionalAttribute(formily ?? element, 'data-form-field-name');
  const htmlId = element.id || formily?.id || undefined;
  const sectionLabel = resolveSectionLabel(element); const container = sectionContainer(element);
  const annotatedIndex = Number.parseInt(element.getAttribute('data-resume-autofill-section-index') ?? '', 10);
  const sectionIndex = Number.isFinite(annotatedIndex)
    ? annotatedIndex
    : repeatCategory(sectionLabel) && container ? sectionIndexes.get(container) : undefined;
  return {
    fieldId, kind, inputType: element instanceof HTMLInputElement ? element.type.toLowerCase() : undefined,
    label, name, htmlId, placeholder: optionalAttribute(element, 'placeholder'), ariaLabel: optionalAttribute(element, 'aria-label'),
    autocomplete: optionalAttribute(element, 'autocomplete'), options, currentValue, sectionLabel, sectionIndex,
    semanticSource: optionalAttribute(element, 'data-resume-autofill-semantic-source') ?? (formily ? 'formily-dom' : undefined),
    framePath: [...context.framePath],
    // sectionIndex deliberately stays out of the fingerprint to preserve old saved mappings.
    fingerprint: createFingerprint({ kind, label, name, htmlId, sectionLabel, framePath: context.framePath }),
    elements,
  };
}

export function scanDocument(document: Document, context: ScanContext): RuntimePageField[] {
  const fields: RuntimePageField[] = []; const groupedRadios = new Set<string>();
  const controls = Array.from(document.querySelectorAll('input, textarea, select')); const sectionIndexes = buildSectionIndexes(controls);
  for (const control of controls) {
    if (control instanceof HTMLInputElement) {
      if (!supportedInput(control)) continue;
      if (control.type.toLowerCase() === 'radio' && control.name) {
        const container = sectionContainer(control); const groupKey = `${control.name}:${container ? Array.from(document.querySelectorAll('fieldset,section,[role="group"]')).indexOf(container) : -1}`;
        if (groupedRadios.has(groupKey)) continue; groupedRadios.add(groupKey);
        const group = controls.filter((candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement && candidate.type.toLowerCase() === 'radio' && candidate.name === control.name && sectionContainer(candidate) === container && supportedInput(candidate));
        const checked = group.find((option) => option.checked);
        fields.push(buildField(control, group, 'radio', checked?.value ?? null, radioOptions(group), `field-${fields.length + 1}`, context, sectionIndexes)); continue;
      }
      const kind: PageFieldKind = control.type.toLowerCase() === 'checkbox'
        ? 'checkbox'
        : isComboboxControl(control) ? 'combobox' : 'text';
      const currentValue = kind === 'checkbox'
        ? control.checked
        : kind === 'combobox' ? comboboxCurrentValue(control) : control.value;
      fields.push(buildField(control, [control], kind, currentValue, [], `field-${fields.length + 1}`, context, sectionIndexes)); continue;
    }
    if (control instanceof HTMLTextAreaElement && !isDisabled(control)) {
      fields.push(buildField(control, [control], 'textarea', control.value, [], `field-${fields.length + 1}`, context, sectionIndexes)); continue;
    }
    if (control instanceof HTMLSelectElement && !isDisabled(control)) fields.push(buildField(control, [control], 'select', control.value, optionsFor(control), `field-${fields.length + 1}`, context, sectionIndexes));
  }
  return fields;
}

export function toDescriptor(field: RuntimePageField): PageFieldDescriptor { const { elements: _elements, ...descriptor } = field; return descriptor; }
