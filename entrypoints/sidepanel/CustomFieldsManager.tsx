import { useMemo, useState } from 'react';
import type { UserFieldMapping } from '../../src/shared/mapping';
import type { FillPolicy, Profile, ProfileField, ProfileFieldType } from '../../src/shared/profile';
import { ProfileValueInput } from '../../src/ui/ProfileValueInput';
import { createCustomField, displayFieldValue, stringifyFieldValue } from '../../src/ui/profile-management';
import { isCustomProfileKey } from '../../src/ui/profile-fields';

const TYPES: Array<{ value: ProfileFieldType; label: string }> = [
  { value: 'text', label: '文本' }, { value: 'date', label: '日期' }, { value: 'number', label: '数字' },
  { value: 'enum', label: '单选文本' }, { value: 'boolean', label: '是/否' }, { value: 'multiselect', label: '多选（逗号分隔）' },
];

const emptyDraft = { label: '', type: 'text' as ProfileFieldType, value: '', policy: 'review' as FillPolicy, key: '' };

export function CustomFieldsManager({ profile, mappings, onSave, onDelete }: {
  profile: Profile;
  mappings: UserFieldMapping[];
  onSave: (field: ProfileField, previousKey?: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [editingKey, setEditingKey] = useState<string>();
  const [draft, setDraft] = useState(emptyDraft);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const fields = useMemo(() => Object.values(profile.fields).filter((field) => field.key.startsWith('custom.') && `${field.label} ${field.key}`.toLowerCase().includes(query.toLowerCase())), [profile, query]);

  function edit(field?: ProfileField) {
    setEditingKey(field?.key);
    setDraft(field ? { label: field.label, type: field.type, value: stringifyFieldValue(field.value), policy: field.policy, key: field.key } : emptyDraft);
    setAdvanced(Boolean(field)); setMessage('');
  }

  async function save() {
    if (!draft.label.trim()) { setMessage('请填写字段名称'); return; }
    if (draft.key.trim() && !isCustomProfileKey(draft.key)) { setMessage('Key 必须以 custom. 开头，且只能包含字母、数字、点、横线或下划线'); return; }
    setSaving(true); setMessage('');
    try {
      await onSave(createCustomField(draft), editingKey);
      const success = editingKey ? '字段已更新' : '字段已创建';
      setEditingKey(undefined); setDraft(emptyDraft); setAdvanced(false); setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败'); }
    finally { setSaving(false); }
  }

  return (
    <section className="panel-stack" aria-label="自定义字段">
      <div className="section-intro"><h2>自定义字段</h2><p>保存招聘网站的特殊问题及默认答案。</p></div>
      <div className="list-toolbar"><input aria-label="搜索自定义字段" placeholder="搜索字段" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" onClick={() => edit()}>新建</button></div>
      <div className="custom-list">{fields.map((field) => {
        const mappingCount = mappings.filter((mapping) => mapping.profileKey === field.key).length;
        return <article className="card custom-item" key={field.key}><div><strong>{field.label}</strong><span>{displayFieldValue(field.value)}</span><small>{TYPES.find((item) => item.value === field.type)?.label} · {mappingCount} 个网站映射</small></div><div className="item-actions"><button type="button" onClick={() => edit(field)}>编辑</button><button className="danger-link" type="button" onClick={() => { if (confirm(`确认删除“${field.label}”及其 ${mappingCount} 个映射？`)) void onDelete(field.key); }}>删除</button></div></article>;
      })}{fields.length === 0 && <div className="empty-card">{query ? '没有匹配的自定义字段' : '还没有自定义字段，可从这里新建或扫描后保存。'}</div>}</div>
      <form className="card custom-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <h3>{editingKey ? '编辑字段' : '新建字段'}</h3>
        <label><span>字段名称</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        <label><span>字段类型</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ProfileFieldType })}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label><span>默认值</span><ProfileValueInput type={draft.type} value={draft.value} label="默认值" onChange={(value) => setDraft({ ...draft, value })} /></label>
        <label><span>填写策略</span><select value={draft.policy} onChange={(event) => setDraft({ ...draft, policy: event.target.value as FillPolicy })}><option value="auto">允许自动匹配</option><option value="review">填写前确认</option><option value="never">永不填写</option></select></label>
        <details open={advanced} onToggle={(event) => setAdvanced(event.currentTarget.open)}><summary>高级设置</summary><label><span>Canonical Key</span><input aria-label="Canonical Key" placeholder="留空将自动生成 custom.field_xxx" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} /></label></details>
        <div className="editor-actions"><button type="button" className="secondary-button" onClick={() => edit()}>重置</button><button type="submit" disabled={saving}>{saving ? '保存中…' : '保存字段'}</button></div>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
