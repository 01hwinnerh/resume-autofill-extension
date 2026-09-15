import type { FieldValue } from './profile';
import type { ScanResult } from './form';
import type { FillOutcome, VerificationOutcome } from '../filling/fill-types';
import type { RuntimeError } from '../runtime/runtime-errors';

export const MESSAGE_TYPES = ['scan-page', 'fill-fields'] as const;

export interface ConfirmedFill {
  fieldId: string;
  profileKey: string;
  value: FieldValue;
}

export type PageMessage =
  | { type: 'scan-page'; requestId: string }
  | { type: 'fill-fields'; requestId: string; fields: ConfirmedFill[] };

export type RuntimeCommand =
  | { type: 'scan-active-tab' }
  | { type: 'fill-confirmed-fields'; fields: ConfirmedFill[] };

export interface PageScanResult {
  descriptors: import('./form').PageFieldDescriptor[];
  adapterId?: string;
}

export interface PageFillResult {
  fieldId: string;
  outcome: FillOutcome;
  verification?: VerificationOutcome;
}

export type PageResponse =
  | { type: 'scan-result'; requestId: string; result: PageScanResult }
  | { type: 'fill-result'; requestId: string; results: PageFillResult[] }
  | { type: 'error'; requestId: string; error: RuntimeError };

export type RuntimeCommandResponse =
  | { ok: true; data: ScanResult | import('../runtime/application-controller').FillSummary }
  | { ok: false; error: RuntimeError };
