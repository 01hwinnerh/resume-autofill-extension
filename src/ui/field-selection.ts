import type { FieldMatch, FieldStatus } from '../shared/form';
import type { Profile } from '../shared/profile';

export type FieldFilter = 'all' | FieldStatus;

const SENSITIVE_KEYS = new Set([
  'contact.phone', 'contact.email', 'identity.birthDate', 'identity.gender',
  'workExperiences.$.currentSalary', 'workExperiences.$.referencePhone', 'preference.salary',
]);

function normalizeIndexedKey(key: string): string { return key.replace(/\.\d+\./g, '.$.'); }
export function isSensitiveProfileKey(key: string): boolean { return SENSITIVE_KEYS.has(normalizeIndexedKey(key)); }
export function isSelectableField(match: FieldMatch): boolean { return (match.status === 'matched' || match.status === 'needs_confirmation') && !!match.selected; }
export function defaultSelectedFieldIds(fields: FieldMatch[]): string[] { return fields.filter((field) => field.status === 'matched' && isSelectableField(field)).map((field) => field.descriptor.fieldId); }

export function previewReasons(match: FieldMatch, profile: Profile, hasTemporaryOverride = false): string[] {
  const reasons: string[] = []; const candidate = match.selected; const profileField = candidate ? profile.fields[candidate.profileKey] : undefined;
  if (!candidate) reasons.push('没有已选择的资料字段');
  if (match.status !== 'matched') reasons.push('匹配状态需要确认');
  if (profileField?.policy !== 'auto') reasons.push(profileField?.policy === 'never' ? '资料策略禁止填写' : '资料策略要求填写前确认');
  if (candidate && candidate.score <= 0.5) reasons.push('匹配置信度不高于 50%');
  if (candidate?.profileKey.startsWith('custom.')) reasons.push('自定义字段必须确认');
  if (hasTemporaryOverride) reasons.push('使用了本次临时值');
  if (candidate && isSensitiveProfileKey(candidate.profileKey)) reasons.push('敏感信息必须确认');
  return reasons;
}

export function canQuickFill(match: FieldMatch, profile: Profile, hasTemporaryOverride = false): boolean {
  return previewReasons(match, profile, hasTemporaryOverride).length === 0;
}

export function quickFillFieldIds(fields: FieldMatch[], profile: Profile, overrideIds: Iterable<string> = []): string[] {
  const overrides = new Set(overrideIds);
  return fields.filter((field) => isSelectableField(field) && canQuickFill(field, profile, overrides.has(field.descriptor.fieldId))).map((field) => field.descriptor.fieldId);
}

export function selectionRequiresPreview(fields: FieldMatch[], selectedIds: Iterable<string>, profile: Profile, overrideIds: Iterable<string> = []): boolean {
  const selected = new Set(selectedIds); const overrides = new Set(overrideIds);
  return fields.some((field) => selected.has(field.descriptor.fieldId) && !canQuickFill(field, profile, overrides.has(field.descriptor.fieldId)));
}

export function filterFields(fields: FieldMatch[], filter: FieldFilter, query: string): FieldMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  return fields.filter((field) => {
    if (filter !== 'all' && field.status !== filter) return false;
    if (!needle) return true;
    return [field.descriptor.label, field.descriptor.sectionLabel, field.descriptor.name, field.selected?.profileKey].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
  });
}

export function toggleVisibleSelection(selected: string[], visibleFields: FieldMatch[], shouldSelect: boolean): string[] {
  const visibleIds = new Set(visibleFields.filter(isSelectableField).map((field) => field.descriptor.fieldId));
  if (shouldSelect) return [...new Set([...selected, ...visibleIds])];
  return selected.filter((id) => !visibleIds.has(id));
}
