import { useMemo, useState } from 'react';
import type { FieldMatch, ScanResult } from '../../src/shared/form';
import type { MappingScope } from '../../src/shared/mapping';
import type { ConfirmedFill } from '../../src/shared/messages';
import type { FillPolicy, Profile, ProfileFieldType } from '../../src/shared/profile';
import { DiagnosisSummary } from '../../src/ui/diagnosis-summary';
import { FieldMatchView } from '../../src/ui/field-match-view';
import { filterFields, isSelectableField, quickFillFieldIds, selectionRequiresPreview, toggleVisibleSelection, type FieldFilter } from '../../src/ui/field-selection';
import { isCustomProfileKey, profileFieldDefinitions } from '../../src/ui/profile-fields';
import { StatusSummary } from '../../src/ui/status-summary';

function groupName(match: FieldMatch): string {
  const section = match.descriptor.sectionLabel?.trim();
  if (section) return match.descriptor.sectionIndex === undefined ? section : `${section} · 第 ${match.descriptor.sectionIndex + 1} 段`;
  const key = match.selected?.profileKey ?? '';
  if (key.startsWith('identity.') || key.startsWith('contact.')) return '基本信息';
  if (key.startsWith('educations.')) return '教育经历'; if (key.startsWith('workExperiences.')) return '工作经历'; if (key.startsWith('projects.')) return '项目经历'; if (key.startsWith('preference.')) return '求职意向'; return '其他字段';
}
function groupPriority(name: string): number { const order = ['基本信息', '求职意向', '教育经历', '工作经历', '实习经历', '项目经历', '其他字段']; const index = order.findIndex((prefix) => name.startsWith(prefix)); return index === -1 ? order.length : index; }
function customKey(fingerprint: string, sectionIndex?: number): string {
  let hash = 2166136261;
  for (const char of `${fingerprint}|${sectionIndex ?? '-'}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `custom.field_${(hash >>> 0).toString(36)}`;
}
function usableLabel(match: FieldMatch): string { return match.descriptor.label.trim() || match.descriptor.name?.trim() || ''; }
function manualType(match: FieldMatch): ProfileFieldType {
  if (match.descriptor.kind === 'checkbox') return 'boolean';
  if (['select', 'radio', 'combobox'].includes(match.descriptor.kind)) return 'enum';
  if (match.descriptor.inputType === 'date' || match.descriptor.inputType === 'month') return 'date';
  if (match.descriptor.inputType === 'number') return 'number'; return 'text';
}
function supportsInlineValue(match: FieldMatch): boolean {
  return ['text', 'textarea'].includes(match.descriptor.kind) || (['select', 'radio', 'checkbox', 'combobox'].includes(match.descriptor.kind) && match.descriptor.options.length > 0);
}

interface ManualValue { value: string; mode: 'once' | 'save'; key: string; label: string; policy: FillPolicy; scopeKind: MappingScope['kind']; type: ProfileFieldType; standard: boolean; }
type SaveMappingInput = { fieldId: string; profileKey: string; customValue: string; policy: FillPolicy; label?: string; scopeKind: MappingScope['kind']; type: ProfileFieldType; createMapping: boolean };

export function ReviewPanel({ result, profile, selected, setSelected, onFill, onPreview, onSaveMapping, onLocate, onRescan, targetActive = true }: {
  result: ScanResult; profile: Profile; selected: string[]; setSelected: (value: string[] | ((current: string[]) => string[])) => void;
  onFill: (fields: ConfirmedFill[]) => void; onPreview: (fields: ConfirmedFill[]) => Promise<void>; onSaveMapping: (input: SaveMappingInput) => Promise<void>;
  onLocate: (fieldId: string) => Promise<void>; onRescan: () => Promise<void>; targetActive?: boolean;
}) {
  const [filter, setFilter] = useState<FieldFilter>('all'); const [query, setQuery] = useState(''); const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, ManualValue>>({}); const [savedIds, setSavedIds] = useState<Set<string>>(new Set()); const [message, setMessage] = useState('');
  const definitions = useMemo(() => profileFieldDefinitions(profile), [profile]); const selectedSet = useMemo(() => new Set(selected), [selected]);
  const effectiveFields = useMemo(() => result.fields.map((match) => {
    const item = manual[match.descriptor.fieldId]; if (!savedIds.has(match.descriptor.fieldId) || !item) return match;
    return { ...match, status: item.policy === 'auto' ? 'matched' as const : 'needs_confirmation' as const, selected: { profileKey: item.key, score: 1, source: 'user' as const, reasons: ['刚刚就地保存'] } };
  }), [result.fields, manual, savedIds]);
  const visible = useMemo(() => filterFields(effectiveFields, filter, query), [effectiveFields, filter, query]);
  const selectableVisible = visible.filter(isSelectableField); const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((item) => selectedSet.has(item.descriptor.fieldId));
  const groups = visible.reduce<Record<string, typeof visible>>((output, match) => { (output[groupName(match)] ??= []).push(match); return output; }, {});
  const overrideIds = Object.entries(manual).filter(([, value]) => value.value.trim()).map(([id]) => id);
  const mustPreview = selectionRequiresPreview(effectiveFields, selected, profile, overrideIds);
  const confirmed = effectiveFields.flatMap<ConfirmedFill>((match) => {
    if (!selectedSet.has(match.descriptor.fieldId)) return [];
    const item = manual[match.descriptor.fieldId]; if (item?.value.trim()) return [{ fieldId: match.descriptor.fieldId, profileKey: item.mode === 'save' ? item.key : `custom.session.${match.descriptor.fieldId}`, value: item.value }];
    const key = match.selected?.profileKey; const value = key ? profile.fields[key]?.value : undefined; return key && value !== undefined && value !== null ? [{ fieldId: match.descriptor.fieldId, profileKey: key, value }] : [];
  });

  function initialManual(match: FieldMatch): ManualValue {
    const standardKey = match.status === 'missing_profile' ? match.selected?.profileKey : undefined;
    const definition = standardKey ? definitions.find((item) => item.key === standardKey) : undefined;
    const repeatedDefinition = standardKey ? definitions.find((item) => item.key.replace(/\.\d+\./, '.0.') === standardKey.replace(/\.\d+\./, '.0.')) : undefined;
    const known = definition ?? repeatedDefinition;
    return { value: '', mode: standardKey ? 'save' : 'save', key: standardKey ?? customKey(match.descriptor.fingerprint, match.descriptor.sectionIndex), label: known?.label ?? usableLabel(match), policy: known?.policy ?? 'review', scopeKind: 'global', type: known?.type ?? manualType(match), standard: Boolean(standardKey) };
  }
  function updateManual(match: FieldMatch, patch: Partial<ManualValue>) {
    const fieldId = match.descriptor.fieldId;
    setManual((current) => ({ ...current, [fieldId]: { ...(current[fieldId] ?? initialManual(match)), ...patch } }));
    if (patch.value?.trim()) setSelected((current) => [...new Set([...current, fieldId])]);
  }
  async function saveManualMapping(match: FieldMatch) {
    const item = manual[match.descriptor.fieldId] ?? initialManual(match);
    if (!item.value.trim()) throw new Error('请先填写本次填写值');
    if (!item.label.trim()) throw new Error('该字段没有可识别的 label/name，请先填写字段名称');
    if (!item.standard && !isCustomProfileKey(item.key)) throw new Error('自定义字段 Key 必须以 custom. 开头，且格式有效');
    await onSaveMapping({ fieldId: match.descriptor.fieldId, profileKey: item.key, customValue: item.value, policy: item.policy, label: item.label, scopeKind: item.scopeKind, type: item.type, createMapping: !item.standard });
    setSavedIds((current) => new Set(current).add(match.descriptor.fieldId)); setSelected((current) => [...new Set([...current, match.descriptor.fieldId])]);
    setMessage(item.standard ? '缺失的标准资料字段已保存，可立即预览或填写。' : '自定义字段已保存到个人资料，并建立全局映射。');
  }
  async function openPreview() { try { for (const match of effectiveFields) { const item = manual[match.descriptor.fieldId]; if (item?.mode === 'save' && item.value.trim() && !savedIds.has(match.descriptor.fieldId)) await saveManualMapping(match); } await onPreview(confirmed); } catch (error) { setMessage(error instanceof Error ? error.message : '预览准备失败，请重试'); } }

  function valueControl(match: FieldMatch, item: ManualValue | undefined) {
    const value = item?.value ?? ''; const label = usableLabel(match) || '未命名字段';
    if (['select', 'radio', 'checkbox', 'combobox'].includes(match.descriptor.kind)) return <select aria-label={`${label}本次填写值`} value={value} onChange={(e) => updateManual(match, { value: e.target.value })}><option value="">请选择</option>{match.descriptor.options.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}</select>;
    if (match.descriptor.kind === 'textarea') return <textarea aria-label={`${label}本次填写值`} rows={3} value={value} onChange={(e) => updateManual(match, { value: e.target.value })} />;
    const type = match.descriptor.inputType === 'date' ? 'date' : match.descriptor.inputType === 'month' ? 'month' : match.descriptor.inputType === 'number' ? 'number' : 'text';
    return <input aria-label={`${label}本次填写值`} type={type} value={value} onChange={(e) => updateManual(match, { value: e.target.value })} />;
  }

  return <>
    <section className="target-card card" aria-label="当前扫描页面"><span className="target-dot" /><div><strong>{result.page.title || result.page.host}</strong><small>{result.page.url}</small></div><button type="button" onClick={() => void onRescan()}>重新扫描</button></section>
    <StatusSummary fields={effectiveFields} active={filter} onFilter={setFilter} />
    {result.frameWarnings?.map((warning) => <section className="new-fields-alert" role="status" key={warning}><span><strong>部分 iframe 已跳过</strong><small>{warning}</small></span></section>)}
    {result.repeatSectionWarnings?.map((warning) => <section className="new-fields-alert" role="alert" key={warning.category}><span><strong>页面经历槽位不足</strong><small>{warning.message}</small></span><button type="button" onClick={() => void onRescan()}>重新扫描</button></section>)}
    <DiagnosisSummary result={{ ...result, fields: effectiveFields }} />
    <div className="field-toolbar card"><input aria-label="搜索字段" placeholder="搜索页面字段或资料字段" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="状态筛选" value={filter} onChange={(e) => setFilter(e.target.value as FieldFilter)}><option value="all">全部状态</option><option value="matched">资料就绪</option><option value="needs_confirmation">待确认</option><option value="missing_profile">资料缺失</option><option value="skipped_existing">已有值</option><option value="unsupported">手动处理</option><option value="failed">失败</option></select><button type="button" onClick={() => setSelected(toggleVisibleSelection(selected, selectableVisible, !allVisibleSelected))}>{allVisibleSelected ? '取消当前结果' : '全选当前结果'}</button><button type="button" onClick={() => setSelected(quickFillFieldIds(effectiveFields, profile))}>仅选择可快速填写项</button></div>
    <div className="field-list">{Object.entries(groups).sort(([left], [right]) => groupPriority(left) - groupPriority(right) || left.localeCompare(right, 'zh-CN')).map(([name, fields]) => <section className="field-group" key={name}><button className="field-group-header" type="button" aria-expanded={!collapsed.has(name)} onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; })}><span>{name}</span><b>{fields.length}</b></button>{!collapsed.has(name) && <div className="field-group-content">{fields.map((match) => {
      const fieldId = match.descriptor.fieldId; const profileKey = match.selected?.profileKey; const item = manual[fieldId]; const editable = match.status === 'missing_profile' || match.status === 'unrecognized' || (!match.selected && match.status === 'unsupported');
      return <div key={fieldId}><FieldMatchView match={match} candidateValue={item?.value ?? (profileKey ? profile.fields[profileKey]?.value : undefined)} selected={selectedSet.has(fieldId)} disabled={!isSelectableField(match) && !item?.value.trim()} locateDisabled={!targetActive} onToggle={(id, checked) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((candidate) => candidate !== id))} onLocate={(id) => void onLocate(id)} />
        {editable && <div className="inline-value-editor card-subtle">{supportsInlineValue(match) ? <><label><span>填写值</span>{valueControl(match, item)}</label>{!usableLabel(match) && <label>字段名称<input aria-label="字段名称" value={item?.label ?? ''} onChange={(e) => updateManual(match, { label: e.target.value })} placeholder="请先输入可辨认的字段名称" /></label>}<p>{(item?.standard ?? (match.status === 'missing_profile')) ? `将保存到标准资料字段 ${item?.key ?? match.selected?.profileKey}` : '默认保存为自定义字段，并对所有网站建立映射。'}</p><button type="button" onClick={() => void saveManualMapping(match).catch((error) => setMessage(error instanceof Error ? error.message : '保存失败'))}>{savedIds.has(fieldId) ? '已保存' : '保存到我的资料'}</button></> : <p role="status">该选项控件未可靠读取到候选项。请先“定位页面字段”手动处理，不能在此自由输入。</p>}</div>}
      </div>;
    })}</div>}</section>)}</div>
    {message && <p className="notice" role="status">{message}</p>}<p className="existing-value-safety">页面已有值默认跳过，不会被快速填写覆盖；敏感字段仍需预览确认。</p>
    <div className="sticky-action-bar"><div><strong>已选择 {confirmed.length} 项</strong><span>{targetActive ? (mustPreview ? '有待确认项，请先预览' : '可直接填写') : '目标页未激活，请返回已扫描招聘页'}</span></div><div className="sticky-buttons"><button type="button" className="secondary-button" disabled={confirmed.length === 0 || !targetActive} onClick={() => void openPreview()}>完整预览</button><button type="button" className="primary-button" disabled={confirmed.length === 0 || !targetActive} onClick={() => mustPreview ? void openPreview() : onFill(confirmed)}>{mustPreview ? `预览并确认 ${confirmed.length} 项` : `快速填写 ${confirmed.length} 项`}</button></div></div>
  </>;
}
