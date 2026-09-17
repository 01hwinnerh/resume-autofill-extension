import { isInputElement } from '../form-engine/control-elements';

export interface NormalizedInputValue {
  value?: string;
  reason?: string;
}

type DateFormat =
  | 'YYYY-MM-DD'
  | 'YYYY.MM.DD'
  | 'YYYY/MM/DD'
  | 'MM/DD/YYYY'
  | 'YYYY-MM'
  | 'MM/YYYY'
  | 'MM-YYYY'
  | 'YYYY.MM'
  | 'YYYY年MM月';
interface DateParts { year: number; month: number; day?: number }

const PRESENT_VALUES = /^(?:至今|在读)$/;
const DATE_HINT = /(?:日期|时间|年月|开始|结束|date|month|year|from|to)/i;

function validDate(year: number, month: number, day = 1): boolean {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function checkedParts(year: number, month: number, day?: number): DateParts | undefined {
  return validDate(year, month, day) ? { year, month, day } : undefined;
}

function parseDate(value: string): DateParts | undefined {
  const input = value.trim();
  let match = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(input)
    ?? /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/.exec(input);
  if (match) return checkedParts(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : undefined);

  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  if (match) return checkedParts(Number(match[3]), Number(match[1]), Number(match[2]));

  match = /^(\d{1,2})[-/](\d{4})$/.exec(input);
  return match ? checkedParts(Number(match[2]), Number(match[1])) : undefined;
}

function formatFromHint(value: string): DateFormat | undefined {
  if (/MM\s*\/\s*DD\s*\/\s*YYYY/i.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return 'MM/DD/YYYY';
  if (/YYYY\s*\.\s*MM\s*\.\s*DD/i.test(value) || /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(value)) return 'YYYY.MM.DD';
  if (/YYYY\s*\/\s*MM\s*\/\s*DD/i.test(value) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(value)) return 'YYYY/MM/DD';
  if (/YYYY\s*-\s*MM\s*-\s*DD/i.test(value) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return 'YYYY-MM-DD';
  if (/MM\s*\/\s*YYYY/i.test(value)) return 'MM/YYYY';
  if (/MM\s*-\s*YYYY/i.test(value)) return 'MM-YYYY';
  if (/YYYY\s*年\s*MM\s*月/i.test(value) || /\d{4}年\d{1,2}月/.test(value)) return 'YYYY年MM月';
  if (/YYYY\s*\.\s*MM/i.test(value) || /^\d{4}\.\d{1,2}$/.test(value)) return 'YYYY.MM';
  if (/YYYY\s*-\s*MM/i.test(value) || /^\d{4}-\d{1,2}$/.test(value)) return 'YYYY-MM';
  return undefined;
}

function dateContext(control: HTMLInputElement): string {
  const label = Array.from(control.labels ?? []).map((item) => item.textContent ?? '').join(' ');
  return [control.placeholder, control.getAttribute('aria-label'), label, control.name, control.id].filter(Boolean).join(' ');
}

function targetTextFormat(control: HTMLInputElement): DateFormat | undefined {
  return formatFromHint(control.placeholder)
    ?? formatFromHint(control.value)
    ?? (DATE_HINT.test(dateContext(control)) ? 'YYYY-MM' : undefined);
}

function formatDate(parts: DateParts, format: DateFormat): string | undefined {
  const year = String(parts.year).padStart(4, '0');
  const month = String(parts.month).padStart(2, '0');
  const day = parts.day === undefined ? undefined : String(parts.day).padStart(2, '0');
  if (format === 'YYYY-MM-DD') return day ? `${year}-${month}-${day}` : undefined;
  if (format === 'YYYY.MM.DD') return day ? `${year}.${month}.${day}` : undefined;
  if (format === 'YYYY/MM/DD') return day ? `${year}/${month}/${day}` : undefined;
  if (format === 'MM/DD/YYYY') return day ? `${month}/${day}/${year}` : undefined;
  if (format === 'YYYY-MM') return `${year}-${month}`;
  if (format === 'MM/YYYY') return `${month}/${year}`;
  if (format === 'MM-YYYY') return `${month}-${year}`;
  if (format === 'YYYY.MM') return `${year}.${month}`;
  return `${year}年${month}月`;
}

export function normalizeValueForControl(control: HTMLElement, value: string): NormalizedInputValue {
  if (!isInputElement(control)) return { value };
  const type = control.type.toLowerCase();
  const trimmed = value.trim();

  if ((type === 'date' || type === 'month') && PRESENT_VALUES.test(trimmed)) {
    return { reason: `${type} input cannot contain present/status text` };
  }

  if (type === 'date') {
    const parts = parseDate(trimmed);
    if (parts && parts.day === undefined) {
      return { reason: '原值仅包含年月，原生日期控件需要具体日期（YYYY-MM-DD），请确认“日”后重试。' };
    }
    const formatted = parts ? formatDate(parts, 'YYYY-MM-DD') : undefined;
    return formatted ? { value: formatted } : { reason: 'date input requires a valid YYYY-MM-DD value' };
  }

  if (type === 'month') {
    const parts = parseDate(trimmed);
    const formatted = parts ? formatDate(parts, 'YYYY-MM') : undefined;
    return formatted ? { value: formatted } : { reason: 'month input requires a valid YYYY-MM value' };
  }

  if (type === 'text' || type === 'search' || type === '') {
    if (PRESENT_VALUES.test(trimmed)) return { value: trimmed };
    const format = targetTextFormat(control);
    if (format) {
      const parts = parseDate(trimmed);
      if (!parts) return { reason: `text date input requires a valid ${format} value` };
      const formatted = formatDate(parts, format);
      return formatted
        ? { value: formatted }
        : { reason: `目标文本日期格式为 ${format}，需要具体日期，请补充“日”后重试。` };
    }
  }

  if (type === 'number' && (trimmed === '' || !Number.isFinite(Number(value)))) {
    return { reason: 'number input requires a numeric value' };
  }
  return { value };
}
