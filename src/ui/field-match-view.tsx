import { useState } from 'react';
import type { FieldMatch } from '../shared/form';
import type { FieldValue } from '../shared/profile';
import { stringifyFieldValue } from './profile-management';

export interface FieldMatchViewProps {
  match: FieldMatch;
  candidateValue?: FieldValue;
  selected: boolean;
  onToggle: (fieldId: string, selected: boolean) => void;
  onLocate?: (fieldId: string) => void;
  disabled?: boolean;
}

export const STATUS_LABELS: Record<FieldMatch['status'], string> = {
  matched: '已匹配', needs_confirmation: '待确认', skipped_existing: '已有值',
  filled: '已填写', verified: '已校验', failed: '失败', unsupported: '手动处理',
};

export function maskCandidateValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未配置';
  const text = Array.isArray(value) ? value.join('、') : String(value);
  if (text.length <= 2) return `${text.slice(0, 1)}*`;
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain ?? ''}`;
  }
  if (/^https?:\/\//i.test(text)) {
    try { return new URL(text).hostname; } catch { return `${text.slice(0, 8)}…`; }
  }
  if (text.length <= 4) return `${text.slice(0, 1)}**${text.slice(-1)}`;
  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export function FieldMatchView({ match, candidateValue, selected, onToggle, onLocate, disabled = false }: FieldMatchViewProps) {
  const [revealed, setRevealed] = useState(false);
  const candidate = match.selected;
  const score = candidate ? `${Math.round(candidate.score * 100)}%` : '—';
  const current = stringifyFieldValue(match.descriptor.currentValue) || '空';
  const next = revealed ? stringifyFieldValue(candidateValue) || '未配置' : maskCandidateValue(candidateValue);

  return (
    <article className={`field-match field-match-${match.status}`}>
      <label className="field-match-header">
        <input aria-label={`选择${match.descriptor.label || '未命名字段'}`} type="checkbox" checked={selected} disabled={disabled} onChange={(event) => onToggle(match.descriptor.fieldId, event.target.checked)} />
        <span className="field-match-title"><strong>{match.descriptor.label || '未命名字段'}</strong><small>{candidate?.profileKey ?? '未找到候选资料'}</small></span>
        <span className={`status-badge status-${match.status}`}>{STATUS_LABELS[match.status]}</span>
      </label>
      <div className="value-transition"><span><small>页面当前值</small>{current}</span><b aria-hidden="true">→</b><span><small>将填写值</small>{next}</span></div>
      <div className="field-actions"><button type="button" onClick={() => setRevealed((value) => !value)}>{revealed ? '收起资料值' : '展开资料值'}</button>{onLocate && <button type="button" onClick={() => onLocate(match.descriptor.fieldId)}>定位页面字段</button>}</div>
      <div className="confidence-row"><span>置信度 {score}</span><span className="confidence-track"><i style={{ width: candidate ? `${candidate.score * 100}%` : '0%' }} /></span></div>
      {candidate && candidate.reasons.length > 0 && <details className="field-match-reason"><summary>查看匹配依据</summary><ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
    </article>
  );
}
