import type { FieldValue } from './profile';
import type { ScanResult } from './form';
import type { FillOutcome, VerificationOutcome } from '../filling/fill-types';
import type { RuntimeError } from '../runtime/runtime-errors';
import type { ScanTarget } from '../runtime/scan-session';

export const MESSAGE_TYPES = ['scan-page', 'fill-fields', 'focus-field'] as const;

export interface ConfirmedFill {
  fieldId: string;
  profileKey: string;
  value: FieldValue;
}

export type PageMessage =
  | { type: 'scan-page'; requestId: string }
  | { type: 'fill-fields'; requestId: string; fields: ConfirmedFill[] }
  | { type: 'focus-field'; requestId: string; fieldId: string };

export type RuntimeCommand =
  | { type: 'scan-active-tab'; target?: Pick<ScanTarget, 'tabId' | 'windowId' | 'url' | 'title'> }
  | { type: 'fill-confirmed-fields'; fields: ConfirmedFill[]; target?: ScanTarget }
  | { type: 'focus-active-field'; fieldId: string; target?: ScanTarget };

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
  | { type: 'focus-result'; requestId: string; fieldId: string; focused: boolean }
  | { type: 'error'; requestId: string; error: RuntimeError };

export type RuntimeCommandResponse =
  | { ok: true; data: ScanResult | import('../runtime/application-controller').FillSummary | { fieldId: string; focused: boolean } }
  | { ok: false; error: RuntimeError };
