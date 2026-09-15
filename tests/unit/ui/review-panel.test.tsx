import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from '../../../entrypoints/sidepanel/ReviewPanel';
import type { ConfirmedFill } from '../../../src/shared/messages';
import type { ScanResult } from '../../../src/shared/form';

const result: ScanResult = {
  page: { url: 'https://job.test/apply', host: 'job.test', title: '申请' },
  fields: [{
    descriptor: { fieldId: 'field-1', kind: 'text', inputType: 'date', label: '可到岗日期', options: [], currentValue: '', framePath: [], fingerprint: 'f1' },
    candidates: [], status: 'unsupported',
  }],
};

function Harness({ onFill }: { onFill: (fields: ConfirmedFill[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <ReviewPanel result={result} profile={{ schemaVersion: 1, fields: {} }} selected={selected} setSelected={setSelected} onFill={onFill} onSaveMapping={vi.fn(async () => undefined)} onLocate={vi.fn(async () => undefined)} />;
}

describe('ReviewPanel', () => {
  it('uses an unmatched safe field immediately and confirms it in preview', () => {
    const onFill = vi.fn();
    render(<Harness onFill={onFill} />);
    const input = screen.getByLabelText('可到岗日期本次填写值') as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: '预览并确认' }));
    expect(screen.getByRole('region', { name: '填写预览' })).toBeTruthy();
    expect(screen.getByText('本次输入')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /确认并填写 1 项/ }));
    expect(onFill).toHaveBeenCalledWith([{ fieldId: 'field-1', profileKey: 'custom.session.field-1', value: '2026-10-01' }]);
  });
});
