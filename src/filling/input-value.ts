import { isInputElement } from '../form-engine/control-elements';

export interface NormalizedInputValue {
  value?: string;
  reason?: string;
}

function normalizedDateParts(value: string): RegExpExecArray | null {
  return /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(value.trim());
}

function validDate(year: number, month: number, day: number): boolean {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function normalizeValueForControl(control: HTMLElement, value: string): NormalizedInputValue {
  if (!isInputElement(control)) return { value };
  const type = control.type.toLowerCase();

  if (type === 'date') {
    const parts = normalizedDateParts(value);
    if (!parts?.[3]) return { reason: 'date input requires a valid YYYY-MM-DD value' };
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    if (!validDate(year, month, day)) return { reason: 'date input requires a valid YYYY-MM-DD value' };
    return { value: `${parts[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
  }

  if (type === 'month') {
    const parts = normalizedDateParts(value);
    const month = Number(parts?.[2]);
    if (!parts || month < 1 || month > 12) return { reason: 'month input requires a valid YYYY-MM value' };
    return { value: `${parts[1]}-${String(month).padStart(2, '0')}` };
  }

  if (type === 'number' && (value.trim() === '' || !Number.isFinite(Number(value)))) {
    return { reason: 'number input requires a numeric value' };
  }
  return { value };
}
