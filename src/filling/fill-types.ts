export interface FillOptions {
  overwrite: boolean;
  confirmed: boolean;
}

export type FillOutcome =
  | { status: 'filled'; fieldId: string }
  | { status: 'skipped_existing'; fieldId: string }
  | { status: 'failed'; fieldId: string; reason: string };

export interface VerificationOutcome {
  fieldId: string;
  verified: boolean;
  reason?: string;
}
