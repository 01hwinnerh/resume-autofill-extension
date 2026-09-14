import { normalizeLabel } from '../form-engine/normalize-label';
import type { PageFieldDescriptor } from '../shared/form';
import type { ProfileField } from '../shared/profile';
import type { DictionaryField } from './field-dictionary';

export const SCORE_WEIGHTS = {
  labelAlias: 0.55,
  autocomplete: 0.20,
  nameOrIdAlias: 0.15,
  sectionLabel: 0.05,
  typeCompatibility: 0.05,
} as const;

export interface ScoredField {
  score: number;
  reasons: string[];
}

function isAlias(value: string | undefined, aliases: string[]): boolean {
  const normalizedValue = normalizeLabel(value);
  return normalizedValue.length > 0 && aliases.some((alias) => normalizeLabel(alias) === normalizedValue);
}

function isCompatible(descriptor: PageFieldDescriptor, profileField: ProfileField): boolean {
  switch (profileField.type) {
    case 'text':
      return descriptor.kind === 'text' || descriptor.kind === 'textarea';
    case 'date':
    case 'number':
      return descriptor.kind === 'text';
    case 'enum':
      return descriptor.kind === 'select' || descriptor.kind === 'radio';
    case 'boolean':
      return descriptor.kind === 'checkbox';
    case 'multiselect':
      return descriptor.kind === 'select';
  }
}

export function scoreField(
  descriptor: PageFieldDescriptor,
  profileField: ProfileField,
  dictionaryField: DictionaryField,
): ScoredField {
  let score = 0;
  const reasons: string[] = [];

  if (isAlias(descriptor.label, dictionaryField.aliases)) {
    score += SCORE_WEIGHTS.labelAlias;
    reasons.push(`Label "${descriptor.label}" matches a ${profileField.key} alias.`);
  }

  if (isAlias(descriptor.autocomplete, dictionaryField.autocompleteAliases)) {
    score += SCORE_WEIGHTS.autocomplete;
    reasons.push(`Autocomplete "${descriptor.autocomplete}" matches ${profileField.key}.`);
  }

  if (isAlias(descriptor.name, dictionaryField.aliases) || isAlias(descriptor.htmlId, dictionaryField.aliases)) {
    score += SCORE_WEIGHTS.nameOrIdAlias;
    reasons.push(`Field name or ID matches a ${profileField.key} alias.`);
  }

  if (isAlias(descriptor.sectionLabel, dictionaryField.aliases)) {
    score += SCORE_WEIGHTS.sectionLabel;
    reasons.push(`Section "${descriptor.sectionLabel}" matches a ${profileField.key} alias.`);
  }

  if (isCompatible(descriptor, profileField)) {
    score += SCORE_WEIGHTS.typeCompatibility;
    reasons.push(`Page field type ${descriptor.kind} is compatible with profile type ${profileField.type}.`);
  }

  return { score: Number(Math.min(1, Math.max(0, score)).toFixed(2)), reasons };
}
