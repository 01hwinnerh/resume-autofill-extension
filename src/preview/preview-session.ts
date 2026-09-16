import type { FieldMatch, ScanResult } from '../shared/form';
import type { ConfirmedFill } from '../shared/messages';
import type { Profile } from '../shared/profile';
import { stringifyFieldValue } from '../ui/profile-management';
import { previewReasons } from '../ui/field-selection';

export type PreviewSession = FillPreviewSession | ProfilePreviewSession;

export interface FillPreviewItem {
  fieldId: string;
  group: string;
  label: string;
  currentValue: string;
  nextValue: string;
  profileKey: string;
  source: string;
  confidence?: number;
  reasons: string[];
}

export interface FillPreviewSession {
  id: string;
  kind: 'fill';
  createdAt: string;
  target: ScanResult['target'];
  page: ScanResult['page'];
  fields: ConfirmedFill[];
  items: FillPreviewItem[];
  profileSections: ProfilePreviewSection[];
}

export interface ProfilePreviewItem {
  key: string;
  label: string;
  value: string;
}

export interface ProfilePreviewSection {
  id: string;
  label: string;
  items: ProfilePreviewItem[];
}

export interface ProfilePreviewSession {
  id: string;
  kind: 'profile';
  createdAt: string;
  sections: ProfilePreviewSection[];
}

const SECTION_LABELS: Array<[string, string, string]> = [
  ['identity.', 'identity', '基本信息'],
  ['contact.', 'contact', '联系方式'],
  ['educations.', 'education', '教育经历'],
  ['workExperiences.', 'work', '工作经历'],
  ['projects.', 'project', '项目经历'],
  ['skills.', 'skills', '技能与证书'],
  ['preference.', 'preference', '求职意向'],
  ['links.', 'links', '个人链接'],
  ['custom.', 'custom', '自定义字段'],
];

function sessionId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function previewStorageKey(id: string): string {
  return `resume-autofill.preview.${id}`;
}

function groupName(match: FieldMatch): string {
  const section = match.descriptor.sectionLabel?.trim();
  if (section) {
    return match.descriptor.sectionIndex === undefined
      ? section
      : `${section} · 第 ${match.descriptor.sectionIndex + 1} 段`;
  }
  const key = match.selected?.profileKey ?? '';
  return SECTION_LABELS.find(([prefix]) => key.startsWith(prefix))?.[2] ?? '其他字段';
}

export function buildFillPreviewSession(
  scan: ScanResult,
  profile: Profile,
  confirmed: ConfirmedFill[],
): FillPreviewSession {
  const byId = new Map(scan.fields.map((match) => [match.descriptor.fieldId, match]));
  const items = confirmed.flatMap<FillPreviewItem>((field) => {
    const match = byId.get(field.fieldId);
    if (!match) return [];
    const profileField = profile.fields[field.profileKey];
    return [{
      fieldId: field.fieldId,
      group: groupName(match),
      label: match.descriptor.label || profileField?.label || '未命名字段',
      currentValue: stringifyFieldValue(match.descriptor.currentValue),
      nextValue: stringifyFieldValue(field.value),
      profileKey: field.profileKey,
      source: field.profileKey.startsWith('custom.') ? '自定义字段' : profileField ? '资料' : '本次输入',
      confidence: match.selected?.score,
      reasons: previewReasons(match, profile, !profileField),
    }];
  });
  return {
    id: sessionId('fill'),
    kind: 'fill',
    createdAt: new Date().toISOString(),
    target: scan.target,
    page: scan.page,
    fields: confirmed,
    items,
    profileSections: buildProfilePreviewSession(profile).sections,
  };
}

export function updateFillPreviewSessionValue(
  session: FillPreviewSession,
  fieldId: string,
  value: ConfirmedFill['value'],
  profileSections = session.profileSections,
): FillPreviewSession {
  const nextValue = stringifyFieldValue(value);
  const profileKey = session.fields.find((field) => field.fieldId === fieldId)?.profileKey;
  return {
    ...session,
    fields: session.fields.map((field) => field.fieldId === fieldId || (profileKey && field.profileKey === profileKey) ? { ...field, value } : field),
    items: session.items.map((item) => item.fieldId === fieldId || (profileKey && item.profileKey === profileKey) ? { ...item, nextValue } : item),
    profileSections,
  };
}

export function buildProfilePreviewSession(profile: Profile): ProfilePreviewSession {
  const groups = new Map<string, ProfilePreviewSection>();
  for (const field of Object.values(profile.fields)) {
    const value = stringifyFieldValue(field.value);
    if (!value) continue;
    const [, id, label] = SECTION_LABELS.find(([prefix]) => field.key.startsWith(prefix)) ?? ['', 'other', '其他资料'];
    const group = groups.get(id) ?? { id, label, items: [] };
    group.items.push({ key: field.key, label: field.label, value });
    groups.set(id, group);
  }
  return {
    id: sessionId('profile'),
    kind: 'profile',
    createdAt: new Date().toISOString(),
    sections: Array.from(groups.values()),
  };
}
