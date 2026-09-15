import type { FieldMatch, FieldStatus } from '../shared/form';
import type { FieldFilter } from './field-selection';
import { STATUS_LABELS } from './field-match-view';

const VISIBLE_STATUSES: FieldStatus[] = ['matched', 'needs_confirmation', 'skipped_existing', 'unsupported', 'failed'];

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

  return (
    <div className="status-summary" aria-label="字段状态统计">
      <button type="button" className={active === 'all' ? 'active' : ''} onClick={() => onFilter?.('all')}>
        <strong>{fields.length}</strong><span>全部</span>
      </button>
      {VISIBLE_STATUSES.map((status) => (
        <button type="button" key={status} className={active === status ? 'active' : ''} onClick={() => onFilter?.(status)}>
          <strong>{counts[status] ?? 0}</strong><span>{STATUS_LABELS[status]}</span>
        </button>
      ))}
    </div>
  );
}
