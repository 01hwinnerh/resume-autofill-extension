import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickProfileEditor } from '../../../entrypoints/sidepanel/QuickProfileEditor';

afterEach(cleanup);

describe('QuickProfileEditor accessibility', () => {
  it('announces save state and exposes native keyboard-operable disclosure groups', () => {
    render(<QuickProfileEditor profile={{ schemaVersion: 1, fields: {} }} onSave={vi.fn(async () => undefined)} onOpenFull={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('基本与联系').closest('summary')).not.toBeNull();
    expect((screen.getByRole('button', { name: '保存资料' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
