import { useMemo, useState } from 'react';
import type { ScanResult } from '../../src/shared/form';
import type { MappingScope } from '../../src/shared/mapping';
import type { ConfirmedFill } from '../../src/shared/messages';
import type { FillPolicy, Profile } from '../../src/shared/profile';
import { DiagnosisSummary } from '../../src/ui/diagnosis-summary';
import { FieldMatchView } from '../../src/ui/field-match-view';
import {
  filterFields, isSelectableField, quickFillFieldIds, selectionRequiresPreview,
  toggleVisibleSelection, type FieldFilter,
} from '../../src/ui/field-selection';
import { generateCustomFieldKey } from '../../src/ui/profile-management';
import { isCustomProfileKey } from '../../src/ui/profile-fields';
import { StatusSummary } from '../../src/ui/status-summary';

function groupName(match: ScanResult['fields'][number]): string {
  const section = match.descriptor.sectionLabel?.trim();
  if (section) return match.descriptor.sectionIndex === undefined ? section : `${section} · 第 ${match.descriptor.sectionIndex + 1} 段`;
  const key = match.selected?.profileKey ?? '';
  if (key.startsWith('identity.') || key.startsWith('contact.')) return '基本信息';
  if (key.startsWith('educations.')) return '教育经历';
  if (key.startsWith('workExperiences.')) return '工作经历';
  if (key.startsWith('projects.')) return '项目经历';
  if (key.startsWith('preference.')) return '求职意向';
  return '其他字段';
}

function groupPriority(name: string): number {
  const order = ['基本信息', '求职意向', '教育经历', '工作经历', '实习经历', '项目经历', '其他字段'];
  const index = order.findIndex((prefix) => name.startsWith(prefix));
  return index === -1 ? order.length : index;
}

interface ManualValue {
  value: string;
  mode: 'once' | 'save';
  key: string;
  label: string;
  policy: FillPolicy;
  scopeKind: MappingScope['kind'];
}

type SaveMappingInput = {
  fieldId: string;
  profileKey: string;
  customValue: string;
  policy: FillPolicy;
  label?: string;
  scopeKind: MappingScope['kind'];
};

