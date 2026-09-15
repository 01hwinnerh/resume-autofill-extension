import type { FieldMatch, FieldStatus } from '../shared/form';

export type FieldFilter = 'all' | FieldStatus;

export function isSelectableField(match: FieldMatch): boolean {
  return (match.status === 'matched' || match.status === 'needs_confirmation') && !!match.selected;
}

export function defaultSelectedFieldIds(fields: FieldMatch[]): string[] {
  return fields.filter((field) => field.status === 'matched' && isSelectableField(field))
    .map((field) => field.descriptor.fieldId);
}

export function filterFields(fields: FieldMatch[], filter: FieldFilter, query: string): FieldMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  return fields.filter((field) => {
    if (filter !== 'all' && field.status !== filter) return false;
    if (!needle) return true;
    const haystack = [
      field.descriptor.label, field.descriptor.sectionLabel, field.descriptor.name,
      field.selected?.profileKey,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

export function toggleVisibleSelection(
  selected: string[],
  visibleFields: FieldMatch[],
  shouldSelect: boolean,
): string[] {
  const visibleIds = new Set(visibleFields.filter(isSelectableField).map((field) => field.descriptor.fieldId));
  if (shouldSelect) return [...new Set([...selected, ...visibleIds])];
  return selected.filter((id) => !visibleIds.has(id));
}
