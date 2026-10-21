import type { FieldMatch, ScanResult } from '../shared/form';
import type { ConfirmedFill } from '../shared/messages';
import type { FillPolicy, Profile, ProfileFieldType } from '../shared/profile';
import { profileFieldDefinitions } from '../ui/profile-fields';
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
  profileFieldType: ProfileFieldType;
  policy: FillPolicy;
  controlKind: FieldMatch['descriptor']['kind'];
  inputType?: string;
  options: FieldMatch['descriptor']['options'];
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
  repeatSectionWarnings: NonNullable<ScanResult['repeatSectionWarnings']>;
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

export const PREVIEW_SESSION_TTL_MS = 30 * 60 * 1000;
export const PREVIEW_SESSION_MAX = 12;
export const PREVIEW_SESSION_INDEX_KEY = 'resume-autofill.preview-index.v1';
const PREVIEW_STORAGE_PREFIX = 'resume-autofill.preview.';

interface PreviewSessionIndexEntry {
  id: string;
  createdAt: string;
}

export interface PreviewSessionStorage {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

let previewWriteQueue: Promise<void> = Promise.resolve();

function withPreviewWriteLock<T>(write: () => Promise<T>): Promise<T> {
  const result = previewWriteQueue.then(write, write);
  previewWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function previewStorageKey(id: string): string {
  return `${PREVIEW_STORAGE_PREFIX}${id}`;
}

export function isPreviewSessionExpired(session: PreviewSession, now = Date.now()): boolean {
  const createdAt = Date.parse(session.createdAt);
  return !Number.isFinite(createdAt) || now - createdAt > PREVIEW_SESSION_TTL_MS;
}

function isPreviewSession(value: unknown): value is PreviewSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PreviewSession>;
  return typeof candidate.id === 'string' && (candidate.kind === 'fill' || candidate.kind === 'profile') && typeof candidate.createdAt === 'string';
}

function readIndex(value: unknown): PreviewSessionIndexEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PreviewSessionIndexEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<PreviewSessionIndexEntry>;
    return typeof candidate.id === 'string' && typeof candidate.createdAt === 'string';
  });
}

function activeIndex(entries: PreviewSessionIndexEntry[], now: number): PreviewSessionIndexEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const createdAt = Date.parse(entry.createdAt);
    if (!Number.isFinite(createdAt) || now - createdAt > PREVIEW_SESSION_TTL_MS || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function storePreviewSession(storage: PreviewSessionStorage, session: PreviewSession, now = Date.now()): Promise<void> {
  await withPreviewWriteLock(async () => {
    const stored = await storage.get(PREVIEW_SESSION_INDEX_KEY);
    const indexed = readIndex(stored[PREVIEW_SESSION_INDEX_KEY]);
    const keep = activeIndex([{ id: session.id, createdAt: session.createdAt }, ...indexed], now).slice(0, PREVIEW_SESSION_MAX);
    const keepIds = new Set(keep.map((entry) => entry.id));
    const removeIds = new Set(indexed.filter((entry) => !keepIds.has(entry.id)).map((entry) => entry.id));
    if (!keepIds.has(session.id)) {
      removeIds.add(session.id);
      await storage.set({ [PREVIEW_SESSION_INDEX_KEY]: keep });
      await storage.remove([...removeIds].map(previewStorageKey));
      return;
    }
    await storage.set({
      [previewStorageKey(session.id)]: session,
      [PREVIEW_SESSION_INDEX_KEY]: keep,
    });
    if (removeIds.size) await storage.remove([...removeIds].map(previewStorageKey));
  });
}

export async function loadPreviewSession(storage: PreviewSessionStorage, id: string, now = Date.now()): Promise<PreviewSession | undefined> {
  return withPreviewWriteLock(async () => {
    const key = previewStorageKey(id);
    const stored = await storage.get([key, PREVIEW_SESSION_INDEX_KEY]);
    const value = stored[key];
    const indexed = readIndex(stored[PREVIEW_SESSION_INDEX_KEY]);
    if (!isPreviewSession(value) || isPreviewSessionExpired(value, now)) {
      const keep = activeIndex(indexed, now).filter((entry) => entry.id !== id);
      await storage.set({ [PREVIEW_SESSION_INDEX_KEY]: keep });
      if (value !== undefined) await storage.remove(key);
      return undefined;
    }

    // Legacy sessions were written without an index. Backfill the current ID without scanning storage.
    const keep = activeIndex([{ id, createdAt: value.createdAt }, ...indexed], now).slice(0, PREVIEW_SESSION_MAX);
    const keepIds = new Set(keep.map((entry) => entry.id));
    const removeIds = new Set(indexed.filter((entry) => !keepIds.has(entry.id)).map((entry) => entry.id));
    if (!keepIds.has(id)) removeIds.add(id);
    await storage.set({ [PREVIEW_SESSION_INDEX_KEY]: keep });
    if (removeIds.size) await storage.remove([...removeIds].map(previewStorageKey));
    return value;
  });
}

export async function removePreviewSession(storage: PreviewSessionStorage, id: string, now = Date.now()): Promise<void> {
  await withPreviewWriteLock(async () => {
    const stored = await storage.get(PREVIEW_SESSION_INDEX_KEY);
    const indexed = readIndex(stored[PREVIEW_SESSION_INDEX_KEY]);
    const keep = activeIndex(indexed, now).filter((entry) => entry.id !== id);
    await storage.set({ [PREVIEW_SESSION_INDEX_KEY]: keep });
    await storage.remove(previewStorageKey(id));
  });
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
  const definitions = profileFieldDefinitions(profile);
  const items = confirmed.flatMap<FillPreviewItem>((field) => {
    const match = byId.get(field.fieldId);
    if (!match) return [];
    const profileField = profile.fields[field.profileKey];
    const definition = definitions.find((item) => item.key === field.profileKey)
      ?? definitions.find((item) => item.key.replace(/\.\d+\./, '.0.') === field.profileKey.replace(/\.\d+\./, '.0.'));
    const profileFieldType: ProfileFieldType = profileField?.type ?? definition?.type
      ?? (match.descriptor.kind === 'checkbox' ? 'boolean' : ['select', 'radio', 'combobox'].includes(match.descriptor.kind) ? 'enum' : match.descriptor.inputType === 'date' || match.descriptor.inputType === 'month' ? 'date' : match.descriptor.inputType === 'number' ? 'number' : 'text');
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
      profileFieldType,
      policy: profileField?.policy ?? definition?.policy ?? 'review',
      controlKind: match.descriptor.kind,
      inputType: match.descriptor.inputType,
      options: match.descriptor.options,
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
    repeatSectionWarnings: scan.repeatSectionWarnings ?? [],
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
