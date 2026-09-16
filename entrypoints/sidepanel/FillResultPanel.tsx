import type { FillSummary } from '../../src/runtime/application-controller';
import type { ScanResult } from '../../src/shared/form';
import type { ConfirmedFill } from '../../src/shared/messages';
import { fieldDisplayLabel } from '../../src/ui/field-match-view';

export function FillResultPanel({ result, fields, summary, onRetry, onLocate, onRescan }: {
  result: ScanResult;
  fields: ConfirmedFill[];
  summary: FillSummary;
  onRetry: (fields: ConfirmedFill[]) => void;
  onLocate: (fieldId: string) => void;
  onRescan: () => void;
}) {
  const failedIds = new Set(summary.failed.map((item) => item.fieldId));
  const retryFields = fields.filter((field) => failedIds.has(field.fieldId)).map((field) => ({ ...field, overwrite: true }));
  const matches = new Map(result.fields.map((match) => [match.descriptor.fieldId, match]));

  return <section className="result-panel card" role="status">
    <div className="result-heading">
      <div><h2>{summary.failed.length ? '部分字段未填写' : '填写完成'}</h2><p>{summary.verified.length} 项成功{summary.skippedExisting.length ? `，${summary.skippedExisting.length} 项保留原值` : ''}</p></div>
      <button type="button" className="secondary-button" onClick={onRescan}>重新扫描</button>
    </div>
    {summary.failed.length > 0 && <div className="failed-field-list" aria-label="填写失败字段">
      {summary.failed.map((failure) => {
        const match = matches.get(failure.fieldId);
        return <div className="failed-field-item" key={failure.fieldId}>
          <span><strong>{match ? fieldDisplayLabel(match) : '未知字段'}</strong><small>{failure.reason}</small></span>
          <button type="button" className="secondary-button" onClick={() => onLocate(failure.fieldId)}>定位</button>
        </div>;
      })}
      <button type="button" disabled={!retryFields.length} onClick={() => onRetry(retryFields)}>仅重试失败项</button>
    </div>}
  </section>;
}
