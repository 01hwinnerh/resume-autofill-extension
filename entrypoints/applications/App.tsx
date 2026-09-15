import { useEffect, useMemo, useState } from 'react';
import { APPLICATION_STAGE_PRESETS, type ApplicationRecord, type ApplicationStageId } from '../../src/shared/application-record';
import { ApplicationStore } from '../../src/storage/application-store';
import { LocalStorage } from '../../src/storage/local-storage';

const store = new ApplicationStore(new LocalStorage());

function displayTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function toIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function hostname(value: string): string {
  try { return new URL(value).host; } catch { return ''; }
}

export default function App() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newRecord, setNewRecord] = useState({ company: '', role: '', url: '', appliedAt: '' });
  const [stage, setStage] = useState<ApplicationStageId>('written_test');
  const [customStage, setCustomStage] = useState('');
  const [stageTime, setStageTime] = useState('');
  const [note, setNote] = useState('');

  async function refresh(preferredId?: string) {
    const next = await store.list();
    setRecords(next);
    setSelectedId((current) => preferredId ?? (next.some((item) => item.id === current) ? current : next[0]?.id ?? ''));
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? records.filter((item) => `${item.company} ${item.role} ${item.currentStageLabel}`.toLocaleLowerCase().includes(needle)) : records;
  }, [records, query]);
  const selected = records.find((item) => item.id === selectedId);
  const timelineEvents = useMemo(() => selected
    ? [...selected.events].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    : [], [selected]);

  async function createRecord() {
    setMessage('');
    try {
      const created = await store.create({
        company: newRecord.company,
        role: newRecord.role,
        url: newRecord.url,
        sourceHost: hostname(newRecord.url),
        appliedAt: toIso(newRecord.appliedAt),
      });
      setNewRecord({ company: '', role: '', url: '', appliedAt: '' });
      setShowNew(false);
      setMessage('投递记录已创建。');
      await refresh(created.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败，请重试');
    }
  }

  async function addStage() {
    if (!selected) return;
    if (stage === 'custom' && !customStage.trim()) { setMessage('请输入自定义阶段名称'); return; }
    try {
      await store.addEvent(selected.id, { stage, label: stage === 'custom' ? customStage : undefined, occurredAt: toIso(stageTime), note });
      setStageTime(''); setNote(''); setCustomStage(''); setMessage('阶段已更新并写入时间线。');
      await refresh(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '阶段更新失败');
    }
  }

  async function removeRecord(record: ApplicationRecord) {
    if (!confirm(`确定删除“${record.company} · ${record.role}”吗？`)) return;
    await store.delete(record.id);
    setMessage('记录已删除。');
    await refresh();
  }

  return <main className="applications-page">
    <header className="page-header"><div className="brand-mark">简</div><div><h1>投递记录</h1><p>手动确认真实投递，持续记录每一次流程变化</p></div><button onClick={() => setShowNew((value) => !value)}>＋ 手动新增</button></header>

    {showNew && <section className="new-record card">
      <div><h2>新增投递记录</h2><p>适合补录没有通过扩展填写的申请。</p></div>
      <div className="form-grid"><label>公司<input value={newRecord.company} onChange={(event) => setNewRecord({ ...newRecord, company: event.target.value })} /></label><label>职位<input value={newRecord.role} onChange={(event) => setNewRecord({ ...newRecord, role: event.target.value })} /></label><label className="wide">职位链接<input value={newRecord.url} onChange={(event) => setNewRecord({ ...newRecord, url: event.target.value })} placeholder="https://..." /></label><label>投递时间<input type="datetime-local" value={newRecord.appliedAt} onChange={(event) => setNewRecord({ ...newRecord, appliedAt: event.target.value })} /></label></div>
      <div className="form-actions"><button className="secondary" onClick={() => setShowNew(false)}>取消</button><button className="primary" disabled={!newRecord.company.trim() || !newRecord.role.trim()} onClick={() => void createRecord()}>保存记录</button></div>
    </section>}

    {message && <p className="notice" role="status">{message}</p>}
    <section className="workspace">
      <aside className="record-list card">
        <div className="list-heading"><div><strong>全部申请</strong><span>{records.length} 条</span></div><input aria-label="搜索投递记录" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、职位或阶段" /></div>
        {filtered.length === 0 ? <div className="empty"><strong>还没有投递记录</strong><span>完成真实提交后，从预览页或侧边栏记录；也可以手动新增。</span></div> : filtered.map((record) => <button className={`record-row ${record.id === selectedId ? 'active' : ''}`} key={record.id} onClick={() => setSelectedId(record.id)}><span><strong>{record.company}</strong><small>{record.role}</small></span><b>{record.currentStageLabel}</b><time>{displayTime(record.updatedAt)}</time></button>)}
      </aside>

      <section className="record-detail card">
        {!selected ? <div className="empty"><strong>选择一条记录查看详情</strong></div> : <>
          <header className="detail-header"><div><span className="stage-badge">{selected.currentStageLabel}</span><h2>{selected.company}</h2><p>{selected.role}</p></div><div>{selected.url && <a href={selected.url} target="_blank" rel="noreferrer">打开职位页面</a>}<button className="danger" onClick={() => void removeRecord(selected)}>删除</button></div></header>
          <section className="stage-editor"><div className="section-heading"><div><h3>更新进度</h3><p>每次更新都会追加为独立节点，不会覆盖以前的阶段。</p></div><span>{timelineEvents.length} 个节点</span></div><div className="stage-grid"><label>阶段<select value={stage} onChange={(event) => setStage(event.target.value as ApplicationStageId)}>{APPLICATION_STAGE_PRESETS.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}<option value="custom">自定义阶段</option></select></label>{stage === 'custom' && <label>阶段名称<input value={customStage} onChange={(event) => setCustomStage(event.target.value)} placeholder="例如：HR 面" /></label>}<label>发生时间<input type="datetime-local" value={stageTime} onChange={(event) => setStageTime(event.target.value)} /></label><label className="wide">备注<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选：记录面试安排、反馈或下一步" /></label></div><button className="primary" onClick={() => void addStage()}>追加到时间线</button></section>
          <section className="timeline-overview" aria-label="阶段进度线"><div className="timeline-track">{timelineEvents.map((event, index) => <div className={`timeline-node ${index === timelineEvents.length - 1 ? 'current' : ''}`} key={event.id}><i /><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></div>)}</div></section>
          <section className="timeline"><h3>完整时间线</h3>{[...timelineEvents].reverse().map((event, index) => <article key={event.id}><i className={index === 0 ? 'current' : ''} /><div><header><strong>{event.label}</strong><time>{displayTime(event.occurredAt)}</time></header>{event.note && <p>{event.note}</p>}</div></article>)}</section>
        </>}
      </section>
    </section>
  </main>;
}
