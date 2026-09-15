import type { PageFieldDescriptor, PageFieldKind } from '../shared/form';
import type { FieldValue } from '../shared/profile';

import { createFingerprint } from './fingerprint';
import { resolveLabel, resolveSectionLabel } from './label-resolver';
import { normalizeLabel } from './normalize-label';
import type { RuntimePageField, ScanContext } from './runtime-types';

const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'button', 'submit', 'reset', 'image', 'file', 'password', 'color', 'range',
]);

function optionalAttribute(element: HTMLElement, name: string): string | undefined {
  return element.getAttribute(name) || undefined;
}

function isDisabled(element: HTMLElement): boolean {
  return element.matches(':disabled');
}

function supportedInput(element: HTMLInputElement): boolean {
  return !isDisabled(element) && !EXCLUDED_INPUT_TYPES.has(element.type.toLowerCase());
}

function optionsFor(select: HTMLSelectElement): Array<{ label: string; value: string }> {
  return Array.from(select.options).map((option) => ({
    label: resolveLabel(option) || normalizeLabel(option.text),
    value: option.value,
  }));
}

function radioOptions(inputs: HTMLInputElement[]): Array<{ label: string; value: string }> {
  return inputs.map((input) => ({ label: resolveLabel(input), value: input.value }));
}

function buildField(
  element: HTMLElement,
  elements: HTMLElement[],
  kind: PageFieldKind,
  currentValue: FieldValue,
  options: Array<{ label: string; value: string }>,
  fieldId: string,
  context: ScanContext,
): RuntimePageField {
  const label = resolveLabel(element);
  const name = optionalAttribute(element, 'name');
  const htmlId = element.id || undefined;
  const sectionLabel = resolveSectionLabel(element);

  return {
    fieldId,
    kind,
    inputType: element instanceof HTMLInputElement ? element.type.toLowerCase() : undefined,
    label,
    name,
    htmlId,
    placeholder: optionalAttribute(element, 'placeholder'),
    ariaLabel: optionalAttribute(element, 'aria-label'),
    autocomplete: optionalAttribute(element, 'autocomplete'),
    options,
    currentValue,
    sectionLabel,
    framePath: [...context.framePath],
    fingerprint: createFingerprint({
      kind,
      label,
      name,
      htmlId,
      sectionLabel,
      framePath: context.framePath,
    }),
    elements,
  };
}

export function scanDocument(document: Document, context: ScanContext): RuntimePageField[] {
  const fields: RuntimePageField[] = [];
  const groupedRadios = new Set<string>();
  const controls = Array.from(document.querySelectorAll('input, textarea, select'));

  for (const control of controls) {
    if (control instanceof HTMLInputElement) {
      if (!supportedInput(control)) continue;

      if (control.type.toLowerCase() === 'radio' && control.name) {
        if (groupedRadios.has(control.name)) continue;
        groupedRadios.add(control.name);
        const group = controls.filter(
          (candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement
            && candidate.type.toLowerCase() === 'radio'
            && candidate.name === control.name
            && supportedInput(candidate),
        );
        const checked = group.find((option) => option.checked);
        fields.push(buildField(
          control,
          group,
          'radio',
          checked?.value ?? null,
          radioOptions(group),
          `field-${fields.length + 1}`,
          context,
        ));
        continue;
      }

      const kind: PageFieldKind = control.type.toLowerCase() === 'checkbox' ? 'checkbox' : 'text';
      fields.push(buildField(
        control,
        [control],
        kind,
        kind === 'checkbox' ? control.checked : control.value,
        [],
        `field-${fields.length + 1}`,
        context,
      ));
      continue;
    }

    if (control instanceof HTMLTextAreaElement && !isDisabled(control)) {
      fields.push(buildField(
        control,
        [control],
        'textarea',
        control.value,
        [],
        `field-${fields.length + 1}`,
        context,
      ));
      continue;
    }

    if (control instanceof HTMLSelectElement && !isDisabled(control)) {
      fields.push(buildField(
        control,
        [control],
        'select',
        control.value,
        optionsFor(control),
        `field-${fields.length + 1}`,
        context,
      ));
    }
  }

  return fields;
}

export function toDescriptor(field: RuntimePageField): PageFieldDescriptor {
  const { elements: _elements, ...descriptor } = field;
  return descriptor;
}
