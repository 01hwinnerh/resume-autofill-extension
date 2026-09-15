import type { FieldValue } from './profile';

export const FIELD_STATUSES = [
  'matched',
  'needs_confirmation',
  'skipped_existing',
  'filled',
  'verified',
  'failed',
  'unsupported',
] as const;

export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const PAGE_FIELD_KINDS = [
  'text',
  'textarea',
  'select',
  'radio',
  'checkbox',
] as const;

export type PageFieldKind = (typeof PAGE_FIELD_KINDS)[number];

export interface PageFieldDescriptor {
  fieldId: string;
  kind: PageFieldKind;
  inputType?: string;
  label: string;
  name?: string;
  htmlId?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  options: Array<{ label: string; value: string }>;
  currentValue: FieldValue;
  sectionLabel?: string;
  /** Stable 0-based index of a repeated education/work/project container. */
  sectionIndex?: number;
  framePath: number[];
  fingerprint: string;
}

export interface MatchCandidate {
  profileKey: string;
  score: number;
  source: 'user' | 'adapter' | 'generic';
  reasons: string[];
}

export interface FieldMatch {
  descriptor: PageFieldDescriptor;
  candidates: MatchCandidate[];
  selected?: MatchCandidate;
  status: FieldStatus;
}

export interface ScanPageInfo {
  url: string;
  host: string;
  title: string;
}

export interface ScanResult {
  page: ScanPageInfo;
  adapterId?: string;
  fields: FieldMatch[];
}
