import type { FieldMatch } from '../shared/form';

export function StatusSummary({ fields }: { fields: FieldMatch[] }) {
  const counts = fields.reduce<Record<string, number>>((result, field) => {
    result[field.status] = (result[field.status] ?? 0) + 1;
    return result;
  }, {});

  return (
    <div className="status-summary" aria-label="字段状态统计">
      <span>可填写 {counts.matched ?? 0}</span>
      <span>需确认 {counts.needs_confirmation ?? 0}</span>
      <span>已跳过 {counts.skipped_existing ?? 0}</span>
      <span>暂不支持 {counts.unsupported ?? 0}</span>
      <span>失败 {counts.failed ?? 0}</span>
    </div>
  );
}
