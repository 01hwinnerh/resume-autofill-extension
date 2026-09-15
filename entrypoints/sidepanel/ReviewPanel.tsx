import { useMemo, useState } from 'react';
import type { ScanResult } from '../../src/shared/form';
import type { MappingScope } from '../../src/shared/mapping';
import type { ConfirmedFill } from '../../src/shared/messages';
import type { FillPolicy, Profile } from '../../src/shared/profile';
import { FieldMatchView, maskCandidateValue } from '../../src/ui/field-match-view';
import { canQuickFill, filterFields, isSelectableField, previewReasons, quickFillFieldIds, selectionRequiresPreview, toggleVisibleSelection, type FieldFilter } from '../../src/ui/field-selection';
import { generateCustomFieldKey, stringifyFieldValue } from '../../src/ui/profile-management';
import { isCustomProfileKey } from '../../src/ui/profile-fields';
import { StatusSummary } from '../../src/ui/status-summary';

function groupName(match: ScanResult['fields'][number]): string {
  const section = match.descriptor.sectionLabel?.trim();
  if (section) return match.descriptor.sectionIndex === undefined ? section : `${section} · 第 ${match.descriptor.sectionIndex + 1} 段`;
  const key = match.selected?.profileKey ?? '';
  if (key.startsWith('educations.')) return '教育经历'; if (key.startsWith('workExperiences.')) return '工作经历'; if (key.startsWith('projects.')) return '项目经历';
  if (key.startsWith('preference.')) return '求职意向'; if (key.startsWith('skills.') || key.startsWith('summary.')) return '能力与评价'; if (key.startsWith('links.')) return '链接与作品'; return '基本信息与其他';
}

interface ManualValue { value: string; mode: 'once' | 'save'; key: string; label: string; policy: FillPolicy; scopeKind: MappingScope['kind'] }

type SaveMappingInput = { fieldId: string; profileKey: string; customValue: string; policy: FillPolicy; label?: string; scopeKind: MappingScope['kind'] };

