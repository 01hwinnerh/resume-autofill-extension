import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRecordsPanel } from '../../../entrypoints/sidepanel/ApplicationRecordsPanel';
import type { ApplicationRecord } from '../../../src/shared/application-record';

function record(id: string, company: string, role: string, updatedAt: string, stage: ApplicationRecord['currentStage'] = 'applied'): ApplicationRecord {
  const label = stage === 'interview_1' ? '一面' : stage === 'offer' ? 'Offer' : stage === 'rejected' ? '未通过' : '已投递';
  return {
    id,
    company,
    role,
    url: `https://jobs.example/${id}`,
    sourceHost: 'jobs.example',
    appliedAt: '2026-09-20T08:00:00.000Z',
    updatedAt,
    currentStage: stage,
    currentStageLabel: label,
    events: [{ id: `event-${id}`, stage, label, occurredAt: updatedAt, note: `${company} 最新进展` }],
  };
}

function storeWith(initial: ApplicationRecord[]) {
  let listener: ((records: ApplicationRecord[]) => void) | undefined;
  const store = {
    list: vi.fn(async () => initial),
    subscribe: vi.fn((next: (records: ApplicationRecord[]) => void) => { listener = next; return vi.fn(); }),
  };
  return { store, publish: (records: ApplicationRecord[]) => listener?.(records) };
}

const older = record('older', '字节公司', '前端工程师', '2026-09-21T08:00:00.000Z');
const newer = record('newer', '飞书公司', '产品经理', '2026-09-24T08:00:00.000Z', 'interview_1');

afterEach(cleanup);

describe('ApplicationRecordsPanel', () => {
  it('loads records, sorts by recency, searches company/role/stage and updates from subscriptions', async () => {
    let resolveList!: (records: ApplicationRecord[]) => void;
    const list = vi.fn(() => new Promise<ApplicationRecord[]>((resolve) => { resolveList = resolve; }));
    let publish!: (records: ApplicationRecord[]) => void;
    const store = { list, subscribe: vi.fn((listener: (records: ApplicationRecord[]) => void) => { publish = listener; return vi.fn(); }) };
    render(<ApplicationRecordsPanel store={store} onOpenManager={vi.fn()} />);
    expect(screen.getByText('正在加载投递记录…')).toBeTruthy();

    resolveList([older, newer]);
    expect(await screen.findByText('共 2 条投递记录')).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: '投递记录列表' })).getAllByRole('button');
    expect(rows[0].getAttribute('aria-label')).toContain('飞书公司');
    expect(rows[0].getAttribute('aria-current')).toBe('true');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索公司、职位或阶段' }), { target: { value: '前端' } });
    expect(screen.getByText('共 2 条投递记录，找到 1 条')).toBeTruthy();
    expect(screen.getByRole('button', { name: /字节公司/ }).getAttribute('aria-label')).toContain('字节公司');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索公司、职位或阶段' }), { target: { value: '一面' } });
    expect(screen.getByRole('button', { name: /飞书公司/ }).getAttribute('aria-label')).toContain('飞书公司');
    publish([newer, older, record('latest', '新公司', '设计师', '2026-09-25T08:00:00.000Z')]);
    expect(await screen.findByText('共 3 条投递记录，找到 1 条')).toBeTruthy();
  });

  it('renders semantic stage colors in the list and selected detail', async () => {
    const offer = record('offer', '录用公司', '工程师', '2026-09-25T08:00:00.000Z', 'offer');
    const rejected = record('rejected', '终止公司', '工程师', '2026-09-24T08:00:00.000Z', 'rejected');
    const { store } = storeWith([offer, rejected, older]);
    render(<ApplicationRecordsPanel store={store} onOpenManager={vi.fn()} />);

    const offerRow = await screen.findByRole('button', { name: /录用公司/ });
    expect(offerRow.querySelector('.application-stage-chip')?.classList.contains('stage-tone-green')).toBe(true);
    expect(screen.getByRole('button', { name: /终止公司/ }).querySelector('.application-stage-chip')?.classList.contains('stage-tone-red')).toBe(true);
    expect(screen.getByRole('button', { name: /字节公司/ }).querySelector('.application-stage-chip')?.classList.contains('stage-tone-blue')).toBe(true);
    expect(screen.getByLabelText('选中投递记录详情').querySelector('.application-stage-chip')?.classList.contains('stage-tone-green')).toBe(true);
  });

  it('selects locally, highlights the row, falls back after deletion and opens the manager with selected id', async () => {
    const { store, publish } = storeWith([newer, older]);
    const onOpenManager = vi.fn();
    render(<ApplicationRecordsPanel store={store} onOpenManager={onOpenManager} />);
    await screen.findByText('共 2 条投递记录');

    const olderRow = screen.getByRole('button', { name: /字节公司/ });
    fireEvent.click(olderRow);
    expect(olderRow.getAttribute('aria-current')).toBe('true');
    expect(screen.getByLabelText('选中投递记录详情').textContent).toContain('字节公司');
    expect(onOpenManager).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '打开完整管理页' }));
    expect(onOpenManager).toHaveBeenCalledWith('older');

    publish([newer]);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /飞书公司/ }).getAttribute('aria-current')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '打开完整管理页' }));
    expect(onOpenManager).toHaveBeenLastCalledWith('newer');
  });
});
