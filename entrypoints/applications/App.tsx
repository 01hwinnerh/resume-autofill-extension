import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { APPLICATION_STAGE_PRESETS, applicationStageTone, type ApplicationEvent, type ApplicationRecord, type ApplicationStageId } from '../../src/shared/application-record';
import { ApplicationStore } from '../../src/storage/application-store';
import { LocalStorage } from '../../src/storage/local-storage';
import { StagePicker } from './StagePicker';

const store = new ApplicationStore(new LocalStorage());
const DEFAULT_STAGE: ApplicationStageId = 'written_test';
const LIST_WIDTH_KEY = 'resume-autofill.applications.list-width';
const MIN_LIST_WIDTH = 304;
const DETAIL_MIN_WIDTH = 520;

type WorkspaceStyle = CSSProperties & { '--list-width': string };

function maxListWidth(): number {
  return Math.max(MIN_LIST_WIDTH, Math.min(760, window.innerWidth * 0.55, window.innerWidth - DETAIL_MIN_WIDTH));
}
function clampListWidth(value: number): number {
  return Math.round(Math.min(Math.max(value, MIN_LIST_WIDTH), maxListWidth()));
}
function initialListWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(LIST_WIDTH_KEY));
    return clampListWidth(Number.isFinite(stored) && stored > 0 ? stored : 380);
  } catch { return clampListWidth(380); }
}
function persistListWidth(value: number) {
  try { window.localStorage.setItem(LIST_WIDTH_KEY, String(value)); } catch { /* Browser storage may be unavailable in restricted contexts. */ }
}
type SortOrder = 'updated-desc' | 'applied-desc' | 'applied-asc';
type EventDraft = { stage: ApplicationStageId; label: string; occurredAt: string; note: string };
type RecordDraft = { company: string; role: string; url: string; appliedAt: string };

function displayTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function toIso(value: string): string | undefined { return value ? new Date(value).toISOString() : undefined; }
function toLocal(value: string): string { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function hostname(value: string): string { try { return new URL(value).host; } catch { return ''; } }
function urlError(value: string): string {
  if (!value.trim()) return '';
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? '' : '职位链接仅支持 http/https'; }
  catch { return '请输入有效的 http/https 职位链接'; }
}
function sameRecordDraft(draft: RecordDraft, record?: ApplicationRecord): boolean {
  return !!record && draft.company === record.company && draft.role === record.role && draft.url === record.url && draft.appliedAt === toLocal(record.appliedAt);
}
function sameEventDraft(draft: EventDraft, event?: ApplicationEvent): boolean {
  return !!event && draft.stage === event.stage && draft.label === (event.stage === 'custom' ? event.label : '') && draft.occurredAt === toLocal(event.occurredAt) && draft.note === (event.note ?? '');
}
export function confirmDiscardChanges(confirmFn: typeof window.confirm = window.confirm): boolean {
  return confirmFn('当前有未保存的修改。放弃修改并继续？\n选择“取消”可继续编辑。');
}
export function selectApplicationAfterStorageChange(previous: ApplicationRecord[], next: ApplicationRecord[], currentId: string, queryId?: string): string {
  if (queryId && next.some((item) => item.id === queryId)) return queryId;
  const previousIds = new Set(previous.map((item) => item.id));
  const added = next.find((item) => !previousIds.has(item.id));
  if (added) return added.id;
  return next.some((item) => item.id === currentId) ? currentId : next[0]?.id ?? '';
}

