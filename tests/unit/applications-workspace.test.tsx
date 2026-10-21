import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { confirmDiscardChanges } from '../../entrypoints/applications/App';
import { APPLICATIONS_KEY } from '../../src/storage/application-store';
import type { ApplicationRecord } from '../../src/shared/application-record';

function record(id: string, company: string, stage: ApplicationRecord['currentStage'] = 'applied', appliedAt = '2026-01-01T08:00:00.000Z', updatedAt = appliedAt): ApplicationRecord {
  const label = stage === 'applied' ? '已投递' : stage === 'interview_1' ? '一面' : stage === 'offer' ? 'Offer' : stage === 'rejected' ? '未通过' : stage === 'withdrawn' ? '已撤回' : '笔试';
  return { id, company, role: `${company}工程师`, url: `https://${id}.example.com/job`, sourceHost: `${id}.example.com`, appliedAt, updatedAt, currentStage: stage, currentStageLabel: label, events: [{ id: `${id}-event`, stage, label, occurredAt: updatedAt }] };
}

let records: ApplicationRecord[];
let storageListeners: Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void>;

beforeEach(() => {
  records = [
    record('old', '旧公司', 'applied', '2025-01-01T08:00:00.000Z', '2025-01-02T08:00:00.000Z'),
    record('new', '新公司', 'interview_1', '2026-01-01T08:00:00.000Z', '2026-01-03T08:00:00.000Z'),
  ];
  storageListeners = [];
  window.localStorage.clear();
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  Object.defineProperty(globalThis, 'browser', { configurable: true, value: {
    storage: {
      local: { get: vi.fn(async () => ({ [APPLICATIONS_KEY]: { schemaVersion: 1, revision: 1, records } })), set: vi.fn(), remove: vi.fn() },
      onChanged: { addListener: vi.fn((listener) => storageListeners.push(listener)), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
  } });
  window.history.replaceState({}, '', '/applications.html');
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function renderReady() {
  render(<App />);
  await screen.findByRole('button', { name: /新公司/ });
}

describe('投递记录工作台', () => {
  it('从 URL id 初始化，主动选择 pushState，popstate 恢复选择', async () => {
    window.history.replaceState({}, '', '/applications.html?id=old');
    const push = vi.spyOn(window.history, 'pushState');
    await renderReady();
    expect(screen.getByRole('heading', { name: '旧公司' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /新公司/ }));
    expect(push).toHaveBeenCalled();
    expect(window.location.search).toBe('?id=new');
    window.history.replaceState({}, '', '/applications.html?id=old');
    fireEvent.popState(window);
    await waitFor(() => expect(screen.getByRole('heading', { name: '旧公司' })).toBeTruthy());
  });

  it('选择列表底部记录时保留列表 scrollTop 并把详情滚到顶部', async () => {
    await renderReady();
    const list = screen.getByRole('complementary', { name: '投递列表' });
    const detail = screen.getByRole('region', { name: '投递详情' });
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 240 });
    const scrollTo = vi.fn(); Object.defineProperty(detail, 'scrollTo', { configurable: true, value: scrollTo });
    fireEvent.click(screen.getByRole('button', { name: /旧公司/ }));
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
    expect(list.scrollTop).toBe(240);
  });

  it('支持搜索、阶段筛选、三种排序和筛选计数', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText('按阶段筛选'), { target: { value: 'interview_1' } });
    expect(screen.getByText('1/2 条')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /旧公司/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('按阶段筛选'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('投递记录排序'), { target: { value: 'applied-asc' } });
    const rows = screen.getAllByRole('button').filter((button) => button.classList.contains('record-row'));
    expect(rows[0]?.textContent).toContain('旧公司');
    fireEvent.change(screen.getByLabelText('搜索投递记录'), { target: { value: '不存在' } });
    expect(screen.getByText('没有符合筛选条件的记录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByText('2/2 条')).toBeTruthy();
  });

  it('桌面双栏分隔条支持键盘调整并持久化列表宽度', async () => {
    await renderReady();
    const separator = screen.getByRole('separator', { name: '调整投递列表宽度' });
    expect(separator.getAttribute('aria-valuenow')).toBe('380');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator.getAttribute('aria-valuenow')).toBe('396');
    expect(window.localStorage.getItem('resume-autofill.applications.list-width')).toBe('396');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator.getAttribute('aria-valuenow')).toBe('304');
  });

  it('桌面端可展开完整列表，选择公司后恢复详情，并保护未保存修改', async () => {
    const confirm = vi.mocked(globalThis.confirm);
    await renderReady();
    const workspace = document.querySelector('.workspace')!;
    const list = screen.getByRole('complementary', { name: '投递列表' });
    Object.defineProperty(list, 'scrollTop', { configurable: true, writable: true, value: 180 });

    fireEvent.click(screen.getByRole('button', { name: '编辑信息' }));
    fireEvent.change(screen.getByLabelText('公司'), { target: { value: '未保存公司' } });
    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '展开列表' }));
    expect(workspace.classList.contains('list-expanded')).toBe(false);

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: '展开列表' }));
    expect(workspace.classList.contains('list-expanded')).toBe(true);
    expect(screen.getByRole('button', { name: '收起列表' }).getAttribute('aria-pressed')).toBe('true');
    expect(list.scrollTop).toBe(180);

    fireEvent.change(screen.getByLabelText('搜索投递记录'), { target: { value: '旧公司' } });
    fireEvent.click(screen.getByRole('button', { name: /旧公司/ }));
    expect(workspace.classList.contains('list-expanded')).toBe(false);
    expect(screen.getByRole('heading', { name: '旧公司' })).toBeTruthy();
    expect((screen.getByLabelText('搜索投递记录') as HTMLInputElement).value).toBe('旧公司');
  });

  it('搜索只过滤，按 Enter 或点击结果后才切换详情', async () => {
    window.history.replaceState({}, '', '/applications.html?id=new');
    await renderReady();
    expect(screen.getByRole('heading', { name: '新公司' })).toBeTruthy();

    const search = screen.getByLabelText('搜索投递记录');
    fireEvent.change(search, { target: { value: '旧公司' } });
    expect(screen.getByText('1/2 条')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '新公司' })).toBeTruthy();
    fireEvent.blur(search);
    expect(screen.getByRole('heading', { name: '新公司' })).toBeTruthy();

    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('heading', { name: '旧公司' })).toBeTruthy());
  });

  it('uses semantic colors for active, offer, and terminal stages', async () => {
    records = [
      record('active', '进行中公司', 'applied', '2026-01-01T08:00:00.000Z', '2026-01-01T08:00:00.000Z'),
      record('offer', '录用公司', 'offer', '2026-01-02T08:00:00.000Z', '2026-01-02T08:00:00.000Z'),
      record('rejected', '终止公司', 'rejected', '2026-01-03T08:00:00.000Z', '2026-01-03T08:00:00.000Z'),
    ];
    render(<App />);

    const rejectedRow = await screen.findByRole('button', { name: /终止公司/ });
    expect(rejectedRow.querySelector('.stage-chip')?.classList.contains('stage-tone-red')).toBe(true);
    expect(screen.getByRole('button', { name: /录用公司/ }).querySelector('.stage-chip')?.classList.contains('stage-tone-green')).toBe(true);
    expect(screen.getByRole('button', { name: /进行中公司/ }).querySelector('.stage-chip')?.classList.contains('stage-tone-blue')).toBe(true);
    fireEvent.click(rejectedRow);
    await waitFor(() => expect(document.querySelector('.stage-badge')?.classList.contains('stage-tone-red')).toBe(true));
    expect(document.querySelector('.timeline-node')?.classList.contains('stage-tone-red')).toBe(true);
  });

  it('dirty 切换可取消或确认，并注册 beforeunload', async () => {
    const confirm = vi.mocked(globalThis.confirm); confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: '编辑信息' }));
    fireEvent.change(screen.getByLabelText('公司'), { target: { value: '尚未保存' } });
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /旧公司/ }));
    expect(screen.getByDisplayValue('尚未保存')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /旧公司/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '旧公司' })).toBeTruthy());
  });

  it('时间线具有列表语义且最新节点标记 aria-current', async () => {
    await renderReady();
    const timeline = screen.getByRole('list', { name: '投递进度' });
    expect(within(timeline).getByRole('listitem').getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /编辑时间线节点/ })).toBeTruthy();
  });

  it('区分空列表和无筛选结果', async () => {
    await renderReady();
    fireEvent.change(screen.getByLabelText('搜索投递记录'), { target: { value: '无匹配' } });
    expect(screen.getByText('没有符合筛选条件的记录')).toBeTruthy();
    cleanup(); records = []; render(<App />);
    expect(await screen.findByText('还没有投递记录')).toBeTruthy();
    expect(screen.getByRole('button', { name: '手动新增' })).toBeTruthy();
  });

  it('手动新增先提示重复并允许查看现有记录或仍然新增', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /手动新增/ }));
    fireEvent.change(screen.getByLabelText('公司'), { target: { value: '新公司' } });
    fireEvent.change(screen.getByLabelText('职位'), { target: { value: '新公司工程师' } });
    fireEvent.change(screen.getByLabelText('职位链接'), { target: { value: 'https://new.example.com/job' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
    expect(await screen.findByText('发现相同公司和职位的近期记录')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看现有记录' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '仍然新增' })).toBeTruthy();
  });

  it('窄屏从列表进入详情并可返回', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true, media: '(max-width: 900px)', addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)) });
    await renderReady();
    const page = document.querySelector('.applications-page')!;
    expect(page.classList.contains('view-list')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /新公司/ }));
    expect(page.classList.contains('view-detail')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /返回投递列表/ }));
    expect(page.classList.contains('view-list')).toBe(true);
  });
});

describe('confirmDiscardChanges', () => {
  it('通过可注入 confirm 返回用户决定', () => {
    const confirm = vi.fn(() => false);
    expect(confirmDiscardChanges(confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('放弃修改并继续'));
  });
});
