import type { Profile, ProfileField, ProfileFieldType, FillPolicy } from '../shared/profile';

export interface ProfileFieldDefinition {
  key: string;
  label: string;
  type: ProfileFieldType;
  policy: FillPolicy;
}

export const P0_PROFILE_FIELDS: ProfileFieldDefinition[] = [
  { key: 'identity.name', label: '姓名', type: 'text', policy: 'auto' },
  { key: 'contact.phone', label: '手机号', type: 'text', policy: 'review' },
  { key: 'contact.email', label: '邮箱', type: 'text', policy: 'auto' },
  { key: 'education.school', label: '毕业院校', type: 'text', policy: 'auto' },
  { key: 'education.degree', label: '最高学历', type: 'enum', policy: 'review' },
  { key: 'education.major', label: '专业', type: 'text', policy: 'auto' },
  { key: 'experience.company', label: '公司/实习单位', type: 'text', policy: 'auto' },
  { key: 'experience.title', label: '职位/岗位', type: 'text', policy: 'auto' },
  { key: 'preference.city', label: '意向城市', type: 'text', policy: 'review' },
];

export function emptyProfile(): Profile {
  return { schemaVersion: 1, fields: {} };
}

export function isCustomProfileKey(key: string): boolean {
  return /^custom\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key.trim());
}

export function profileFieldValue(profile: Profile, key: string): ProfileField['value'] {
  return profile.fields[key]?.value ?? null;
}

export function buildProfileField(
  definition: ProfileFieldDefinition,
  value: string,
): ProfileField {
  return { ...definition, value };
}