export function ReviewPanel({ result, profile, selected, setSelected, onFill, onPreview, onSaveMapping, onLocate, onRescan }: {
  result: ScanResult;
  profile: Profile;
  selected: string[];
  setSelected: (value: string[] | ((current: string[]) => string[])) => void;
  onFill: (fields: ConfirmedFill[]) => void;
  onPreview: (fields: ConfirmedFill[]) => Promise<void>;
  onSaveMapping: (input: SaveMappingInput) => Promise<void>;
  onLocate: (fieldId: string) => Promise<void>;
  onRescan: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<FieldFilter>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, ManualValue>>({});
  const [message, setMessage] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => filterFields(result.fields, filter, query), [result.fields, filter, query]);
  const selectableVisible = visible.filter(isSelectableField);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((item) => selectedSet.has(item.descriptor.fieldId));
  const groups = visible.reduce<Record<string, typeof visible>>((output, match) => {
    (output[groupName(match)] ??= []).push(match);
    return output;
  }, {});
  const overrideIds = Object.entries(manual).filter(([, value]) => value.value.trim()).map(([id]) => id);
  const mustPreview = selectionRequiresPreview(result.fields, selected, profile, overrideIds);
  const confirmed = result.fields.flatMap<ConfirmedFill>((match) => {
    if (!selectedSet.has(match.descriptor.fieldId)) return [];
    const item = manual[match.descriptor.fieldId];
    if (item?.value.trim()) return [{ fieldId: match.descriptor.fieldId, profileKey: item.mode === 'save' ? item.key : `custom.session.${match.descriptor.fieldId}`, value: item.value }];
    const key = match.selected?.profileKey;
    const value = key ? profile.fields[key]?.value : undefined;
    return key && value !== undefined && value !== null ? [{ fieldId: match.descriptor.fieldId, profileKey: key, value }] : [];
  });

  function updateManual(fieldId: string, patch: Partial<ManualValue>, label: string) {
    setManual((current) => ({
      ...current,
      [fieldId]: current[fieldId]
        ? { ...current[fieldId], ...patch }
        : { value: '', mode: 'once', key: generateCustomFieldKey(), label, policy: 'review', scopeKind: 'global', ...patch },
    }));
    if (patch.value?.trim()) setSelected((current) => [...new Set([...current, fieldId])]);
  }

  async function saveManualMapping(fieldId: string) {
    const item = manual[fieldId];
    if (!item?.value.trim()) throw new Error('请先填写本次填写值');
    if (!isCustomProfileKey(item.key)) throw new Error('自定义字段 Key 必须以 custom. 开头，且格式有效');
    await onSaveMapping({ fieldId, profileKey: item.key, customValue: item.value, policy: item.policy, label: item.label, scopeKind: item.scopeKind });
    setMessage(`自定义字段与${item.scopeKind === 'global' ? '所有网站' : item.scopeKind === 'host' ? '当前网站' : '当前页面'}映射已保存`);
  }

  async function openPreview() {
    try {
      for (const [id, item] of Object.entries(manual)) {
        if (item.mode === 'save' && item.value.trim()) await saveManualMapping(id);
      }
      await onPreview(confirmed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '预览准备失败，请重试');
    }
  }

  return <>
    <section className="target-card card" aria-label="当前扫描页面">
      <span className="target-dot" />
      <div><strong>{result.page.title || result.page.host}</strong><small>{result.page.url}</small></div>
      <button type="button" onClick={() => void onRescan()}>重新扫描</button>
    </section>
    <StatusSummary fields={result.fields} active={filter} onFilter={setFilter} />
    {result.frameWarnings?.map((warning) => <section className="new-fields-alert" role="status" key={warning}><span><strong>部分 iframe 已跳过</strong><small>{warning}</small></span></section>)}
    {result.repeatSectionWarnings?.map((warning) => <section className="new-fields-alert" role="alert" key={warning.category}><span><strong>页面经历槽位不足</strong><small>{warning.message}</small></span><button type="button" onClick={() => void onRescan()}>重新扫描</button></section>)}
    <DiagnosisSummary result={result} />
    <div className="field-toolbar card">
      <input aria-label="搜索字段" placeholder="搜索页面字段或资料字段" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="状态筛选" value={filter} onChange={(event) => setFilter(event.target.value as FieldFilter)}>
        <option value="all">全部状态</option><option value="matched">资料就绪</option><option value="needs_confirmation">待确认</option><option value="missing_profile">资料缺失</option><option value="skipped_existing">已有值</option><option value="unsupported">手动处理</option><option value="failed">失败</option>
      </select>
      <button type="button" onClick={() => setSelected(toggleVisibleSelection(selected, selectableVisible, !allVisibleSelected))}>{allVisibleSelected ? '取消当前结果' : '全选当前结果'}</button>
      <button type="button" onClick={() => setSelected(quickFillFieldIds(result.fields, profile))}>仅选择可快速填写项</button>
    </div>
    <div className="field-list">{Object.entries(groups).sort(([left], [right]) => groupPriority(left) - groupPriority(right) || left.localeCompare(right, 'zh-CN')).map(([name, fields]) => <section className="field-group" key={name}>
      <button className="field-group-header" type="button" aria-expanded={!collapsed.has(name)} onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; })}><span>{name}</span><b>{fields.length}</b></button>
      {!collapsed.has(name) && <div className="field-group-content">{fields.map((match) => {
        const fieldId = match.descriptor.fieldId;
        const profileKey = match.selected?.profileKey;
        const manualValue = manual[fieldId];
        return <div key={fieldId}>
          <FieldMatchView match={match} candidateValue={profileKey ? profile.fields[profileKey]?.value : manualValue?.value} selected={selectedSet.has(fieldId)} disabled={!isSelectableField(match) && !manualValue?.value.trim()} onToggle={(id, checked) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} onLocate={(id) => void onLocate(id)} />
          {!match.selected && ['text', 'textarea'].includes(match.descriptor.kind) && <div className="inline-value-editor card-subtle">
            <label><span>本次填写值</span><input aria-label={`${match.descriptor.label}本次填写值`} type={match.descriptor.inputType === 'date' ? 'date' : match.descriptor.inputType === 'number' ? 'number' : 'text'} value={manualValue?.value ?? ''} onChange={(event) => updateManual(fieldId, { value: event.target.value }, match.descriptor.label || '自定义字段')} /></label>
            <label className="choice"><input aria-label="保存为自定义字段" type="checkbox" checked={manualValue?.mode === 'save'} onChange={(event) => updateManual(fieldId, { mode: event.target.checked ? 'save' : 'once' }, match.descriptor.label || '自定义字段')} />保存到我的资料</label>
            {manualValue?.mode === 'save' && <details><summary>自定义字段设置</summary><label>字段名称<input value={manualValue.label} onChange={(event) => updateManual(fieldId, { label: event.target.value }, match.descriptor.label)} /></label><label>映射作用域<select aria-label="映射作用域" value={manualValue.scopeKind} onChange={(event) => updateManual(fieldId, { scopeKind: event.target.value as MappingScope['kind'] }, match.descriptor.label)}><option value="global">所有网站</option><option value="host">当前网站</option><option value="path">当前页面</option></select></label><label>高级 Key<input value={manualValue.key} onChange={(event) => updateManual(fieldId, { key: event.target.value }, match.descriptor.label)} /></label><button type="button" onClick={() => void saveManualMapping(fieldId)}>立即保存字段与映射</button></details>}
          </div>}
        </div>;
      })}</div>}
    </section>)}</div>
    {message && <p className="notice" role="status">{message}</p>}
    <div className="sticky-action-bar"><div><strong>已选择 {confirmed.length} 项</strong><span>{mustPreview ? '有待确认项，请先预览' : '可直接填写'}</span></div><div className="sticky-buttons"><button type="button" className="secondary-button" disabled={confirmed.length === 0} onClick={() => void openPreview()}>完整预览</button><button type="button" className="primary-button" disabled={confirmed.length === 0} onClick={() => mustPreview ? void openPreview() : onFill(confirmed)}>{mustPreview ? `预览并确认 ${confirmed.length} 项` : `快速填写 ${confirmed.length} 项`}</button></div></div>
  </>;
}
