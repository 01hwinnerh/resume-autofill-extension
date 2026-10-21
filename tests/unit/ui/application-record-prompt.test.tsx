import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRecordPrompt } from '../../../entrypoints/sidepanel/ApplicationRecordPrompt';
import type { ApplicationRecord } from '../../../src/shared/application-record';
import { StorageError } from '../../../src/storage/storage-port';

const draft = { company: '示例公司', role: '工程师', url: 'https://job.test/apply', sourceHost: 'job.test' };
const duplicate: ApplicationRecord = {
  id: 'app-1', ...draft, appliedAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z',
  currentStage: 'applied', currentStageLabel: '已投递', events: [],
};

afterEach(cleanup);

describe('ApplicationRecordPrompt', () => {
  it('keeps the confirmation form concise', () => {
    render(<ApplicationRecordPrompt draft={draft} source="current" onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn()} onOpenManager={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '确认投递信息' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认投递并记录' })).toBeTruthy();
    expect(screen.queryByText(/扩展不会自动判断/)).toBeNull();
  });

  it('requires explicit confirmation before saving a duplicate', async () => {
    const onRecord = vi.fn(async () => duplicate);
    render(<ApplicationRecordPrompt draft={draft} source="current" onFindDuplicates={vi.fn(async () => [duplicate])} onRecord={onRecord} onOpenManager={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '确认投递并记录' }));
    expect(await screen.findByText('发现相似投递记录')).toBeTruthy();
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '仍然记录' }));
    await vi.waitFor(() => expect(onRecord).toHaveBeenCalledWith(draft));
  });

  it('shows a recovery instruction and never exposes success actions on persistence failure', async () => {
    const error = new StorageError('recovery_required', 'write', 'resume-autofill.applications.v1', undefined);
    render(<ApplicationRecordPrompt draft={draft} source="current" onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn(async () => { throw error; })} onOpenManager={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '确认投递并记录' }));
    expect(await screen.findByText(/我的资料 → 配置迁移/)).toBeTruthy();
    expect(screen.queryByText('记录成功，查看该记录')).toBeNull();
    expect(screen.queryByRole('button', { name: '查看该记录' })).toBeNull();
  });
});

  it('blocks generic or empty role names', () => {
    render(<ApplicationRecordPrompt draft={{ ...draft, role: '投递记录' }} source="manual" onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn()} onOpenManager={vi.fn()} />);
    expect((screen.getByRole('button', { name: '确认投递并记录' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/无法确定具体职位/)).toBeTruthy();
  });

  it('removes uncertainty warnings after a verified successful record', async () => {
    const created = { ...duplicate, company: '美团', role: 'AI Agent开发工程师' };
    render(<ApplicationRecordPrompt draft={{ ...draft, company: '美团', role: '' }} source="manual" onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn(async () => created)} onOpenManager={vi.fn()} />);
    expect(screen.getByText(/无法确定具体职位/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('职位'), { target: { value: 'AI Agent开发工程师' } });
    fireEvent.click(screen.getByRole('button', { name: '确认投递并记录' }));
    expect(await screen.findByText('记录成功，查看该记录')).toBeTruthy();
    expect(screen.queryByText(/无法确定具体职位/)).toBeNull();
  });

  it('requires a choice when multiple candidates are available and keeps fields editable', () => {
    const candidates = [draft, { ...draft, role: '产品经理', url: 'https://job.test/product' }];
    render(<ApplicationRecordPrompt draft={{ ...draft, company: '', role: '' }} candidates={candidates} source="page-selected" onFindDuplicates={vi.fn(async () => [])} onRecord={vi.fn()} onOpenManager={vi.fn()} />);
    expect((screen.getByRole('button', { name: '确认投递并记录' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /示例公司 · 产品经理/ }));
    expect((screen.getByLabelText('职位') as HTMLInputElement).value).toBe('产品经理');
    expect((screen.getByRole('button', { name: '确认投递并记录' }) as HTMLButtonElement).disabled).toBe(false);
  });
