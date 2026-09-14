import type { FieldMatch, MatchCandidate, PageFieldDescriptor } from '../shared/form';
import type { UserFieldMapping } from '../shared/mapping';
import type { Profile } from '../shared/profile';
import { assignConfidenceStatus } from './confidence';
import { findDictionaryField } from './field-dictionary';
import { SCORE_WEIGHTS, scoreField } from './score-field';

export interface MatchOptions {
  mappings: UserFieldMapping[];
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
      return score > SCORE_WEIGHTS.typeCompatibility
        ? [{ profileKey: profileField.key, score, source: 'generic' as const, reasons }]
        : [];
    })
    .sort((left, right) => right.score - left.score);
}

function matchField(
  descriptor: PageFieldDescriptor,
  profile: Profile,
  mappings: UserFieldMapping[],
): FieldMatch {
  const mapping = mappings.find((item) => item.fingerprint === descriptor.fingerprint);
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
  return fields.map((field) => matchField(field, profile, options.mappings));
}
