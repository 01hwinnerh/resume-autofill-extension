import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FieldMatch, FieldStatus } from '../../../src/shared/form';
import { countRecognizedFields, StatusSummary } from '../../../src/ui/status-summary';

function field(fieldId: string, status: FieldStatus): FieldMatch {
  return {
    descriptor: { fieldId, kind: 'text', label: fieldId, options: [], currentValue: '', framePath: [], fingerprint: fieldId },
    candidates: [],
    status,
  };
}

afterEach(cleanup);

describe('StatusSummary', () => {
  it('counts recognized statuses without treating unrecognized fields as recognized', () => {
    const fields = [
      field('matched', 'matched'),
      field('confirmation', 'needs_confirmation'),
      field('missing', 'missing_profile'),
      field('existing', 'skipped_existing'),
      field('unknown', 'unrecognized'),
      field('unsupported', 'unsupported'),
      field('failed', 'failed'),
    ];

    expect(countRecognizedFields(fields)).toBe(4);
    render(<StatusSummary fields={fields} />);
    expect(screen.getByText('已识别 4/7')).toBeTruthy();
    expect(screen.getByText('资料就绪 1，待确认 1，资料缺失 1，已有值 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '筛选资料就绪字段，共 1 项' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '筛选待确认字段，共 1 项' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '筛选资料缺失字段，共 1 项' })).toBeTruthy();
  });
});
