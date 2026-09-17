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
    expect(screen.getByText('待补资料表示字段已识别，补齐本地资料后即可填写')).toBeTruthy();
  });
});
