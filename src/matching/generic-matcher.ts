import type { FieldMatch, MatchCandidate, PageFieldDescriptor } from '../shared/form';
import { inferMappingSectionIndex, normalizeMappingScope, type UserFieldMapping } from '../shared/mapping';
import type { Profile, ProfileField, ProfileFieldType } from '../shared/profile';
import { assignConfidenceStatus } from './confidence';
import { FIELD_DICTIONARY, findDictionaryField } from './field-dictionary';
import { SCORE_WEIGHTS, scoreField } from './score-field';

export interface MatchOptions {
  mappings: UserFieldMapping[];
  pageContext: { host: string; path: string };
}

type DegreeLevel = 'high-school' | 'bachelor' | 'master' | 'doctor';

function degreeLevel(value: unknown): DegreeLevel | undefined {
  const text = String(value ?? '').toLowerCase();
  if (/博士|博士研究生|ph\.?d|doctor(?:ate|al)?/.test(text)) return 'doctor';
  if (/硕士|研究生|master|postgraduate|graduate/.test(text)) return 'master';
  if (/本科|学士|bachelor|undergraduate/.test(text)) return 'bachelor';
  if (/高中|high school|secondary school/.test(text)) return 'high-school';
  return undefined;
}

function educationSectionMap(fields: PageFieldDescriptor[], profile: Profile): Map<number, number> {
  const pageSections = new Map<number, DegreeLevel | undefined>();
  for (const field of fields) {
    if (field.sectionIndex === undefined || !/教育|学历|education|academic/i.test(`${field.sectionLabel ?? ''} ${field.semanticSource ?? ''}`)) continue;
    const semantic = degreeLevel(`${field.sectionLabel ?? ''} ${field.semanticSource ?? ''}`);
    pageSections.set(field.sectionIndex, pageSections.get(field.sectionIndex) ?? semantic);
  }
  const profileLevels = new Map<number, DegreeLevel>();
  const profileIndexes = new Set<number>();
  for (const field of Object.values(profile.fields)) {
    const indexed = field.key.match(/^educations\.(\d+)\./);
    if (indexed) profileIndexes.add(Number(indexed[1]));
    const match = field.key.match(/^educations\.(\d+)\.(?:degree|degreeType)$/);
    const level = match ? degreeLevel(field.value) : undefined;
    if (match && level && !profileLevels.has(Number(match[1]))) profileLevels.set(Number(match[1]), level);
  }
  const result = new Map<number, number>(); const used = new Set<number>();
  for (const [sectionIndex, level] of pageSections) {
    if (!level) continue;
    const profileIndex = [...profileLevels].find(([index, candidate]) => candidate === level && !used.has(index))?.[0];
    if (profileIndex !== undefined) { result.set(sectionIndex, profileIndex); used.add(profileIndex); }
  }
  for (const sectionIndex of [...pageSections.keys()].sort((a, b) => a - b)) {
    if (result.has(sectionIndex)) continue;
    const available = [...profileIndexes].sort((a, b) => a - b).filter((index) => !used.has(index));
    const profileIndex = available.includes(sectionIndex) ? sectionIndex : available[0] ?? sectionIndex;
    result.set(sectionIndex, profileIndex);
    used.add(profileIndex);
  }
  return result;
}

function createUserCandidate(profileKey: string): MatchCandidate {
  return { profileKey, score: 1, source: 'user', reasons: ['Explicit user mapping for this field fingerprint.'] };
}

function hasIdentitySignal(reasons: string[]): boolean {
  return reasons.some((reason) => reason.startsWith('页面标签') || reason.startsWith('autocomplete') || reason.startsWith('字段 name 或 id'));
}

function genericCandidates(descriptor: PageFieldDescriptor, profile: Profile, profileSectionIndex?: number): MatchCandidate[] {
  const scoringDescriptor = profileSectionIndex === undefined ? descriptor : { ...descriptor, sectionIndex: profileSectionIndex };
  return Object.values(profile.fields)
    .flatMap((profileField) => {
      const dictionaryField = findDictionaryField(profileField.key);
      if (!dictionaryField) return [];
      const { score, reasons } = scoreField(scoringDescriptor, profileField, dictionaryField);
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

function recognitionCandidates(descriptor: PageFieldDescriptor, profileSectionIndex?: number): MatchCandidate[] {
  const index = profileSectionIndex ?? descriptor.sectionIndex ?? 0;
  const scoringDescriptor = profileSectionIndex === undefined ? descriptor : { ...descriptor, sectionIndex: profileSectionIndex };
  return FIELD_DICTIONARY.flatMap((dictionaryField) => {
    const profileField: ProfileField = {
      key: dictionaryField.key.replace('$', String(index)), label: dictionaryField.aliases[0] ?? dictionaryField.key,
      type: inferredProfileType(descriptor), value: null, policy: 'auto',
    };
    const { score, reasons } = scoreField(scoringDescriptor, profileField, dictionaryField);
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

function mappingMatchesSection(mapping: UserFieldMapping, descriptor: PageFieldDescriptor): boolean {
  if (descriptor.sectionIndex === undefined) return true;
  return (mapping.sectionIndex ?? inferMappingSectionIndex(mapping.profileKey)) === descriptor.sectionIndex;
}

function matchField(descriptor: PageFieldDescriptor, profile: Profile, mappings: UserFieldMapping[], pageContext: MatchOptions['pageContext'], profileSectionIndex?: number): FieldMatch {
  const mapping = mappings
    .filter((item) => item.fingerprint === descriptor.fingerprint && mappingMatchesSection(item, descriptor) && mappingPriority(item, pageContext) > 0)
    .sort((left, right) => mappingPriority(right, pageContext) - mappingPriority(left, pageContext))[0];
  const mappedField = mapping ? profile.fields[mapping.profileKey] : undefined;
  const configuredCandidates = mappedField ? [createUserCandidate(mappedField.key)] : genericCandidates(descriptor, profile, profileSectionIndex);
  const candidates = configuredCandidates.length ? configuredCandidates : recognitionCandidates(descriptor, profileSectionIndex);
  const selected = candidates[0];
  const configuredField = selected ? profile.fields[selected.profileKey] : undefined;
  return {
    descriptor, candidates, selected,
    status: selected ? configuredField ? assignConfidenceStatus(candidates, configuredField.policy) : 'missing_profile' : 'unrecognized',
  };
}

export function matchFields(fields: PageFieldDescriptor[], profile: Profile, options: MatchOptions): FieldMatch[] {
  const educationIndexes = educationSectionMap(fields, profile);
  return fields.map((field) => {
    const isEducation = /教育|学历|education|academic/i.test(`${field.sectionLabel ?? ''} ${field.semanticSource ?? ''}`);
    const profileSectionIndex = isEducation && field.sectionIndex !== undefined ? educationIndexes.get(field.sectionIndex) : undefined;
    return matchField(field, profile, options.mappings, options.pageContext, profileSectionIndex);
  });
}
