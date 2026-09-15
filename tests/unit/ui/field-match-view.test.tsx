import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldMatchView } from '../../../src/ui/field-match-view';
import type { FieldMatch } from '../../../src/shared/form';

const match: FieldMatch = {
  descriptor: {
    fieldId: 'field-1',
    kind: 'text',
    label: '邮箱',
    name: 'email',
    options: [],
    currentValue: '',
    framePath: [],
    fingerprint: 'text|邮箱|email||',
  },
  candidates: [{
    profileKey: 'contact.email',
    score: 0.95,
    source: 'generic',
    reasons: ['label alias', 'autocomplete match'],
  }],
  selected: {
    profileKey: 'contact.email',
    score: 0.95,
    source: 'generic',
    reasons: ['label alias', 'autocomplete match'],
  },
  status: 'matched',
};

describe('FieldMatchView', () => {
  it('shows the page label, selected profile key, score, reason, and confirmation control', () => {
    render(<FieldMatchView match={match} selected onToggle={vi.fn()} />);

    expect(screen.getByText('邮箱')).toBeTruthy();
    expect(screen.getByText('contact.email')).toBeTruthy();
    expect(screen.getByText('95%')).toBeTruthy();
    expect(screen.getByText(/label alias/)).toBeTruthy();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });
});
