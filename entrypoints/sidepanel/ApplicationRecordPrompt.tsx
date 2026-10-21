import { useEffect, useState } from 'react';
import type { ApplicationRecord } from '../../src/shared/application-record';
import { isSpecificApplicationCompany, isSpecificApplicationRole } from '../../src/runtime/application-identity';
import { userErrorMessage } from '../../src/ui/user-error-message';

export type ApplicationSource = 'pending' | 'page-auto' | 'page-selected' | 'manual';
export interface ApplicationDraft {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
  pendingTargetKey?: string;
  updatedAt?: string;
  urlIsCurrentPage?: boolean;
}

const SOURCE_LABEL: Record<ApplicationSource, string> = {
  pending: '最近填写草稿',
  'page-auto': '当前投递页面唯一候选',
  'page-selected': '用户选择的候选',
  manual: '手动填写',
};

const EMPTY_CANDIDATES: ApplicationDraft[] = [];

export function ApplicationRecordPrompt({ draft, source, candidates = EMPTY_CANDIDATES, onFindDuplicates, onRecord, onOpenManager }: {
  draft: ApplicationDraft;
  source: ApplicationSource | 'current';
  candidates?: ApplicationDraft[];
  onFindDuplicates: (draft: ApplicationDraft) => Promise<ApplicationRecord[]>;
  onRecord: (draft: ApplicationDraft) => Promise<ApplicationRecord>;
  onOpenManager: (recordId?: string) => void;
}) {
  const normalizedSource: ApplicationSource = source === 'current' ? 'manual' : source;
  const [selectedIndex, setSelectedIndex] = useState(candidates.length === 1 ? 0 : -1);
  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [url, setUrl] = useState(draft.url);
  const [activeDraft, setActiveDraft] = useState(draft);
  const [activeSource, setActiveSource] = useState(normalizedSource);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<ApplicationRecord>();
  const [message, setMessage] = useState('');
  const [duplicates, setDuplicates] = useState<ApplicationRecord[]>([]);
  const valid = isSpecificApplicationCompany(company) && isSpecificApplicationRole(role);

  useEffect(() => {
    setSelectedIndex(candidates.length === 1 ? 0 : -1);
    setCompany(draft.company); setRole(draft.role); setUrl(draft.url); setActiveDraft(draft);
    setActiveSource(normalizedSource); setCreated(undefined); setMessage(''); setDuplicates([]);
  }, [draft, candidates, normalizedSource]);

  function changed() { setDuplicates([]); setCreated(undefined); setMessage(''); }
  function choose(index: number) {
    const candidate = candidates[index]; if (!candidate) return;
    setSelectedIndex(index); setCompany(candidate.company); setRole(candidate.role); setUrl(candidate.url);
    setActiveDraft(candidate); setActiveSource(candidates.length > 1 ? 'page-selected' : normalizedSource);
    setDuplicates([]); setCreated(undefined); setMessage('');
  }
  function updateCompany(value: string) { changed(); setCompany(value); }
  function updateRole(value: string) { changed(); setRole(value); }
  function updateUrl(value: string) { changed(); setUrl(value); setActiveDraft((current) => ({ ...current, urlIsCurrentPage: false })); }

  async function record(force = false) {
    if (!valid) return;
    setSaving(true); setMessage('');
    try {
      const next = { ...activeDraft, company: company.trim(), role: role.trim(), url: url.trim() };
      if (!force) {
        const existing = await onFindDuplicates(next);
        if (existing.length) { setDuplicates(existing); return; }
      }
      const createdRecord = await onRecord(next);
      setDuplicates([]); setCreated(createdRecord); setMessage('记录成功，查看该记录');
    } catch (error) {
      setCreated(undefined); setMessage(userErrorMessage(error, '记录投递失败'));
    } finally { setSaving(false); }
  }

  return <section className="application-confirm card" aria-label="记录本次申请">
    <div className="application-confirm-heading"><h3>确认投递信息</h3><span>来源：{SOURCE_LABEL[activeSource]}</span></div>
    {!created && candidates.length > 1 && <fieldset className="application-candidates">
      <legend>请选择本次投递的岗位</legend>
      {candidates.map((candidate, index) => <label key={`${candidate.pendingTargetKey ?? candidate.url}-${candidate.role}`}>
        <input type="radio" name="application-candidate" checked={selectedIndex === index} onChange={() => choose(index)} />
        <span><strong>{candidate.company || '未知公司'} · {candidate.role}</strong><small>{candidate.url || '无职位详情链接'}{candidate.updatedAt ? ` · 更新于 ${new Date(candidate.updatedAt).toLocaleString('zh-CN')}` : ''}</small></span>
      </label>)}
    </fieldset>}
    {!created && !valid && <p className="notice" role="status">无法确定具体职位，请选择候选或手动填写公司和具体职位。</p>}
    {!created && <div className="application-fields">
      <label><span>公司</span><input aria-label="公司" value={company} onChange={(event) => updateCompany(event.target.value)} placeholder="例如：某某科技" /></label>
      <label><span>职位</span><input aria-label="职位" value={role} onChange={(event) => updateRole(event.target.value)} placeholder="例如：前端工程师" /></label>
      <label className="application-url"><span>职位链接</span><input aria-label="职位链接" value={url} onChange={(event) => updateUrl(event.target.value)} placeholder="https://…" /></label>
    </div>}
    {!created && activeDraft.urlIsCurrentPage && <p className="link-note" role="status">职位链接为当前投递页面，可稍后在投递记录中编辑。</p>}
    {!created && duplicates.length > 0 && <div className="duplicate-warning" role="alert">
      <strong>发现相似投递记录</strong>
      {duplicates.slice(0, 3).map((record) => <span key={record.id}>{new Date(record.appliedAt).toLocaleDateString('zh-CN')} · {record.company} · {record.role} · {record.currentStageLabel}</span>)}
      <div><button className="secondary-button" type="button" onClick={() => setDuplicates([])}>取消</button><button type="button" disabled={saving} onClick={() => void record(true)}>仍然记录</button></div>
    </div>}
    {message && <p className={created ? 'success-notice' : 'notice'} role="status">{message}</p>}
    <div className="application-actions">
      {!created && duplicates.length === 0 && <button type="button" disabled={saving || !valid || (candidates.length > 1 && selectedIndex < 0 && !company.trim() && !role.trim())} onClick={() => void record()}>{saving ? '正在检查…' : '确认投递并记录'}</button>}
      <button className="secondary-button" type="button" onClick={() => onOpenManager(created?.id)}>{created ? '查看该记录' : '查看投递记录'}</button>
    </div>
  </section>;
}
