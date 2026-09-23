import { useEffect, useMemo, useState } from 'react';
import { APPLICATION_STAGE_PRESETS, type ApplicationEvent, type ApplicationRecord, type ApplicationStageId } from '../../src/shared/application-record';
import { ApplicationStore } from '../../src/storage/application-store';
import { LocalStorage } from '../../src/storage/local-storage';

const store = new ApplicationStore(new LocalStorage());
function displayTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function toIso(value: string): string | undefined { return value ? new Date(value).toISOString() : undefined; }
function toLocal(value: string): string { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function hostname(value: string): string { try { return new URL(value).host; } catch { return ''; } }
function urlError(value: string): string {
  if (!value.trim()) return '';
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? '' : '职位链接仅支持 http/https'; }
  catch { return '请输入有效的 http/https 职位链接'; }
}

type EventDraft = { stage: ApplicationStageId; label: string; occurredAt: string; note: string };

export default function App() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]); const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState(''); const [message, setMessage] = useState(''); const [showNew, setShowNew] = useState(false);
  const [newRecord, setNewRecord] = useState({ company: '', role: '', url: '', appliedAt: '' });
  const [stage, setStage] = useState<ApplicationStageId>('written_test'); const [customStage, setCustomStage] = useState(''); const [stageTime, setStageTime] = useState(''); const [note, setNote] = useState('');
  const [editingRecord, setEditingRecord] = useState(false); const [recordDraft, setRecordDraft] = useState({ company: '', role: '', url: '' }); const [recordUrlError, setRecordUrlError] = useState('');
  const [editingEventId, setEditingEventId] = useState(''); const [eventDraft, setEventDraft] = useState<EventDraft>({ stage: 'applied', label: '', occurredAt: '', note: '' });

  async function refresh(preferredId?: string) {
    try {
      const next = await store.list();
      setRecords(next);
      setSelectedId((current) => preferredId && next.some((item) => item.id === preferredId)
        ? preferredId
        : next.some((item) => item.id === current) ? current : next[0]?.id ?? '');
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取投递记录失败，已保留当前列表'); }
  }
  useEffect(() => {
    const queryId = new URLSearchParams(window.location.search).get('id') ?? undefined;
    void refresh(queryId);
    return store.subscribe((next) => {
      setRecords(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? '');
      setMessage('投递记录已更新。');
    }, (error) => setMessage(`${error.message} 已保留当前列表，未覆盖本地数据。`));
  }, []);
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase(); return needle ? records.filter((item) => `${item.company} ${item.role} ${item.currentStageLabel}`.toLocaleLowerCase().includes(needle)) : records; }, [records, query]);
  const selected = records.find((item) => item.id === selectedId);
  const timelineEvents = useMemo(() => selected ? [...selected.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) : [], [selected]);

  async function createRecord() {
    const invalid = urlError(newRecord.url); setRecordUrlError(invalid); if (invalid) return;
    setMessage('');
    try { const created = await store.create({ ...newRecord, sourceHost: hostname(newRecord.url), appliedAt: toIso(newRecord.appliedAt) }); setNewRecord({ company: '', role: '', url: '', appliedAt: '' }); setShowNew(false); setMessage('投递记录已创建。'); await refresh(created.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '创建失败，请重试'); }
  }

  async function addStage() {
    if (!selected) return;
    if (stage === 'custom' && !customStage.trim()) { setMessage('请输入自定义阶段名称'); return; }
    try { await store.addEvent(selected.id, { stage, label: stage === 'custom' ? customStage : undefined, occurredAt: toIso(stageTime), note }); setStageTime(''); setNote(''); setCustomStage(''); setMessage('阶段已更新并写入时间线。'); await refresh(selected.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '阶段更新失败'); }
  }

  function beginRecordEdit(record: ApplicationRecord) { setRecordDraft({ company: record.company, role: record.role, url: record.url }); setRecordUrlError(''); setEditingRecord(true); }
  async function saveRecord() {
    if (!selected) return; const invalid = urlError(recordDraft.url); setRecordUrlError(invalid); if (invalid) return;
    if (!recordDraft.company.trim() || !recordDraft.role.trim()) { setMessage('请填写公司和职位名称'); return; }
    try { await store.updateRecord(selected.id, recordDraft); setEditingRecord(false); setMessage('投递信息已保存。'); await refresh(selected.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
  }
  function beginEventEdit(event: ApplicationEvent) { setEditingEventId(event.id); setEventDraft({ stage: event.stage, label: event.stage === 'custom' ? event.label : '', occurredAt: toLocal(event.occurredAt), note: event.note ?? '' }); }
  async function saveEvent() {
    if (!selected || !editingEventId) return;
    if (eventDraft.stage === 'custom' && !eventDraft.label.trim()) { setMessage('请输入自定义阶段名称'); return; }
    try { await store.updateEvent(selected.id, editingEventId, { stage: eventDraft.stage, label: eventDraft.label, occurredAt: toIso(eventDraft.occurredAt), note: eventDraft.note }); setEditingEventId(''); setMessage('时间线节点已保存，当前阶段已重新计算。'); await refresh(selected.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '节点保存失败'); }
  }
  async function removeEvent(event: ApplicationEvent) {
    if (!selected) return;
    if (selected.events.length <= 1) { setMessage('不能删除唯一的时间线节点；若整条记录误建，请使用“删除记录”。'); return; }
    if (!confirm(`确定删除“${event.label}”节点吗？删除后当前阶段会按剩余时间线自动回退。`)) return;
    try { await store.removeEvent(selected.id, event.id); setMessage('节点已删除，当前阶段已重新计算。'); await refresh(selected.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : '节点删除失败'); }
  }
  async function undoLatest() {
    if (!selected) return; const latest = timelineEvents[timelineEvents.length - 1];
    if (!latest || timelineEvents.length <= 1) { setMessage('当前只有初始投递节点，无法撤销；若整条记录误建，请删除记录。'); return; }
    if (!confirm(`撤销最近一次本地进度“${latest.label}”吗？此操作只修改本地记录。`)) return;
    await store.removeEvent(selected.id, latest.id); setMessage('已撤销最近一次本地进度，当前阶段已回退。'); await refresh(selected.id);
  }
  async function removeRecord(record: ApplicationRecord) { if (!confirm(`确定删除“${record.company} · ${record.role}”及其完整时间线吗？`)) return; await store.delete(record.id); setMessage('记录已删除。'); await refresh(); }

  const stageFields = (draft: EventDraft, setDraft: (value: EventDraft) => void) => <div className="stage-grid"><label>阶段<select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as ApplicationStageId })}>{APPLICATION_STAGE_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}<option value="custom">自定义阶段</option></select></label>{draft.stage === 'custom' && <label>阶段名称<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>}<label>发生时间<input type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label><label className="wide">备注<textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label></div>;

  return <main className="applications-page">
    <header className="page-header"><div className="brand-mark">简</div><div><h1>投递记录</h1><p>手动确认真实投递，持续记录每一次流程变化</p></div><button onClick={() => setShowNew((value) => !value)}>＋ 手动新增</button></header>
    {showNew && <section className="new-record card"><div><h2>新增投递记录</h2><p>适合补录没有通过扩展填写的申请。</p></div><div className="form-grid"><label>公司<input value={newRecord.company} onChange={(e) => setNewRecord({ ...newRecord, company: e.target.value })} /></label><label>职位<input value={newRecord.role} onChange={(e) => setNewRecord({ ...newRecord, role: e.target.value })} /></label><label className="wide">职位链接<input aria-invalid={Boolean(recordUrlError)} value={newRecord.url} onChange={(e) => { setNewRecord({ ...newRecord, url: e.target.value }); setRecordUrlError(''); }} placeholder="https://..." />{recordUrlError && <small role="alert">{recordUrlError}</small>}</label><label>投递时间<input type="datetime-local" value={newRecord.appliedAt} onChange={(e) => setNewRecord({ ...newRecord, appliedAt: e.target.value })} /></label></div><div className="form-actions"><button className="secondary" onClick={() => setShowNew(false)}>取消</button><button className="primary" disabled={!newRecord.company.trim() || !newRecord.role.trim()} onClick={() => void createRecord()}>保存记录</button></div></section>}
    {message && <p className="notice" role="status">{message}</p>}
    <section className="workspace"><aside className="record-list card"><div className="list-heading"><div><strong>全部申请</strong><span>{records.length} 条</span></div><input aria-label="搜索投递记录" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索公司、职位或阶段" /></div>{filtered.length === 0 ? <div className="empty"><strong>还没有投递记录</strong><span>完成真实提交后再记录；也可以手动新增。</span></div> : filtered.map((record) => <button className={`record-row ${record.id === selectedId ? 'active' : ''}`} key={record.id} onClick={() => { setSelectedId(record.id); setEditingRecord(false); setEditingEventId(''); }}><span><strong>{record.company}</strong><small>{record.role}</small></span><b>{record.currentStageLabel}</b><time>{displayTime(record.updatedAt)}</time></button>)}</aside>
      <section className="record-detail card">{!selected ? <div className="empty"><strong>选择一条记录查看详情</strong></div> : <>
        <header className="detail-header">{editingRecord ? <div className="form-grid"><label>公司<input value={recordDraft.company} onChange={(e) => setRecordDraft({ ...recordDraft, company: e.target.value })} /></label><label>职位<input value={recordDraft.role} onChange={(e) => setRecordDraft({ ...recordDraft, role: e.target.value })} /></label><label className="wide">职位链接<input aria-invalid={Boolean(recordUrlError)} value={recordDraft.url} onChange={(e) => { setRecordDraft({ ...recordDraft, url: e.target.value }); setRecordUrlError(''); }} />{recordUrlError && <small role="alert">{recordUrlError}</small>}</label><div className="form-actions"><button onClick={() => setEditingRecord(false)}>取消</button><button className="primary" onClick={() => void saveRecord()}>保存</button></div></div> : <div><span className="stage-badge">{selected.currentStageLabel}</span><h2>{selected.company}</h2><p>{selected.role}</p></div>}<div>{!editingRecord && <><button onClick={() => beginRecordEdit(selected)}>编辑信息</button>{selected.url && <a href={selected.url} target="_blank" rel="noreferrer">打开职位页面</a>}<button className="danger" onClick={() => void removeRecord(selected)}>删除记录</button></>}</div></header>
        <section className="stage-editor"><div className="section-heading"><div><h3>更新进度</h3><p>仅记录本地时间线，不会从招聘网站撤回申请。</p></div><span>{timelineEvents.length} 个节点</span></div><div className="stage-grid"><label>阶段<select value={stage} onChange={(e) => setStage(e.target.value as ApplicationStageId)}>{APPLICATION_STAGE_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}<option value="custom">自定义阶段</option></select></label>{stage === 'custom' && <label>阶段名称<input value={customStage} onChange={(e) => setCustomStage(e.target.value)} /></label>}<label>发生时间<input type="datetime-local" value={stageTime} onChange={(e) => setStageTime(e.target.value)} /></label><label className="wide">备注<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label></div><div className="form-actions"><button className="secondary" disabled={timelineEvents.length <= 1} onClick={() => void undoLatest()}>撤销最近一次进度</button><button className="primary" onClick={() => void addStage()}>追加到时间线</button></div></section>
        <section className="timeline-overview" aria-label="阶段进度线"><div className="timeline-track">{timelineEvents.map((event, index) => <div className={`timeline-node ${index === timelineEvents.length - 1 ? 'current' : ''}`} key={event.id}><i /><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></div>)}</div></section>
        <section className="timeline"><h3>完整时间线</h3>{[...timelineEvents].reverse().map((event, index) => <article key={event.id}><i className={index === 0 ? 'current' : ''} /><div>{editingEventId === event.id ? <>{stageFields(eventDraft, setEventDraft)}<div className="form-actions"><button onClick={() => setEditingEventId('')}>取消</button><button className="primary" onClick={() => void saveEvent()}>保存节点</button></div></> : <><header><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></header>{event.note && <p>{event.note}</p>}<div className="form-actions"><button onClick={() => beginEventEdit(event)}>编辑</button><button className="danger" disabled={timelineEvents.length <= 1} title={timelineEvents.length <= 1 ? '唯一节点不能删除，请删除整条记录' : undefined} onClick={() => void removeEvent(event)}>删除</button></div></>}</div></article>)}</section>
      </>}</section></section>
  </main>;
}
