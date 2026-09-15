import { normalizeLabel } from '../form-engine/normalize-label';
import type { PageFieldDescriptor } from '../shared/form';
import type { ProfileField } from '../shared/profile';
import type { DictionaryField } from './field-dictionary';

export const SCORE_WEIGHTS = {
  labelAlias: 0.5,
  autocomplete: 0.2,
  nameOrIdAlias: 0.15,
  sectionLabel: 0.1,
  typeCompatibility: 0.05,
  sectionIndexMatch: 0.25,
  sectionIndexMismatch: -0.35,
} as const;

export interface ScoredField { score: number; reasons: string[] }

function isAlias(value: string | undefined, aliases: string[]): boolean {
  const normalizedValue = normalizeLabel(value);
  return normalizedValue.length > 0 && aliases.some((alias) => normalizeLabel(alias) === normalizedValue);
}

function isCompatible(descriptor: PageFieldDescriptor, profileField: ProfileField): boolean {
  switch (profileField.type) {
    case 'text': return descriptor.kind === 'text' || descriptor.kind === 'textarea';
    case 'date':
    case 'number': return descriptor.kind === 'text';
    case 'enum': return descriptor.kind === 'select' || descriptor.kind === 'radio' || descriptor.kind === 'text';
    case 'boolean': return descriptor.kind === 'checkbox' || descriptor.kind === 'radio' || descriptor.kind === 'select';
    case 'multiselect': return descriptor.kind === 'select';
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
    reasons.push(`页面标签“${descriptor.label}”匹配资料字段“${profileField.label}”`);
  }
  if (isAlias(descriptor.autocomplete, dictionaryField.autocompleteAliases)) {
    score += SCORE_WEIGHTS.autocomplete;
    reasons.push(`autocomplete“${descriptor.autocomplete}”匹配 ${profileField.key}`);
  }
  if (isAlias(descriptor.name, dictionaryField.aliases) || isAlias(descriptor.htmlId, dictionaryField.aliases)) {
    score += SCORE_WEIGHTS.nameOrIdAlias;
    reasons.push(`字段 name 或 id 匹配 ${profileField.key}`);
  }
  if (isAlias(descriptor.sectionLabel, dictionaryField.sectionAliases)) {
    score += SCORE_WEIGHTS.sectionLabel;
    reasons.push(`分组“${descriptor.sectionLabel}”匹配${dictionaryField.sectionAliases[0] ?? '资料'}经历`);
  }
  if (isCompatible(descriptor, profileField)) {
    score += SCORE_WEIGHTS.typeCompatibility;
    reasons.push(`页面控件类型 ${descriptor.kind} 与资料类型 ${profileField.type} 兼容`);
  }
  const indexed = profileField.key.match(/^(educations|workExperiences|projects)\.(\d+)\./);
  if (indexed && descriptor.sectionIndex !== undefined) {
    const profileIndex = Number(indexed[2]);
    if (profileIndex === descriptor.sectionIndex) {
      score += SCORE_WEIGHTS.sectionIndexMatch;
      reasons.push(`页面第 ${descriptor.sectionIndex + 1} 段与资料第 ${profileIndex + 1} 条一致`);
    } else {
      score += SCORE_WEIGHTS.sectionIndexMismatch;
      reasons.push(`页面段落序号与资料第 ${profileIndex + 1} 条不一致`);
    }
  }
  return { score: Number(Math.min(1, Math.max(0, score)).toFixed(2)), reasons };
}
