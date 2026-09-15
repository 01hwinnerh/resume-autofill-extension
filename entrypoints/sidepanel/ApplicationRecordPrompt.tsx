import { useState } from 'react';
import type { ApplicationRecord } from '../../src/shared/application-record';

export interface ApplicationDraft {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
}

export function ApplicationRecordPrompt({ draft, onRecord, onOpenManager }: {
  draft: ApplicationDraft;
  onRecord: (draft: ApplicationDraft) => Promise<ApplicationRecord>;
  onOpenManager: () => void;
}) {
  const [company, setCompany] = useState(draft.company);
  const [role, setRole] = useState(draft.role);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');

  async function record() {
    setSaving(true);
    setMessage('');
    try {
      await onRecord({ ...draft, company, role });
      setSaved(true);
      setMessage('已记录为“已投递”，并写入当前时间。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '记录失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  return <section className="application-confirm card" aria-label="记录本次申请">
    <div className="application-confirm-heading"><div><h3>确认已经在招聘网站完成提交？</h3><p>扩展不会自动判断提交结果。只有你点击下方按钮后，才会保存投递记录。</p></div><span>手动确认</span></div>
    {!saved && <div className="application-fields">
      <label><span>公司</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：某某科技" /></label>
      <label><span>职位</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="例如：前端工程师" /></label>
    </div>}
    {message && <p className={saved ? 'success-notice' : 'notice'} role="status">{message}</p>}
    <div className="application-actions">
      {!saved && <button type="button" disabled={saving || !company.trim() || !role.trim()} onClick={() => void record()}>{saving ? '正在记录…' : '已完成投递，记录本次申请'}</button>}
      <button className="secondary-button" type="button" onClick={onOpenManager}>查看投递记录</button>
    </div>
  </section>;
}
