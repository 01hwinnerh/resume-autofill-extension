import type { FieldMatch } from '../shared/form';

export interface FieldMatchViewProps {
  match: FieldMatch;
  selected: boolean;
  onToggle: (fieldId: string, selected: boolean) => void;
  disabled?: boolean;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未配置';
  if (typeof value === 'string' && value.length > 4) return `${value.slice(0, 2)}****${value.slice(-2)}`;
  return String(value);
}

export function FieldMatchView({ match, selected, onToggle, disabled = false }: FieldMatchViewProps) {
  const candidate = match.selected;
  const score = candidate ? `${Math.round(candidate.score * 100)}%` : '—';

  return (
    <article className={`field-match field-match-${match.status}`}>
      <label className="field-match-header">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={(event) => onToggle(match.descriptor.fieldId, event.target.checked)}
        />
        <span className="field-match-label">{match.descriptor.label || '未命名字段'}</span>
        <span className="field-match-status">{match.status}</span>
      </label>
      <dl className="field-match-details">
        <div><dt>匹配字段</dt><dd>{candidate?.profileKey ?? '未匹配'}</dd></div>
        <div><dt>当前值</dt><dd>{displayValue(match.descriptor.currentValue)}</dd></div>
        <div><dt>置信度</dt><dd>{score}</dd></div>
      </dl>
      {candidate && candidate.reasons.length > 0 && (
        <p className="field-match-reason">依据：{candidate.reasons.join('；')}</p>
      )}
    </article>
  );
}
