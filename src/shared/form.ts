import type { FieldValue } from './profile';
import type { ScanTarget } from '../runtime/scan-session';

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
  'combobox',
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
  /** Controls that are discoverable but require a site-specific interaction instead of value assignment. */
  manualOnly?: boolean;
  /** Non-sensitive evidence describing where site-specific semantics came from. */
  semanticSource?: string;
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
  /** Present for live scans; optional for legacy persisted/test fixtures. */
  target?: ScanTarget;
  page: ScanPageInfo;
  adapterId?: string;
  fields: FieldMatch[];
}
