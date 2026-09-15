import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldMatchView } from '../../../src/ui/field-match-view';
import type { FieldMatch } from '../../../src/shared/form';

const match: FieldMatch = {
  descriptor: { fieldId: 'field-1', kind: 'text', label: '邮箱', name: 'email', options: [], currentValue: 'old@example.test', framePath: [], fingerprint: 'text|邮箱|email||' },
  candidates: [{ profileKey: 'contact.email', score: 0.95, source: 'generic', reasons: ['label alias', 'autocomplete match'] }],
  selected: { profileKey: 'contact.email', score: 0.95, source: 'generic', reasons: ['label alias', 'autocomplete match'] },
  status: 'matched',
};

describe('FieldMatchView', () => {
  it('shows value transition, masked candidate, reasons, selection and locate controls', () => {
    const onLocate = vi.fn();
    render(<FieldMatchView match={match} candidateValue="candidate@example.test" selected onToggle={vi.fn()} onLocate={onLocate} />);
    expect(screen.getByText('页面当前值')).toBeTruthy();
    expect(screen.getByText('old@example.test')).toBeTruthy();
    expect(screen.getByText('ca***@example.test')).toBeTruthy();
    expect(screen.getByText(/置信度 95%/)).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '展开资料值' }));
    expect(screen.getByText('candidate@example.test')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '定位页面字段' }));
    expect(onLocate).toHaveBeenCalledWith('field-1');
  });
});
