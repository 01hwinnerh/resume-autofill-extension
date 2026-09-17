import type { FieldMatch, FieldStatus } from '../shared/form';
import type { FieldFilter } from './field-selection';
import { STATUS_LABELS } from './field-match-view';

const VISIBLE_STATUSES: FieldStatus[] = ['matched', 'needs_confirmation', 'missing_profile', 'unrecognized', 'skipped_existing', 'unsupported', 'failed'];
const RECOGNIZED_STATUSES = new Set<FieldStatus>(['matched', 'needs_confirmation', 'missing_profile', 'skipped_existing']);

export function countRecognizedFields(fields: FieldMatch[]): number {
  return fields.filter((field) => RECOGNIZED_STATUSES.has(field.status)).length;
}

export function StatusSummary({
  fields, active = 'all', onFilter,
}: {
  fields: FieldMatch[];
  active?: FieldFilter;
  onFilter?: (filter: FieldFilter) => void;
}) {
  const counts = fields.reduce<Partial<Record<FieldStatus, number>>>((result, field) => {
    result[field.status] = (result[field.status] ?? 0) + 1;
    return result;
  }, {});

  const recognized = countRecognizedFields(fields);
  const summary = `${STATUS_LABELS.matched} ${counts.matched ?? 0}，${STATUS_LABELS.needs_confirmation} ${counts.needs_confirmation ?? 0}，${STATUS_LABELS.missing_profile} ${counts.missing_profile ?? 0}${counts.skipped_existing ? `，${STATUS_LABELS.skipped_existing} ${counts.skipped_existing}` : ''}`;

  return (
    <>
      <div className="recognition-summary" role="status">
        <strong>已识别 {recognized}/{fields.length}</strong>
        <span>{summary}</span>
      </div>
      <div className="status-summary" aria-label="字段状态统计">
      <button type="button" aria-label={`筛选全部字段，共 ${fields.length} 项`} className={active === 'all' ? 'active' : ''} onClick={() => onFilter?.('all')}>
        <strong>{fields.length}</strong><span>全部</span>
      </button>
      {VISIBLE_STATUSES.map((status) => (
        <button type="button" aria-label={`筛选${STATUS_LABELS[status]}字段，共 ${counts[status] ?? 0} 项`} key={status} className={active === status ? 'active' : ''} onClick={() => onFilter?.(status)}>
          <strong>{counts[status] ?? 0}</strong><span>{STATUS_LABELS[status]}</span>
        </button>
      ))}
      </div>
    </>
  );
}
