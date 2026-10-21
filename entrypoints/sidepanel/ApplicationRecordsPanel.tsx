import { useEffect, useMemo, useState } from 'react';
import { applicationStageTone, type ApplicationRecord } from '../../src/shared/application-record';
import type { ApplicationStore } from '../../src/storage/application-store';

const MAX_VISIBLE_RECORDS = 20;

type ApplicationRecordsReader = Pick<ApplicationStore, 'list' | 'subscribe'>;

export interface ApplicationRecordsPanelProps {
  store: ApplicationRecordsReader;
  onOpenManager(recordId?: string): void;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function recordSearchText(record: ApplicationRecord): string {
  return `${record.company} ${record.role} ${record.currentStageLabel}`.toLocaleLowerCase();
}

export function ApplicationRecordsPanel({ store, onOpenManager }: ApplicationRecordsPanelProps) {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const applyRecords = (next: ApplicationRecord[]) => {
      if (disposed) return;
      const sorted = [...next].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      setRecords(sorted);
      setSelectedId((current) => current && sorted.some((record) => record.id === current) ? current : (sorted[0]?.id ?? ''));
      setError('');
      setLoading(false);
    };
    const showError = (cause: unknown) => {
      if (disposed) return;
      setError(cause instanceof Error ? cause.message : '读取投递记录失败，请稍后重试。');
      setLoading(false);
    };

    void store.list().then(applyRecords, showError);
    const unsubscribe = store.subscribe(applyRecords, showError);
    return () => { disposed = true; unsubscribe(); };
  }, [store]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return records;
    return records.filter((record) => recordSearchText(record).includes(normalizedQuery));
  }, [query, records]);
  const visibleRecords = filtered.slice(0, MAX_VISIBLE_RECORDS);
  const selected = records.find((record) => record.id === selectedId);
  const latestEvent = selected?.events[selected.events.length - 1];

  return <section className="application-records-panel" aria-labelledby="application-records-title">
    <div className="application-records-heading">
      <div>
        <h2 id="application-records-title">投递记录</h2>
        <p>在侧边栏快速查看，完整编辑请打开管理页</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => onOpenManager(selected?.id)}>打开完整管理页</button>
    </div>

    <label className="application-records-search">
      <span>搜索公司、职位或阶段</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司 / 职位 / 阶段" />
    </label>

    <p className="application-records-count" role="status">共 {records.length} 条投递记录{query.trim() ? `，找到 ${filtered.length} 条` : ''}</p>

    {loading && <div className="application-records-state card" role="status"><span className="spinner" />正在加载投递记录…</div>}
    {!loading && error && <div className="application-records-state application-records-error card" role="alert"><strong>投递记录加载失败</strong><span>{error}</span></div>}
    {!loading && !error && records.length === 0 && <div className="application-records-state card"><strong>还没有投递记录</strong><span>完成投递后，可在填写助手中确认并记录。</span></div>}
    {!loading && !error && records.length > 0 && filtered.length === 0 && <div className="application-records-state card" role="status"><strong>没有匹配的投递记录</strong><span>请尝试其他公司、职位或阶段关键词。</span></div>}

    {!loading && !error && visibleRecords.length > 0 && <ul className="application-records-list" aria-label="投递记录列表">
      {visibleRecords.map((record) => <li key={record.id}>
        <button
          type="button"
          className={`application-record-row${record.id === selectedId ? ' active' : ''}`}
          aria-current={record.id === selectedId ? 'true' : undefined}
          aria-label={`${record.company}，${record.role}，${record.currentStageLabel}`}
          onClick={() => setSelectedId(record.id)}
        >
          <span className="application-record-main"><strong>{record.company}</strong><span>{record.role}</span></span>
          <span className="application-record-meta"><b className={`application-stage-chip stage-tone-${applicationStageTone(record.currentStage, record.currentStageLabel)}`}>{record.currentStageLabel}</b><time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></span>
        </button>
      </li>)}
    </ul>}
    {!loading && !error && filtered.length > MAX_VISIBLE_RECORDS && <p className="application-records-limit">当前显示最近 {MAX_VISIBLE_RECORDS} 条，另有 {filtered.length - MAX_VISIBLE_RECORDS} 条可在完整管理页查看。</p>}

    {selected && <article className="application-record-detail card" aria-label="选中投递记录详情">
      <div><span>公司</span><strong>{selected.company}</strong></div>
      <div><span>职位</span><strong>{selected.role}</strong></div>
      <div><span>当前阶段</span><strong className={`application-stage-chip stage-tone-${applicationStageTone(selected.currentStage, selected.currentStageLabel)}`}>{selected.currentStageLabel}</strong></div>
      <div><span>投递时间</span><time dateTime={selected.appliedAt}>{formatDate(selected.appliedAt)}</time></div>
      <div className="application-record-latest"><span>最近时间线节点</span><strong className={`application-stage-text stage-tone-${applicationStageTone(latestEvent?.stage ?? selected.currentStage, latestEvent?.label ?? selected.currentStageLabel)}`}>{latestEvent?.label ?? selected.currentStageLabel}</strong><time dateTime={latestEvent?.occurredAt ?? selected.updatedAt}>{formatDate(latestEvent?.occurredAt ?? selected.updatedAt)}</time>{latestEvent?.note && <small>{latestEvent.note}</small>}</div>
    </article>}
  </section>;
}
