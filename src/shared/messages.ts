import type { FieldValue } from './profile';

export const MESSAGE_TYPES = ['scan-page', 'fill-fields'] as const;

export interface ConfirmedFill {
  fieldId: string;
  profileKey: string;
  value: FieldValue;
}

export type PageMessage =
  | { type: 'scan-page'; requestId: string }
  | { type: 'fill-fields'; requestId: string; fields: ConfirmedFill[] };
