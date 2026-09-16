import { mappingScopeTarget, normalizeMappingScope, type NormalizedUserFieldMapping } from '../shared/mapping';
import type { Profile } from '../shared/profile';
import { profileFieldDefinitions } from './profile-fields';

export interface MappingProfileOption {
  key: string;
  label: string;
}

function indexedLabel(key: string, label: string): string {
  const match = key.match(/\.(\d+)\./);
  return match ? `${label} ${Number(match[1]) + 1}` : label;
}

export function mappingProfileOptions(profile: Profile): MappingProfileOption[] {
  const definitionLabels = new Map(profileFieldDefinitions(profile).map((field) => [field.key, indexedLabel(field.key, field.label)]));
  return Object.keys(profile.fields)
    .map((key) => ({ key, label: definitionLabels.get(key) ?? profile.fields[key].label ?? key }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

export function orphanedMappings(mappings: NormalizedUserFieldMapping[], profile: Profile): NormalizedUserFieldMapping[] {
  return mappings.filter((mapping) => !profile.fields[mapping.profileKey]);
}

export function mappingProfileLabel(mapping: NormalizedUserFieldMapping, profile: Profile): string {
  return mappingProfileOptions(profile).find((option) => option.key === mapping.profileKey)?.label ?? mapping.profileKey;
}

export function mappingSiteTarget(mapping: NormalizedUserFieldMapping): string {
  return mappingScopeTarget(normalizeMappingScope(mapping.scope));
}

export function filterMappings(
  mappings: NormalizedUserFieldMapping[],
  profile: Profile,
  filters: { query: string; site: string; profileKey: string; scopeKind: string },
): NormalizedUserFieldMapping[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return mappings.filter((mapping) => {
    const target = mappingSiteTarget(mapping);
    const label = mappingProfileLabel(mapping, profile);
    return (!filters.site || target === filters.site)
      && (!filters.profileKey || mapping.profileKey === filters.profileKey)
      && (!filters.scopeKind || mapping.scope.kind === filters.scopeKind)
      && (!query || `${target} ${mapping.fingerprint} ${label} ${mapping.profileKey}`.toLocaleLowerCase().includes(query));
  });
}
