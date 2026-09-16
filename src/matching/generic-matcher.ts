import type { FieldMatch, MatchCandidate, PageFieldDescriptor } from '../shared/form';
import { normalizeMappingScope, type UserFieldMapping } from '../shared/mapping';
import type { Profile, ProfileField, ProfileFieldType } from '../shared/profile';
import { assignConfidenceStatus } from './confidence';
import { FIELD_DICTIONARY, findDictionaryField } from './field-dictionary';
import { SCORE_WEIGHTS, scoreField } from './score-field';

export interface MatchOptions {
  mappings: UserFieldMapping[];
  pageContext: {
    host: string;
    path: string;
  };
}

function createUserCandidate(profileKey: string): MatchCandidate {
  return {
    profileKey,
    score: 1,
    source: 'user',
    reasons: ['Explicit user mapping for this field fingerprint.'],
  };
}

function hasIdentitySignal(reasons: string[]): boolean {
  return reasons.some((reason) => reason.startsWith('页面标签')
    || reason.startsWith('autocomplete')
    || reason.startsWith('字段 name 或 id'));
}

function genericCandidates(descriptor: PageFieldDescriptor, profile: Profile): MatchCandidate[] {
  return Object.values(profile.fields)
    .flatMap((profileField) => {
      const dictionaryField = findDictionaryField(profileField.key);
      if (!dictionaryField) {
        return [];
      }

      const { score, reasons } = scoreField(descriptor, profileField, dictionaryField);
      return hasIdentitySignal(reasons) && score > SCORE_WEIGHTS.typeCompatibility
        ? [{ profileKey: profileField.key, score, source: 'generic' as const, reasons }]
        : [];
    })
    .sort((left, right) => right.score - left.score);
}

function inferredProfileType(descriptor: PageFieldDescriptor): ProfileFieldType {
  if (descriptor.kind === 'checkbox') return 'boolean';
  if (descriptor.kind === 'select' || descriptor.kind === 'radio' || descriptor.kind === 'combobox') return 'enum';
  if (descriptor.inputType === 'date' || descriptor.inputType === 'month') return 'date';
  if (descriptor.inputType === 'number') return 'number';
  return 'text';
}

function recognitionCandidates(descriptor: PageFieldDescriptor): MatchCandidate[] {
  return FIELD_DICTIONARY.flatMap((dictionaryField) => {
    const profileField: ProfileField = {
      key: dictionaryField.key.replace('$', String(descriptor.sectionIndex ?? 0)),
      label: dictionaryField.aliases[0] ?? dictionaryField.key,
      type: inferredProfileType(descriptor),
      value: null,
      policy: 'auto',
    };
    const { score, reasons } = scoreField(descriptor, profileField, dictionaryField);
    return hasIdentitySignal(reasons) && score > SCORE_WEIGHTS.typeCompatibility
      ? [{ profileKey: profileField.key, score, source: 'generic' as const, reasons }]
      : [];
  }).sort((left, right) => right.score - left.score);
}

function mappingPriority(mapping: UserFieldMapping, pageContext: MatchOptions['pageContext']): number {
  const scope = normalizeMappingScope(mapping.scope);
  if (scope.kind === 'path') return scope.host === pageContext.host && scope.path === pageContext.path ? 3 : 0;
  if (scope.kind === 'host') return scope.host === pageContext.host ? 2 : 0;
  return 1;
}

function matchField(
  descriptor: PageFieldDescriptor,
  profile: Profile,
  mappings: UserFieldMapping[],
  pageContext: MatchOptions['pageContext'],
): FieldMatch {
  const mapping = mappings
    .filter((item) => item.fingerprint === descriptor.fingerprint && mappingPriority(item, pageContext) > 0)
    .sort((left, right) => mappingPriority(right, pageContext) - mappingPriority(left, pageContext))[0];
  const mappedField = mapping ? profile.fields[mapping.profileKey] : undefined;
  const configuredCandidates = mappedField ? [createUserCandidate(mappedField.key)] : genericCandidates(descriptor, profile);
  const candidates = configuredCandidates.length ? configuredCandidates : recognitionCandidates(descriptor);
  const selected = candidates[0];
  const configuredField = selected ? profile.fields[selected.profileKey] : undefined;

  return {
    descriptor,
    candidates,
    selected,
    status: selected
      ? configuredField ? assignConfidenceStatus(candidates, configuredField.policy) : 'missing_profile'
      : 'unrecognized',
  };
}

export function matchFields(
  fields: PageFieldDescriptor[],
  profile: Profile,
  options: MatchOptions,
): FieldMatch[] {
  return fields.map((field) => matchField(field, profile, options.mappings, options.pageContext));
}
