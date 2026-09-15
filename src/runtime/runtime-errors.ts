export const CONTENT_SCRIPT_TIMEOUT_MS = 5000 as const;

export type RuntimeErrorCode =
  | 'TAB_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'CONTENT_SCRIPT_UNAVAILABLE'
  | 'CONTENT_SCRIPT_TIMEOUT'
  | 'SCAN_FAILED'
  | 'FIELD_OPERATION_FAILED';

export interface RuntimeError {
  code: RuntimeErrorCode;
  message: string;
  retryable: boolean;
}

export class RuntimeRequestError extends Error {
  readonly code: RuntimeErrorCode;
  readonly retryable: boolean;
  readonly runtimeError: RuntimeError;

  constructor(error: RuntimeError, cause?: unknown) {
    super(error.message, { cause });
    this.name = 'RuntimeRequestError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.runtimeError = error;
  }
}

export function createRuntimeError(
  code: RuntimeErrorCode,
  message: string,
  retryable: boolean,
): RuntimeError {
  return { code, message, retryable };
}
