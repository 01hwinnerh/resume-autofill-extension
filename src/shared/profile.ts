export const PROFILE_SCHEMA_VERSION = 1 as const;

export type FieldValue = string | number | boolean | string[] | null;

export type ProfileFieldType =
  | 'text'
  | 'date'
  | 'number'
  | 'enum'
  | 'boolean'
  | 'multiselect';

export type FillPolicy = 'auto' | 'review' | 'never';

export interface ProfileField {
  key: string;
  label: string;
  type: ProfileFieldType;
  value: FieldValue;
  policy: FillPolicy;
}

export interface Profile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  fields: Record<string, ProfileField>;
}
