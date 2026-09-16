import { useState } from 'react';
import type { ApplicationRecord } from '../../src/shared/application-record';

export interface ApplicationDraft {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
}

export function ApplicationRecordPrompt({ draft, onFindDuplicates, onRecord, onOpenManager }: {
  draft: ApplicationDraft;
  onFindDuplicates: (draft: ApplicationDraft) => Promise<ApplicationRecord[]>;
  onRecord: (draft: ApplicationDraft) => Promise<ApplicationRecord>;
  onOpenManager: () => void;
}) {
  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [duplicates, setDuplicates] = useState<ApplicationRecord[]>([]);

  function updateCompany(value: string) { setCompany(value); setDuplicates([]); }
  function updateRole(value: string) { setRole(value); setDuplicates([]); }

  async function record(force = false) {
    setSaving(true);
    setMessage('');
    try {
      const next = { ...draft, company, role };
      if (!force) {
        const existing = await onFindDuplicates(next);
        if (existing.length) {
          setDuplicates(existing);
          return;
        }
      }
      await onRecord(next);
      setDuplicates([]);
      setSaved(true);
      setMessage('记录成功');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '记录失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return <section className="application-confirm card" aria-label="记录本次申请">
    <div className="application-confirm-heading"><h3>确认投递信息</h3></div>
    {!saved && <div className="application-fields">
      <label><span>公司</span><input value={company} onChange={(event) => updateCompany(event.target.value)} placeholder="例如：某某科技" /></label>
      <label><span>职位</span><input value={role} onChange={(event) => updateRole(event.target.value)} placeholder="例如：前端工程师" /></label>
    </div>}
    {duplicates.length > 0 && <div className="duplicate-warning" role="alert">
      <strong>发现相似投递记录</strong>
      {duplicates.slice(0, 3).map((record) => <span key={record.id}>{new Date(record.appliedAt).toLocaleDateString('zh-CN')} · {record.company} · {record.role} · {record.currentStageLabel}</span>)}
      <div><button className="secondary-button" type="button" onClick={() => setDuplicates([])}>取消</button><button type="button" disabled={saving} onClick={() => void record(true)}>仍然记录</button></div>
    </div>}
    {message && <p className={saved ? 'success-notice' : 'notice'} role="status">{message}</p>}
    <div className="application-actions">
      {!saved && duplicates.length === 0 && <button type="button" disabled={saving || !company.trim() || !role.trim()} onClick={() => void record()}>{saving ? '正在检查…' : '确认投递并记录'}</button>}
      <button className="secondary-button" type="button" onClick={onOpenManager}>查看投递记录</button>
    </div>
  </section>;
}
