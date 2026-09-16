import type { FieldValue, FillPolicy, Profile, ProfileField, ProfileFieldType } from '../shared/profile';
import { EXPERIENCE_PREFIXES, PROFILE_SECTION_LABELS, experienceDefinitions, profileFieldDefinitions, type ProfileSection, type RepeatableProfileSection } from './profile-fields';

export const QUICK_PROFILE_GROUPS = [
  { id: 'contact', label: '基本与联系', keys: ['identity.name', 'contact.phone', 'contact.email', 'location.current'] },
  { id: 'employment', label: '求职信息', keys: ['employment.jobSeekingStatus', 'employment.yearsOfExperience', 'preference.role', 'preference.city'] },
  { id: 'international', label: '国际申请', keys: ['identity.lastName', 'identity.firstName', 'identity.namePinyin', 'identity.lastNamePinyin', 'identity.firstNamePinyin'] },
] as const;

export function stringifyFieldValue(value: FieldValue | undefined): string {
  if (value === null || value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function profileCompletion(profile: Profile) {
  const definitions = profileFieldDefinitions(profile);
  const populated = definitions.filter((definition) => stringifyFieldValue(profile.fields[definition.key]?.value).trim());
  const bySection = Object.fromEntries((Object.keys(PROFILE_SECTION_LABELS) as ProfileSection[]).map((section) => {
    const sectionDefinitions = definitions.filter((item) => item.section === section);
    return [section, { filled: sectionDefinitions.filter((item) => populated.some((field) => field.key === item.key)).length, total: sectionDefinitions.length }];
  })) as Record<ProfileSection, { filled: number; total: number }>;
  return { filled: populated.length, total: definitions.length, percent: definitions.length ? Math.round((populated.length / definitions.length) * 100) : 0, bySection };
}

export function experienceRecordCount(profile: Profile, section: RepeatableProfileSection): number {
  const prefix = EXPERIENCE_PREFIXES[section];
  const indexes = Object.keys(profile.fields).flatMap((key) => { const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.`)); return match ? [Number(match[1])] : []; });
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}

export function reindexExperience(profile: Profile, section: RepeatableProfileSection, order: number[]): Profile {
  const prefix = EXPERIENCE_PREFIXES[section];
  const fields = Object.fromEntries(Object.entries(profile.fields).filter(([key]) => !key.startsWith(`${prefix}.`)));
  order.forEach((oldIndex, newIndex) => {
    for (const [key, value] of Object.entries(profile.fields)) {
      const match = key.match(new RegExp(`^${prefix}\\.${oldIndex}\\.(.+)$`));
      if (!match) continue;
      const nextKey = `${prefix}.${newIndex}.${match[1]}`;
      fields[nextKey] = { ...value, key: nextKey };
    }
  });
  return { ...profile, fields };
}

export function addExperience(profile: Profile, section: RepeatableProfileSection, copyIndex?: number): Profile {
  const count = experienceRecordCount(profile, section);
  if (copyIndex === undefined) return profile;
  const prefix = EXPERIENCE_PREFIXES[section];
  const fields = { ...profile.fields };
  for (const [key, value] of Object.entries(profile.fields)) {
    const match = key.match(new RegExp(`^${prefix}\\.${copyIndex}\\.(.+)$`));
    if (!match) continue;
    const nextKey = `${prefix}.${count}.${match[1]}`;
    fields[nextKey] = { ...value, key: nextKey };
  }
  return { ...profile, fields };
}

export function deleteExperience(profile: Profile, section: RepeatableProfileSection, index: number): Profile {
  const count = experienceRecordCount(profile, section);
  return reindexExperience(profile, section, Array.from({ length: count }, (_, current) => current).filter((current) => current !== index));
}

export function moveExperience(profile: Profile, section: RepeatableProfileSection, index: number, direction: -1 | 1): Profile {
  const count = experienceRecordCount(profile, section); const target = index + direction;
  if (target < 0 || target >= count) return profile;
  const order = Array.from({ length: count }, (_, current) => current);
  [order[index], order[target]] = [order[target], order[index]];
  return reindexExperience(profile, section, order);
}

export function emptyExperienceFields(section: RepeatableProfileSection, index: number): Record<string, ProfileField> {
  return Object.fromEntries(experienceDefinitions(section, index).map((definition) => [definition.key, { key: definition.key, label: definition.label, type: definition.type, value: null, policy: definition.policy }]));
}

export function generateCustomFieldKey(now = Date.now()): string { return `custom.field_${now.toString(36)}`; }
export function parseFieldValue(type: ProfileFieldType, input: string): FieldValue {
  if (type === 'boolean') return input === 'true';
  if (type === 'number') return input.trim() === '' ? null : Number(input);
  if (type === 'multiselect') return input.split(',').map((item) => item.trim()).filter(Boolean);
  return input;
}
export function createCustomField(input: { key?: string; label: string; type: ProfileFieldType; value: string; policy: FillPolicy }, now = Date.now()): ProfileField {
  return { key: input.key?.trim() || generateCustomFieldKey(now), label: input.label.trim(), type: input.type, value: parseFieldValue(input.type, input.value), policy: input.policy };
}
export function displayFieldValue(value: FieldValue): string {
  const text = stringifyFieldValue(value); if (!text) return '未填写';
  if (text.includes('@')) return text.replace(/^(.{1,2}).*(@.*)$/, '$1***$2');
  return text.length > 24 ? `${text.slice(0, 21)}…` : text;
}