export function ReviewPanel({ result, profile, selected, setSelected, onFill, onSaveMapping, onLocate }: {
  result: ScanResult; profile: Profile; selected: string[]; setSelected: (value: string[] | ((current: string[]) => string[])) => void;
  onFill: (fields: ConfirmedFill[]) => void; onSaveMapping: (input: SaveMappingInput) => Promise<void>; onLocate: (fieldId: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<FieldFilter>('all'); const [query, setQuery] = useState(''); const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, ManualValue>>({}); const [preview, setPreview] = useState(false); const [revealed, setRevealed] = useState<Set<string>>(new Set()); const [message, setMessage] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]); const visible = useMemo(() => filterFields(result.fields, filter, query), [result.fields, filter, query]);
  const selectableVisible = visible.filter(isSelectableField); const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((item) => selectedSet.has(item.descriptor.fieldId));
  const groups = visible.reduce<Record<string, typeof visible>>((output, match) => { (output[groupName(match)] ??= []).push(match); return output; }, {});
  const overrideIds = Object.entries(manual).filter(([, value]) => value.value.trim()).map(([id]) => id);
  const mustPreview = selectionRequiresPreview(result.fields, selected, profile, overrideIds);
  const confirmed = result.fields.flatMap<ConfirmedFill>((match) => {
    if (!selectedSet.has(match.descriptor.fieldId)) return [];
    const item = manual[match.descriptor.fieldId];
    if (item?.value.trim()) return [{ fieldId: match.descriptor.fieldId, profileKey: item.mode === 'save' ? item.key : `custom.session.${match.descriptor.fieldId}`, value: item.value }];
    const key = match.selected?.profileKey; const value = key ? profile.fields[key]?.value : undefined;
    return key && value !== undefined && value !== null ? [{ fieldId: match.descriptor.fieldId, profileKey: key, value }] : [];
  });

  function updateManual(fieldId: string, patch: Partial<ManualValue>, label: string) {
    setManual((current) => ({ ...current, [fieldId]: current[fieldId] ? { ...current[fieldId], ...patch } : { value: '', mode: 'once', key: generateCustomFieldKey(), label, policy: 'review', scopeKind: 'global', ...patch } }));
    if (patch.value?.trim()) setSelected((current) => [...new Set([...current, fieldId])]);
  }
  async function saveManualMapping(fieldId: string) {
    const item = manual[fieldId]; if (!item?.value.trim()) throw new Error('请先填写本次填写值');
    if (!isCustomProfileKey(item.key)) throw new Error('自定义字段 Key 必须以 custom. 开头，且格式有效');
    await onSaveMapping({ fieldId, profileKey: item.key, customValue: item.value, policy: item.policy, label: item.label, scopeKind: item.scopeKind });
    setMessage(`自定义字段与${item.scopeKind === 'global' ? '所有网站' : item.scopeKind === 'host' ? '当前网站' : '当前页面'}映射已保存`);
  }
  async function preparePreview() {
    try { for (const [id, item] of Object.entries(manual)) if (item.mode === 'save' && item.value.trim()) await saveManualMapping(id); setPreview(true); }
    catch (error) { setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试'); }
  }
  function primaryAction() { if (mustPreview) void preparePreview(); else onFill(confirmed); }
  const summary = { automatic: result.fields.filter((item) => item.status === 'matched').length, confirmation: result.fields.filter((item) => item.status === 'needs_confirmation').length, existing: result.fields.filter((item) => item.status === 'skipped_existing').length, manual: result.fields.filter((item) => item.status === 'unsupported' && !manual[item.descriptor.fieldId]?.value.trim()).length };

  return <>
    <StatusSummary fields={result.fields} active={filter} onFilter={setFilter} />
    <div className="review-toolbar card"><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="搜索字段" placeholder="搜索页面字段或资料 key" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="select-visible"><input type="checkbox" checked={allVisibleSelected} disabled={!selectableVisible.length} onChange={(event) => setSelected((current) => toggleVisibleSelection(current, visible, event.target.checked))} />{allVisibleSelected ? '取消全选当前结果' : `全选当前可填写项（${selectableVisible.length}）`}</label><button className="secondary-button quick-only" type="button" onClick={() => setSelected(quickFillFieldIds(result.fields, profile, overrideIds))}>仅选择可快速填写项</button></div>
    {message && <p className="success-notice" role="status">{message}</p>}
    <section className="field-groups" aria-label="扫描字段">{Object.entries(groups).map(([name, fields]) => { const isCollapsed = collapsed.has(name); return <section className="field-group" key={name}><button type="button" className="group-heading" aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; })}><span>{name}</span><small>{fields.length} 项</small><i>{isCollapsed ? '＋' : '−'}</i></button>{!isCollapsed && <div className="field-list">{fields.map((match) => { const safeManual = !match.selected && (match.descriptor.kind === 'text' || match.descriptor.kind === 'textarea'); const item = manual[match.descriptor.fieldId]; return <div key={match.descriptor.fieldId}><FieldMatchView match={match} candidateValue={match.selected ? profile.fields[match.selected.profileKey]?.value : undefined} selected={selectedSet.has(match.descriptor.fieldId)} disabled={!isSelectableField(match) && !safeManual} onToggle={(id, checked) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id))} onLocate={(id) => void onLocate(id)} />{safeManual && <div className="manual-editor"><label><span>本次填写值</span>{match.descriptor.kind === 'textarea' ? <textarea aria-label={`${match.descriptor.label || '页面字段'}本次填写值`} value={item?.value ?? ''} onChange={(event) => updateManual(match.descriptor.fieldId, { value: event.target.value }, match.descriptor.label || '自定义字段')} /> : <input aria-label={`${match.descriptor.label || '页面字段'}本次填写值`} type={match.descriptor.inputType === 'date' ? 'date' : match.descriptor.inputType === 'number' ? 'number' : 'text'} value={item?.value ?? ''} onChange={(event) => updateManual(match.descriptor.fieldId, { value: event.target.value }, match.descriptor.label || '自定义字段')} />}</label><label className="radio-line"><input type="radio" name={`mode-${match.descriptor.fieldId}`} checked={(item?.mode ?? 'once') === 'once'} onChange={() => updateManual(match.descriptor.fieldId, { mode: 'once' }, match.descriptor.label)} />仅本次使用</label><label className="radio-line"><input type="radio" name={`mode-${match.descriptor.fieldId}`} checked={item?.mode === 'save'} onChange={() => updateManual(match.descriptor.fieldId, { mode: 'save' }, match.descriptor.label)} />保存为自定义字段</label>{item?.mode === 'save' && <><label><span>映射作用域</span><select aria-label="映射作用域" value={item.scopeKind} onChange={(event) => updateManual(match.descriptor.fieldId, { scopeKind: event.target.value as MappingScope['kind'] }, match.descriptor.label)}><option value="global">所有网站（默认）</option><option value="host">当前网站</option><option value="path">当前页面</option></select></label><details><summary>高级修改</summary><input aria-label="自定义字段 Key" value={item.key} onChange={(event) => updateManual(match.descriptor.fieldId, { key: event.target.value }, match.descriptor.label)} /><button type="button" onClick={() => void saveManualMapping(match.descriptor.fieldId).catch((error: Error) => setMessage(error.message))}>立即保存字段与映射</button></details></>}</div>}</div>; })}</div>}</section>; })}{visible.length === 0 && <div className="empty-card">没有符合当前筛选条件的字段</div>}</section>
    {preview && <section className="preview-panel card" aria-label="填写预览"><div className="preview-heading"><div><h2>填写前确认</h2><p>只填写下列字段，绝不会自动提交表单。</p></div><button type="button" onClick={() => setPreview(false)}>返回修改</button></div><div className="preview-summary"><span>自动匹配 {summary.automatic}</span><span>手动确认 {summary.confirmation}</span><span>已有值 {summary.existing}</span><span>手动处理 {summary.manual}</span></div>{Object.entries(groups).map(([name, fields]) => { const rows = fields.filter((field) => confirmed.some((item) => item.fieldId === field.descriptor.fieldId)); return rows.length ? <div className="preview-group" key={name}><h3>{name}</h3>{rows.map((field) => { const fill = confirmed.find((value) => value.fieldId === field.descriptor.fieldId)!; const reasons = manual[fill.fieldId] ? ['使用了本次临时值'] : previewReasons(field, profile); const sensitive = field.selected ? !canQuickFill(field, profile) && reasons.some((reason) => reason.includes('敏感')) : false; const show = !sensitive || revealed.has(fill.fieldId); return <div className="preview-row" key={fill.fieldId}><strong>{field.descriptor.label || '未命名字段'}</strong><span>{stringifyFieldValue(field.descriptor.currentValue) || '空'} → {show ? stringifyFieldValue(fill.value) : maskCandidateValue(fill.value)}</span><small>{reasons.length ? `需确认：${reasons.join('；')}` : '可快速填写'}</small>{sensitive && <button type="button" className="secondary-button" onClick={() => setRevealed((current) => new Set(current).add(fill.fieldId))}>{show ? '已展开' : '展开敏感值'}</button>}</div>; })}</div> : null; })}<button className="confirm-fill" type="button" disabled={!confirmed.length} onClick={() => onFill(confirmed)}>确认并填写 {confirmed.length} 项</button></section>}
    {!preview && <footer className="sticky-actions"><div><strong>{confirmed.length}</strong><span>项待填写</span></div><button className="secondary-button" type="button" onClick={() => void preparePreview()} disabled={!confirmed.length}>完整预览</button><button type="button" onClick={primaryAction} disabled={!confirmed.length}>{mustPreview ? `预览并确认 ${confirmed.length} 项` : `快速填写 ${confirmed.length} 项`}</button></footer>}
  </>;
}
