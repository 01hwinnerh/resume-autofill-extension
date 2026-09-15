import type { ProfileFieldType } from '../shared/profile';

export function ProfileValueInput({ type, value, label, onChange, multiline = false }: {
  type: ProfileFieldType;
  value: string;
  label: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  if (multiline) return <textarea aria-label={label} rows={3} value={value} onChange={(event) => onChange(event.target.value)} />;
  if (type === 'boolean') return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
    </select>
  );
  if (type === 'enum') return <input aria-label={label} list={`${label}-suggestions`} value={value} onChange={(event) => onChange(event.target.value)} />;
  return <input aria-label={label} type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => onChange(event.target.value)} />;
}
