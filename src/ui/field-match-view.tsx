import { useState } from 'react';
import type { FieldMatch } from '../shared/form';
import type { FieldValue } from '../shared/profile';
import { fieldPreparationHint } from './fill-feedback';
import { stringifyFieldValue } from './profile-management';

export interface FieldMatchViewProps {
  match: FieldMatch;
  candidateValue?: FieldValue;
  selected: boolean;
  onToggle: (fieldId: string, selected: boolean) => void;
  onLocate?: (fieldId: string) => void;
  locateDisabled?: boolean;
  disabled?: boolean;
}

export const STATUS_LABELS: Record<FieldMatch['status'], string> = {
  matched: '资料就绪', needs_confirmation: '待确认', missing_profile: '资料缺失', unrecognized: '未识别', skipped_existing: '已有值',
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

export function fieldDisplayLabel(match: FieldMatch): string {
  if (match.descriptor.label) return match.descriptor.label;
  const type = match.descriptor.inputType === 'date' ? '日期'
    : match.descriptor.inputType === 'number' ? '数字'
      : match.descriptor.kind === 'select' ? '下拉'
        : match.descriptor.kind === 'textarea' ? '长文本'
          : match.descriptor.kind === 'radio' ? '单选'
            : match.descriptor.kind === 'checkbox' ? '复选' : '文本';
  const ordinal = match.descriptor.fieldId.match(/(\d+)$/)?.[1];
  return `${type}字段${ordinal ? ` ${ordinal}` : ''}`;
}

export function FieldMatchView({ match, candidateValue, selected, onToggle, onLocate, locateDisabled = false, disabled = false }: FieldMatchViewProps) {
  const [revealed, setRevealed] = useState(false);
  const label = fieldDisplayLabel(match);
  const candidate = match.selected;
  const score = candidate ? `${Math.round(candidate.score * 100)}%` : '—';
  const current = stringifyFieldValue(match.descriptor.currentValue) || '空';
  const next = revealed ? stringifyFieldValue(candidateValue) || '未配置' : maskCandidateValue(candidateValue);
  const preparationHint = fieldPreparationHint(match.descriptor);

  return (
    <article className={`field-match field-match-${match.status}`}>
      <label className="field-match-header">
        <input aria-label={`选择${label}`} type="checkbox" checked={selected} disabled={disabled} onChange={(event) => onToggle(match.descriptor.fieldId, event.target.checked)} />
        <span className="field-match-title"><strong>{label}</strong><small>{candidate?.profileKey ?? '未找到候选资料'}</small></span>
        <span className={`status-badge status-${match.status}`}>{STATUS_LABELS[match.status]}</span>
      </label>
      <div className="value-transition"><span><small>页面当前值</small>{current}</span><b aria-hidden="true">→</b><span><small>将填写值</small>{next}</span></div>
      {preparationHint && <p className="field-preparation-hint">{preparationHint}</p>}
      <div className="field-actions"><button type="button" onClick={() => setRevealed((value) => !value)}>{revealed ? '收起资料值' : '展开资料值'}</button>{onLocate && <button type="button" disabled={locateDisabled} onClick={() => onLocate(match.descriptor.fieldId)}>定位页面字段</button>}</div>
      <div className="confidence-row"><span>置信度 {score}</span><span className="confidence-track"><i style={{ width: candidate ? `${candidate.score * 100}%` : '0%' }} /></span></div>
      {candidate && candidate.reasons.length > 0 && <details className="field-match-reason"><summary>查看匹配依据</summary><ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
    </article>
  );
}
