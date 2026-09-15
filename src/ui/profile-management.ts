import type { FieldValue, FillPolicy, Profile, ProfileField, ProfileFieldType } from '../shared/profile';
import { PROFILE_FIELDS, PROFILE_SECTION_LABELS, type ProfileSection } from './profile-fields';

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
  const populated = PROFILE_FIELDS.filter((definition) => stringifyFieldValue(profile.fields[definition.key]?.value).trim());
  const bySection = Object.fromEntries((Object.keys(PROFILE_SECTION_LABELS) as ProfileSection[]).map((section) => {
    const definitions = PROFILE_FIELDS.filter((item) => item.section === section);
    return [section, { filled: definitions.filter((item) => populated.some((field) => field.key === item.key)).length, total: definitions.length }];
  })) as Record<ProfileSection, { filled: number; total: number }>;
  return { filled: populated.length, total: PROFILE_FIELDS.length, percent: Math.round((populated.length / PROFILE_FIELDS.length) * 100), bySection };
}

export function generateCustomFieldKey(now = Date.now()): string {
  return `custom.field_${now.toString(36)}`;
}

export function parseFieldValue(type: ProfileFieldType, input: string): FieldValue {
  if (type === 'boolean') return input === 'true';
  if (type === 'number') return input.trim() === '' ? null : Number(input);
  if (type === 'multiselect') return input.split(',').map((item) => item.trim()).filter(Boolean);
  return input;
}

export function createCustomField(input: { key?: string; label: string; type: ProfileFieldType; value: string; policy: FillPolicy }, now = Date.now()): ProfileField {
  return {
    key: input.key?.trim() || generateCustomFieldKey(now),
    label: input.label.trim(),
    type: input.type,
    value: parseFieldValue(input.type, input.value),
    policy: input.policy,
  };
}

export function displayFieldValue(value: FieldValue): string {
  const text = stringifyFieldValue(value);
  if (!text) return '未填写';
  if (text.includes('@')) return text.replace(/^(.{1,2}).*(@.*)$/, '$1***$2');
  return text.length > 24 ? `${text.slice(0, 21)}…` : text;
}
