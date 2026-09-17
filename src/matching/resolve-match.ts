import type { AdapterHint } from '../adapters/adapter-types';
import type { FieldMatch, MatchCandidate, PageFieldDescriptor } from '../shared/form';
import type { Profile } from '../shared/profile';
import { assignConfidenceStatus } from './confidence';
import { matchFields, type MatchOptions } from './generic-matcher';

export interface ResolveMatchOptions extends MatchOptions { adapterHints?: AdapterHint[] }

function toAdapterCandidates(field: PageFieldDescriptor, profile: Profile, hints: AdapterHint[]): MatchCandidate[] {
  return hints
    .filter((hint) => hint.fieldId === field.fieldId && profile.fields[hint.profileKey] !== undefined)
    .map((hint) => ({ profileKey: hint.profileKey, score: hint.score, source: 'adapter' as const, reasons: [hint.reason] }))
    .sort((left, right) => right.score - left.score);
}

function resolveField(field: PageFieldDescriptor, profile: Profile, mappedMatch: FieldMatch, genericMatch: FieldMatch, options: ResolveMatchOptions): FieldMatch {
  if (field.manualOnly) return { descriptor: field, candidates: [], status: 'unsupported' };
  const userCandidates = mappedMatch.selected?.source === 'user' ? mappedMatch.candidates : [];
  const adapterCandidates = toAdapterCandidates(field, profile, options.adapterHints ?? []);
  const candidates = [...userCandidates, ...adapterCandidates, ...genericMatch.candidates];
  const selected = candidates[0];
  const policy = selected ? profile.fields[selected.profileKey]?.policy ?? 'auto' : 'auto';
  const confidenceCandidates = selected?.source === 'adapter' ? adapterCandidates : selected ? [selected] : [];
  return {
    descriptor: field, candidates, selected,
    status: !selected ? genericMatch.status : selected.source === 'generic' ? genericMatch.status : assignConfidenceStatus(confidenceCandidates, policy),
  };
}

export function resolveMatches(fields: PageFieldDescriptor[], profile: Profile, options: ResolveMatchOptions): FieldMatch[] {
  const mappedMatches = matchFields(fields, profile, options);
  const genericMatches = matchFields(fields, profile, { mappings: [], pageContext: options.pageContext });
  return fields.map((field, index) => resolveField(field, profile, mappedMatches[index], genericMatches[index], options));
}
