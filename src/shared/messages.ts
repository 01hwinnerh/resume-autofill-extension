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
  tabId?: number;
  frameId?: number;
  overwrite?: boolean;
}

interface SessionMessage { requestId: string; scanToken?: string; expectedFingerprint?: string }
export type PageMessage =
  | ({ type: 'scan-page'; namespace?: string } & SessionMessage)
  | ({ type: 'fill-fields'; fields: ConfirmedFill[] } & SessionMessage)
  | ({ type: 'focus-field'; fieldId: string } & SessionMessage);

export type RuntimeCommand =
  | { type: 'scan-active-tab'; target?: Pick<ScanTarget, 'tabId' | 'windowId' | 'url' | 'title'> }
  | { type: 'fill-confirmed-fields'; fields: ConfirmedFill[]; target?: ScanTarget }
  | { type: 'focus-active-field'; fieldId: string; target?: ScanTarget };

export interface PageScanResult {
  descriptors: import('./form').PageFieldDescriptor[];
  adapterId?: string;
  metadata?: import('./form').ApplicationPageMetadata;
  fingerprint?: string;
  frameUrl?: string;
  childFrameCount?: number;
}

export interface PageFieldsChangedMessage { type: 'page-fields-changed'; newFieldCount: number; sessionInvalidated?: boolean }
export interface PageFillResult { fieldId: string; outcome: FillOutcome; verification?: VerificationOutcome }
export type PageResponse =
  | { type: 'scan-result'; requestId: string; result: PageScanResult }
  | { type: 'fill-result'; requestId: string; results: PageFillResult[] }
  | { type: 'focus-result'; requestId: string; fieldId: string; focused: boolean }
  | { type: 'error'; requestId: string; error: RuntimeError };
export type RuntimeCommandResponse =
  | { ok: true; data: ScanResult | import('../runtime/application-controller').FillSummary | { fieldId: string; focused: boolean } }
  | { ok: false; error: RuntimeError };