export default function App() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('updated-desc');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'status' | 'alert'>('status');
  const [showNew, setShowNew] = useState(false);
  const [duplicate, setDuplicate] = useState<ApplicationRecord | undefined>();
  const [newRecord, setNewRecord] = useState({ company: '', role: '', url: '', appliedAt: '' });
  const [stage, setStage] = useState<ApplicationStageId>(DEFAULT_STAGE);
  const [customStage, setCustomStage] = useState('');
  const [stageTime, setStageTime] = useState('');
  const [note, setNote] = useState('');
  const [editingRecord, setEditingRecord] = useState(false);
  const [recordDraft, setRecordDraft] = useState<RecordDraft>({ company: '', role: '', url: '', appliedAt: '' });
  const [recordUrlError, setRecordUrlError] = useState('');
  const [editingEventId, setEditingEventId] = useState('');
  const [eventDraft, setEventDraft] = useState<EventDraft>({ stage: 'applied', label: '', occurredAt: '', note: '' });
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [compactView, setCompactView] = useState<'list' | 'detail'>(() => new URLSearchParams(window.location.search).has('id') ? 'detail' : 'list');
  const [listExpanded, setListExpanded] = useState(false);
  const [listWidth, setListWidth] = useState(initialListWidth);
  const workspaceRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const splitListScrollRef = useRef(0);
  const expandedListScrollRef = useRef<number | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);

  const selected = records.find((item) => item.id === selectedId);
  const editedEvent = selected?.events.find((item) => item.id === editingEventId);
  const recordDirty = editingRecord && !sameRecordDraft(recordDraft, selected);
  const eventDirty = Boolean(editingEventId) && !sameEventDraft(eventDraft, editedEvent);
  const stageDirty = stage !== DEFAULT_STAGE || Boolean(customStage.trim() || stageTime || note.trim());
  const dirty = recordDirty || eventDirty || stageDirty;

  function setFeedback(value: string, kind: 'status' | 'alert' = 'status') { setMessage(value); setMessageKind(kind); }
  function updateUrl(id: string, mode: 'push' | 'replace') {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({ applicationId: id }, '', url);
  }
  function clearDrafts() {
    setEditingRecord(false); setEditingEventId(''); setStage(DEFAULT_STAGE); setCustomStage(''); setStageTime(''); setNote(''); setRecordUrlError('');
  }
  function canLeaveDrafts(): boolean { return !dirty || confirmDiscardChanges(); }
  function resetDetailScroll() {
    const detail = detailRef.current;
    if (!detail) return;
    detail.scrollTop = 0;
    detail.scrollTo?.(0, 0);
  }
  function selectRecord(id: string, historyMode: 'push' | 'replace' | 'none' = 'push'): boolean {
    if (id === selectedId && !listExpanded && (!compact || compactView === 'detail')) return true;
    if (!canLeaveDrafts()) return false;
    const closingExpandedList = listExpanded;
    if (closingExpandedList) expandedListScrollRef.current = listRef.current?.scrollTop ?? 0;
    clearDrafts(); setMessage(''); setSelectedId(id); setCompactView('detail'); setListExpanded(false);
    if (historyMode !== 'none') updateUrl(id, historyMode);
    requestAnimationFrame(() => {
      resetDetailScroll();
      if (closingExpandedList) listRef.current?.querySelector<HTMLElement>('.record-row.active')?.scrollIntoView?.({ block: 'nearest' });
      detailTitleRef.current?.focus({ preventScroll: true });
    });
    return true;
  }
  function resizeList(value: number) {
    const next = clampListWidth(value);
    setListWidth(next);
    persistListWidth(next);
  }
  function beginListResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (compact || listExpanded) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = listWidth;
    let latestWidth = startWidth;
    document.body.classList.add('is-resizing-list');
    const onMove = (moveEvent: PointerEvent) => {
      latestWidth = clampListWidth(startWidth + moveEvent.clientX - startX);
      setListWidth(latestWidth);
    };
    const onEnd = () => {
      document.body.classList.remove('is-resizing-list');
      persistListWidth(latestWidth);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }
  function onListResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | undefined;
    if (event.key === 'ArrowLeft') next = listWidth - (event.shiftKey ? 48 : 16);
    if (event.key === 'ArrowRight') next = listWidth + (event.shiftKey ? 48 : 16);
    if (event.key === 'Home') next = MIN_LIST_WIDTH;
    if (event.key === 'End') next = maxListWidth();
    if (next === undefined) return;
    event.preventDefault();
    resizeList(next);
  }
  function toggleListExpanded(): boolean {
    if (listExpanded) {
      expandedListScrollRef.current = listRef.current?.scrollTop ?? 0;
      setListExpanded(false);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = splitListScrollRef.current;
        detailTitleRef.current?.focus({ preventScroll: true });
      });
      return true;
    }
    if (!canLeaveDrafts()) return false;
    splitListScrollRef.current = listRef.current?.scrollTop ?? 0;
    const expandedScrollTop = expandedListScrollRef.current ?? splitListScrollRef.current;
    clearDrafts(); setMessage(''); setListExpanded(true);
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = expandedScrollTop;
      listRef.current?.focus({ preventScroll: true });
    });
    return true;
  }
  function returnToList(historyMode: 'replace' | 'none' = 'replace'): boolean {
    if (!canLeaveDrafts()) return false;
    clearDrafts(); setMessage(''); setCompactView('list');
    if (historyMode === 'replace') updateUrl('', 'replace');
    requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    return true;
  }
  async function refresh(preferredId?: string) {
    try {
      const next = await store.list(); setRecords(next);
      setSelectedId((current) => {
        const nextId = preferredId && next.some((item) => item.id === preferredId) ? preferredId : next.some((item) => item.id === current) ? current : next[0]?.id ?? '';
        if (preferredId && preferredId !== nextId) updateUrl(nextId, 'replace');
        return nextId;
      });
    } catch (error) { setFeedback(error instanceof Error ? error.message : '读取投递记录失败，已保留当前列表', 'alert'); }
  }

  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get('id') ?? undefined;
    void refresh(queryId);
    return store.subscribe((next) => {
      setRecords((previous) => {
        const currentQueryId = new URLSearchParams(window.location.search).get('id') ?? undefined;
        setSelectedId((current) => {
          const nextId = selectApplicationAfterStorageChange(previous, next, current, currentQueryId);
          if (nextId !== current || (currentQueryId && currentQueryId !== nextId)) updateUrl(nextId, 'replace');
          return nextId;
        });
        return next;
      });
    }, (error) => setFeedback(`${error.message} 已保留当前列表，未覆盖本地数据。`, 'alert'));
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => { setCompact(media.matches); setListWidth((current) => clampListWidth(current)); if (media.matches) setListExpanded(false); }; update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const onPopState = () => {
      const id = new URLSearchParams(window.location.search).get('id') ?? '';
      if (dirty && !confirmDiscardChanges()) { updateUrl(selectedId, 'replace'); return; }
      clearDrafts(); setMessage(''); setListExpanded(false);
      if (id && records.some((item) => item.id === id)) { setSelectedId(id); setCompactView('detail'); requestAnimationFrame(resetDetailScroll); }
      else { const fallback = records[0]?.id ?? ''; setSelectedId(fallback); setCompactView('list'); if (id) updateUrl(fallback, 'replace'); }
    };
    window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState);
  }, [dirty, records, selectedId]);
  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventUnload); return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return records.filter((item) => (!needle || `${item.company} ${item.role} ${item.currentStageLabel}`.toLocaleLowerCase().includes(needle)) && (stageFilter === 'all' || item.currentStage === stageFilter))
      .sort((a, b) => sortOrder === 'updated-desc' ? b.updatedAt.localeCompare(a.updatedAt) : sortOrder === 'applied-desc' ? b.appliedAt.localeCompare(a.appliedAt) : a.appliedAt.localeCompare(b.appliedAt));
  }, [records, query, stageFilter, sortOrder]);
  const selectedVisible = Boolean(selected && filtered.some((item) => item.id === selected.id));
  const hasFilters = Boolean(query.trim() || stageFilter !== 'all');
  useEffect(() => { if (selectedId && (!compact || compactView === 'detail')) detailTitleRef.current?.focus({ preventScroll: true }); }, [selectedId, compact, compactView]);

  async function createRecord(force = false) {
    const invalid = urlError(newRecord.url); setRecordUrlError(invalid); if (invalid) return;
    setFeedback('');
    try {
      if (!force) {
        const duplicates = await store.findDuplicates({ ...newRecord, sourceHost: hostname(newRecord.url), appliedAt: toIso(newRecord.appliedAt) });
        if (duplicates[0]) { setDuplicate(duplicates[0]); return; }
      }
      const created = await store.create({ ...newRecord, sourceHost: hostname(newRecord.url), appliedAt: toIso(newRecord.appliedAt) });
      setNewRecord({ company: '', role: '', url: '', appliedAt: '' }); setDuplicate(undefined); setShowNew(false); await refresh(created.id); selectRecord(created.id, 'replace'); setFeedback('投递记录已创建。');
    } catch (error) { setFeedback(error instanceof Error ? error.message : '创建失败，请重试', 'alert'); }
  }
  async function addStage() {
    if (!selected) return;
    if (stage === 'custom' && !customStage.trim()) { setFeedback('请输入自定义阶段名称', 'alert'); return; }
    try { await store.addEvent(selected.id, { stage, label: stage === 'custom' ? customStage : undefined, occurredAt: toIso(stageTime), note }); setStage(DEFAULT_STAGE); setStageTime(''); setNote(''); setCustomStage(''); setFeedback('阶段已更新并写入时间线。'); await refresh(selected.id); }
    catch (error) { setFeedback(error instanceof Error ? error.message : '阶段更新失败', 'alert'); }
  }
  function beginRecordEdit(record: ApplicationRecord) { setRecordDraft({ company: record.company, role: record.role, url: record.url, appliedAt: toLocal(record.appliedAt) }); setRecordUrlError(''); setEditingRecord(true); }
  async function saveRecord() {
    if (!selected) return; const invalid = urlError(recordDraft.url); setRecordUrlError(invalid); if (invalid) return;
    if (!recordDraft.company.trim() || !recordDraft.role.trim()) { setFeedback('请填写公司和职位名称', 'alert'); return; }
    try {
      await store.updateRecord(selected.id, { company: recordDraft.company, role: recordDraft.role, url: recordDraft.url });
      const appliedEvent = selected.events.find((event) => event.stage === 'applied') ?? selected.events[0];
      if (appliedEvent && recordDraft.appliedAt !== toLocal(selected.appliedAt)) await store.updateEvent(selected.id, appliedEvent.id, { stage: appliedEvent.stage, label: appliedEvent.stage === 'custom' ? appliedEvent.label : undefined, occurredAt: toIso(recordDraft.appliedAt), note: appliedEvent.note });
      setEditingRecord(false); setFeedback('投递信息已保存。'); await refresh(selected.id);
    } catch (error) { setFeedback(error instanceof Error ? error.message : '保存失败', 'alert'); }
  }
  function beginEventEdit(event: ApplicationEvent) { setEditingEventId(event.id); setEventDraft({ stage: event.stage, label: event.stage === 'custom' ? event.label : '', occurredAt: toLocal(event.occurredAt), note: event.note ?? '' }); }
  async function saveEvent() {
    if (!selected || !editingEventId) return;
    if (eventDraft.stage === 'custom' && !eventDraft.label.trim()) { setFeedback('请输入自定义阶段名称', 'alert'); return; }
    try { await store.updateEvent(selected.id, editingEventId, { stage: eventDraft.stage, label: eventDraft.label, occurredAt: toIso(eventDraft.occurredAt), note: eventDraft.note }); setEditingEventId(''); setFeedback('时间线节点已保存，当前阶段已重新计算。'); await refresh(selected.id); }
    catch (error) { setFeedback(error instanceof Error ? error.message : '节点保存失败', 'alert'); }
  }
  async function removeEvent(event: ApplicationEvent) {
    if (!selected) return;
    if (selected.events.length <= 1) { setFeedback('不能删除唯一的时间线节点；若整条记录误建，请使用“删除记录”。', 'alert'); return; }
    if (!window.confirm(`确定删除“${event.label}”节点吗？删除后当前阶段会按剩余时间线自动回退。`)) return;
    try { await store.removeEvent(selected.id, event.id); setEditingEventId(''); setFeedback('节点已删除，当前阶段已重新计算。'); await refresh(selected.id); }
    catch (error) { setFeedback(error instanceof Error ? error.message : '节点删除失败', 'alert'); }
  }
  async function undoLatest() {
    if (!selected) return; const sortedEvents = [...selected.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); const latest = sortedEvents[sortedEvents.length - 1];
    if (!latest || selected.events.length <= 1) { setFeedback('当前只有初始投递节点，无法撤销；若整条记录误建，请删除记录。', 'alert'); return; }
    if (!window.confirm(`撤销最近一次本地进度“${latest.label}”吗？此操作只修改本地记录。`)) return;
    await store.removeEvent(selected.id, latest.id); setFeedback('已撤销最近一次本地进度，当前阶段已回退。'); await refresh(selected.id);
  }
  async function removeRecord(record: ApplicationRecord) {
    if (dirty && !confirmDiscardChanges()) return;
    if (!window.confirm(`确定删除“${record.company} · ${record.role}”及其完整时间线吗？`)) return;
    await store.delete(record.id); clearDrafts(); setFeedback('记录已删除。'); await refresh();
  }
  function clearFilters() { setQuery(''); setStageFilter('all'); }
  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      const candidate = filtered[0];
      if (!candidate) return;
      event.preventDefault();
      selectRecord(candidate.id);
      return;
    }
    if (event.key === 'ArrowDown' && filtered.length) {
      event.preventDefault();
      listRef.current?.querySelector<HTMLButtonElement>('.record-row')?.focus();
    }
  }
  function onListKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('.record-row') ?? [])]; const index = rows.indexOf(event.currentTarget); rows[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
  }
  const timelineEvents = selected ? [...selected.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) : [];
  const stageFields = (draft: EventDraft, setDraft: (value: EventDraft) => void) => <div className="stage-grid"><label>阶段<StagePicker value={draft.stage} onChange={(stage) => setDraft({ ...draft, stage })} label="编辑节点阶段" /></label>{draft.stage === 'custom' && <label>阶段名称<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>}<label>发生时间<input type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label><label className="wide">备注<textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label></div>;

  return <main className={`applications-page ${compact ? 'is-compact' : ''} view-${compactView}`}>
    <header className="page-header"><div className="brand-mark">简</div><div><h1>投递记录</h1><p>手动确认真实投递，持续记录每一次流程变化</p></div><button onClick={() => { setDuplicate(undefined); setShowNew(true); }}>＋ 手动新增</button></header>
    {showNew && <div className="dialog-backdrop" role="presentation"><section className="new-record card" role="dialog" aria-modal="true" aria-labelledby="new-record-title"><div><h2 id="new-record-title">新增投递记录</h2><p>适合补录没有通过扩展填写的申请。</p></div><div className="form-grid"><label>公司<input value={newRecord.company} onChange={(e) => setNewRecord({ ...newRecord, company: e.target.value })} /></label><label>职位<input value={newRecord.role} onChange={(e) => setNewRecord({ ...newRecord, role: e.target.value })} /></label><label className="wide">职位链接<input aria-invalid={Boolean(recordUrlError)} value={newRecord.url} onChange={(e) => { setNewRecord({ ...newRecord, url: e.target.value }); setRecordUrlError(''); }} placeholder="https://..." />{recordUrlError && <small role="alert">{recordUrlError}</small>}</label><label>投递时间<input type="datetime-local" value={newRecord.appliedAt} onChange={(e) => setNewRecord({ ...newRecord, appliedAt: e.target.value })} /></label></div>{duplicate && <div className="duplicate-warning" role="alert"><strong>发现相同公司和职位的近期记录</strong><span>{duplicate.company} · {duplicate.role}</span><div className="form-actions"><button onClick={() => { setShowNew(false); setDuplicate(undefined); selectRecord(duplicate.id); }}>查看现有记录</button><button className="primary" onClick={() => void createRecord(true)}>仍然新增</button></div></div>}<div className="form-actions"><button className="secondary" onClick={() => { setShowNew(false); setDuplicate(undefined); }}>取消</button><button className="primary" disabled={!newRecord.company.trim() || !newRecord.role.trim()} onClick={() => void createRecord()}>保存记录</button></div></section></div>}
    <section ref={workspaceRef} className={`workspace ${listExpanded ? 'list-expanded' : ''}`} style={{ '--list-width': `${listWidth}px` } as WorkspaceStyle}>
      <aside className="record-list" ref={listRef} tabIndex={-1} aria-label="投递列表"><div className="list-heading"><div className="list-title-row"><div><strong>全部申请</strong><span>{filtered.length}/{records.length} 条</span></div><button type="button" className="list-expand-button" aria-pressed={listExpanded} onClick={() => toggleListExpanded()}>{listExpanded ? '收起列表' : '展开列表'}</button></div><div className="list-tools"><input aria-label="搜索投递记录" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKeyDown} placeholder="搜索后按 Enter 打开" /><select aria-label="按阶段筛选" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option value="all">全部阶段</option>{APPLICATION_STAGE_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}<option value="custom">自定义阶段</option></select><select aria-label="投递记录排序" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)}><option value="updated-desc">最近更新</option><option value="applied-desc">最近投递</option><option value="applied-asc">最早投递</option></select></div></div>{records.length === 0 ? <div className="empty"><strong>还没有投递记录</strong><span>完成真实提交后再记录；也可以手动新增。</span><button className="primary" onClick={() => setShowNew(true)}>手动新增</button></div> : filtered.length === 0 ? <div className="empty"><strong>没有符合筛选条件的记录</strong><span>调整搜索词或阶段后再试。</span><button onClick={clearFilters}>清除筛选</button></div> : filtered.map((record) => <button className={`record-row ${record.id === selectedId ? 'active' : ''}`} aria-pressed={record.id === selectedId} key={record.id} onKeyDown={onListKeyDown} onClick={() => selectRecord(record.id)}><span><strong>{record.company}</strong><small>{record.role}</small></span><b className={`stage-chip stage-tone-${applicationStageTone(record.currentStage, record.currentStageLabel)}`}>{record.currentStageLabel}</b><time>{displayTime(record.updatedAt)}</time></button>)}</aside>
      <div className="workspace-splitter" role="separator" aria-label="调整投递列表宽度" aria-orientation="vertical" aria-valuemin={MIN_LIST_WIDTH} aria-valuemax={maxListWidth()} aria-valuenow={listWidth} tabIndex={0} onPointerDown={beginListResize} onKeyDown={onListResizeKeyDown} onDoubleClick={() => resizeList(380)}><i aria-hidden="true" /></div>
      <section className="record-detail" ref={detailRef} aria-label="投递详情"><button className="back-to-list" onClick={() => returnToList()}>← 返回投递列表</button>{!selected ? <div className="empty"><strong>选择一条记录查看详情</strong></div> : <>{!selectedVisible && hasFilters && dirty && <div className="filter-warning" role="status">当前记录不在筛选结果中。完成或放弃修改后可切换到筛选结果。 <button onClick={clearFilters}>清除筛选</button></div>}{message && <p className={`notice ${messageKind}`} role={messageKind}>{message}</p>}
        <header className="detail-header">{editingRecord ? <div className="form-grid"><label>公司<input value={recordDraft.company} onChange={(e) => setRecordDraft({ ...recordDraft, company: e.target.value })} /></label><label>职位<input value={recordDraft.role} onChange={(e) => setRecordDraft({ ...recordDraft, role: e.target.value })} /></label><label className="wide">职位链接<input aria-invalid={Boolean(recordUrlError)} value={recordDraft.url} onChange={(e) => { setRecordDraft({ ...recordDraft, url: e.target.value }); setRecordUrlError(''); }} />{recordUrlError && <small role="alert">{recordUrlError}</small>}</label><label>投递时间<input type="datetime-local" value={recordDraft.appliedAt} onChange={(e) => setRecordDraft({ ...recordDraft, appliedAt: e.target.value })} /></label><div className="form-actions wide"><button onClick={() => setEditingRecord(false)}>取消</button><button className="primary" onClick={() => void saveRecord()}>保存</button></div></div> : <div><span className={`stage-badge stage-tone-${applicationStageTone(selected.currentStage, selected.currentStageLabel)}`}>{selected.currentStageLabel}</span><h2 ref={detailTitleRef} tabIndex={-1}>{selected.company}</h2><p>{selected.role}</p><time>投递于 {displayTime(selected.appliedAt)}</time></div>}<div>{!editingRecord && <><button onClick={() => beginRecordEdit(selected)}>编辑信息</button>{selected.url && <a href={selected.url} target="_blank" rel="noreferrer">打开职位页面</a>}<button className="danger" onClick={() => void removeRecord(selected)}>删除记录</button></>}</div></header>
        <section className="stage-editor"><div className="section-heading"><div><h3>更新进度</h3><p>仅记录本地时间线，不会从招聘网站撤回申请。</p></div><span>{timelineEvents.length} 个节点</span></div><div className="stage-grid"><label>阶段<StagePicker value={stage} onChange={setStage} label="更新进度阶段" /></label>{stage === 'custom' && <label>阶段名称<input value={customStage} onChange={(e) => setCustomStage(e.target.value)} /></label>}<label>发生时间<input type="datetime-local" value={stageTime} onChange={(e) => setStageTime(e.target.value)} /></label><label className="wide">备注<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label></div><div className="form-actions"><button className="secondary" disabled={timelineEvents.length <= 1} onClick={() => void undoLatest()}>撤销最近一次进度</button><button className="primary" onClick={() => void addStage()}>追加到时间线</button></div></section>
        <section className="timeline-overview" aria-label="阶段进度概览"><div className="timeline-track">{timelineEvents.map((event, index) => <div className={`timeline-node stage-tone-${applicationStageTone(event.stage, event.label)} ${index === timelineEvents.length - 1 ? 'current' : ''}`} key={event.id} aria-current={index === timelineEvents.length - 1 ? 'step' : undefined}><i /><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></div>)}</div></section>
        <section className="timeline"><h3>完整时间线</h3><ol aria-label="投递进度">{[...timelineEvents].reverse().map((event, index) => <li className={`stage-tone-${applicationStageTone(event.stage, event.label)}`} key={event.id} aria-current={index === 0 ? 'step' : undefined}><i className={index === 0 ? 'current' : ''} /><div>{editingEventId === event.id ? <>{stageFields(eventDraft, setEventDraft)}<div className="form-actions"><button onClick={() => setEditingEventId('')}>取消</button><button className="primary" onClick={() => void saveEvent()}>保存节点</button></div></> : <><header><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></header>{event.note && <p>{event.note}</p>}<div className="form-actions"><button aria-label={`编辑时间线节点：${event.label}`} onClick={() => beginEventEdit(event)}>编辑</button><button className="danger" aria-label={`删除时间线节点：${event.label}`} disabled={timelineEvents.length <= 1} title={timelineEvents.length <= 1 ? '唯一节点不能删除，请删除整条记录' : undefined} onClick={() => void removeEvent(event)}>删除</button></div></>}</div></li>)}</ol></section>
      </>}</section>
    </section>
  </main>;
}
