import type { FieldMatch, MatchCandidate, PageFieldDescriptor } from '../shared/form';
import { normalizeMappingScope, type UserFieldMapping } from '../shared/mapping';
import type { Profile } from '../shared/profile';
import { assignConfidenceStatus } from './confidence';
import { findDictionaryField } from './field-dictionary';
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

function genericCandidates(descriptor: PageFieldDescriptor, profile: Profile): MatchCandidate[] {
  return Object.values(profile.fields)
    .flatMap((profileField) => {
      const dictionaryField = findDictionaryField(profileField.key);
      if (!dictionaryField) {
        return [];
      }

      const { score, reasons } = scoreField(descriptor, profileField, dictionaryField);
      const hasFieldIdentitySignal = reasons.some((reason) => reason.startsWith('页面标签')
        || reason.startsWith('autocomplete')
        || reason.startsWith('字段 name 或 id'));
      return hasFieldIdentitySignal && score > SCORE_WEIGHTS.typeCompatibility
        ? [{ profileKey: profileField.key, score, source: 'generic' as const, reasons }]
        : [];
    })
    .sort((left, right) => right.score - left.score);
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
  const candidates = mappedField ? [createUserCandidate(mappedField.key)] : genericCandidates(descriptor, profile);
  const selected = candidates[0];

  return {
    descriptor,
    candidates,
    selected,
    status: assignConfidenceStatus(candidates, selected ? profile.fields[selected.profileKey].policy : 'auto'),
  };
}

export function matchFields(
  fields: PageFieldDescriptor[],
  profile: Profile,
  options: MatchOptions,
): FieldMatch[] {
  return fields.map((field) => matchField(field, profile, options.mappings, options.pageContext));
}
