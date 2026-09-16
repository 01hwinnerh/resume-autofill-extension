import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRecordPrompt } from '../../../entrypoints/sidepanel/ApplicationRecordPrompt';
import type { ApplicationRecord } from '../../../src/shared/application-record';

const draft = { company: '示例公司', role: '工程师', url: 'https://job.test/apply', sourceHost: 'job.test' };
const duplicate: ApplicationRecord = {
  id: 'app-1', ...draft, appliedAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z',
  currentStage: 'applied', currentStageLabel: '已投递', events: [],
};

afterEach(cleanup);

describe('ApplicationRecordPrompt', () => {
  it('keeps the confirmation form concise', () => {
    render(<ApplicationRecordPrompt draft={draft} onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn()} onOpenManager={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '确认投递信息' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认投递并记录' })).toBeTruthy();
    expect(screen.queryByText(/扩展不会自动判断/)).toBeNull();
  });

  it('requires explicit confirmation before saving a duplicate', async () => {
    const onRecord = vi.fn(async () => duplicate);
    render(<ApplicationRecordPrompt draft={draft} onFindDuplicates={vi.fn(async () => [duplicate])} onRecord={onRecord} onOpenManager={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '确认投递并记录' }));
    expect(await screen.findByText('发现相似投递记录')).toBeTruthy();
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '仍然记录' }));
    await vi.waitFor(() => expect(onRecord).toHaveBeenCalledWith(draft));
  });
});
