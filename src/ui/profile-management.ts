import type { ProfileStore } from '../profile/profile-store';
import type { FieldValue, FillPolicy, Profile, ProfileField, ProfileFieldType } from '../shared/profile';
import type { MappingStore, ProfileKeyRemap } from '../storage/mapping-store';
import { EXPERIENCE_PREFIXES, PROFILE_SECTION_LABELS, experienceDefinitions, profileFieldDefinitions, type ProfileSection, type RepeatableProfileSection } from './profile-fields';

export const QUICK_PROFILE_GROUPS = [
  { id: 'contact', label: '基本与联系', keys: ['identity.name', 'contact.phone', 'contact.email', 'location.current'] },
  { id: 'employment', label: '求职信息', keys: ['employment.jobSeekingStatus', 'employment.yearsOfExperience', 'preference.role', 'preference.city'] },
  { id: 'international', label: '国际申请', keys: ['identity.lastName', 'identity.firstName', 'identity.namePinyin', 'identity.lastNamePinyin', 'identity.firstNamePinyin'] },
] as const;

export interface ExperienceMutation {
  profile: Profile;
  remap: ProfileKeyRemap;
}

export type ExperienceRecordCounts = Record<RepeatableProfileSection, number>;
export interface ExperienceEditorState {
  profile: Profile;
  counts: ExperienceRecordCounts;
  pendingRemaps: ProfileKeyRemap[];
}
export type ExperienceAction = 'add' | 'copy' | 'up' | 'down' | 'delete';

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

function experienceKeys(profile: Profile, section: RepeatableProfileSection, count: number): string[] {
  const prefix = EXPERIENCE_PREFIXES[section];
  return [...new Set([
    ...Object.keys(profile.fields).filter((key) => key.startsWith(`${prefix}.`)),
    ...Array.from({ length: count }, (_, index) => experienceDefinitions(section, index).map((definition) => definition.key)).flat(),
  ])];
}

export function reindexExperienceWithRemap(profile: Profile, section: RepeatableProfileSection, order: number[]): ExperienceMutation {
  const prefix = EXPERIENCE_PREFIXES[section];
  const count = experienceRecordCount(profile, section);
  const fields = Object.fromEntries(Object.entries(profile.fields).filter(([key]) => !key.startsWith(`${prefix}.`)));
  const remap: ProfileKeyRemap = {};
  const newIndexByOld = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  for (const key of experienceKeys(profile, section, count)) {
    const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.(.+)$`));
    if (!match) continue;
    const newIndex = newIndexByOld.get(Number(match[1]));
    const nextKey = newIndex === undefined ? null : `${prefix}.${newIndex}.${match[2]}`;
    remap[key] = nextKey;
    const value = profile.fields[key];
    if (nextKey && value) fields[nextKey] = { ...value, key: nextKey };
  }
  return { profile: { ...profile, fields }, remap };
}

export function reindexExperience(profile: Profile, section: RepeatableProfileSection, order: number[]): Profile {
  return reindexExperienceWithRemap(profile, section, order).profile;
}

export function addExperience(profile: Profile, section: RepeatableProfileSection, copyIndex?: number, targetIndex = experienceRecordCount(profile, section)): Profile {
  const fields = { ...profile.fields, ...emptyExperienceFields(section, targetIndex) };
  if (copyIndex !== undefined) {
    const prefix = EXPERIENCE_PREFIXES[section];
    for (const [key, value] of Object.entries(profile.fields)) {
      const match = key.match(new RegExp(`^${prefix}\\.${copyIndex}\\.(.+)$`));
      if (!match) continue;
      const nextKey = `${prefix}.${targetIndex}.${match[1]}`;
      fields[nextKey] = { ...value, key: nextKey };
    }
  }
  return { ...profile, fields };
}

export function deleteExperienceWithRemap(profile: Profile, section: RepeatableProfileSection, index: number): ExperienceMutation {
  const count = experienceRecordCount(profile, section);
  return reindexExperienceWithRemap(profile, section, Array.from({ length: count }, (_, current) => current).filter((current) => current !== index));
}

export function deleteExperience(profile: Profile, section: RepeatableProfileSection, index: number): Profile {
  return deleteExperienceWithRemap(profile, section, index).profile;
}

export function moveExperienceWithRemap(profile: Profile, section: RepeatableProfileSection, index: number, direction: -1 | 1): ExperienceMutation {
  const count = experienceRecordCount(profile, section); const target = index + direction;
  if (target < 0 || target >= count) return { profile, remap: {} };
  const order = Array.from({ length: count }, (_, current) => current);
  [order[index], order[target]] = [order[target], order[index]];
  return reindexExperienceWithRemap(profile, section, order);
}

export function moveExperience(profile: Profile, section: RepeatableProfileSection, index: number, direction: -1 | 1): Profile {
  return moveExperienceWithRemap(profile, section, index, direction).profile;
}

export function applyExperienceAction(state: ExperienceEditorState, section: RepeatableProfileSection, action: ExperienceAction, index = 0): ExperienceEditorState {
  if (action === 'add' || action === 'copy') {
    return {
      ...state,
      profile: addExperience(state.profile, section, action === 'copy' ? index : undefined, state.counts[section]),
      counts: { ...state.counts, [section]: state.counts[section] + 1 },
    };
  }
  const mutation = action === 'delete'
    ? deleteExperienceWithRemap(state.profile, section, index)
    : moveExperienceWithRemap(state.profile, section, index, action === 'up' ? -1 : 1);
  return {
    profile: mutation.profile,
    counts: { ...state.counts, [section]: action === 'delete' ? Math.max(1, state.counts[section] - 1) : state.counts[section] },
    pendingRemaps: Object.keys(mutation.remap).length ? [...state.pendingRemaps, mutation.remap] : state.pendingRemaps,
  };
}

export function emptyExperienceFields(section: RepeatableProfileSection, index: number): Record<string, ProfileField> {
  return Object.fromEntries(experienceDefinitions(section, index).map((definition) => [definition.key, { key: definition.key, label: definition.label, type: definition.type, value: null, policy: definition.policy }]));
}

export async function saveProfileWithMappingRemaps(profile: Profile, remaps: ProfileKeyRemap[], profileStore: ProfileStore, mappingStore: MappingStore): Promise<void> {
  const [previousProfile, previousMappings] = await Promise.all([profileStore.load(), mappingStore.list()]);
  try {
    await profileStore.save(profile);
    await mappingStore.remapProfileKeys(remaps);
  } catch (cause) {
    const rollback = await Promise.allSettled([profileStore.save(previousProfile), mappingStore.replace(previousMappings)]);
    if (rollback.some((result) => result.status === 'rejected')) throw new Error(`保存失败且未能完整恢复资料与映射：${cause instanceof Error ? cause.message : '未知错误'}`, { cause });
    throw cause;
  }
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
