import { browser } from 'wxt/browser';
import { inferApplicationIdentity } from '../runtime/application-identity';
import type { ScanPageInfo } from '../shared/form';

export interface ApplicationDraftData {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
}

export const PENDING_APPLICATION_KEY = 'resume-autofill.pending-application.v1';
export const PENDING_APPLICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_APPLICATION_MAX = 50;

export interface PendingApplicationDraft extends ApplicationDraftData {
  targetKey: string;
  updatedAt: string;
}

interface PendingApplicationCollection {
  schemaVersion: 2;
  drafts: PendingApplicationDraft[];
}

let pendingWriteQueue = Promise.resolve();
function enqueuePendingWrite<T>(work: () => Promise<T>): Promise<T> {
  const operation = pendingWriteQueue.then(work);
  pendingWriteQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch { return value.trim(); }
}

export function pendingApplicationTargetKey(draft: Pick<ApplicationDraftData, 'url' | 'company' | 'role'>): string {
  const url = normalizedUrl(draft.url);
  return url || `${draft.company.trim().toLocaleLowerCase()}\u0000${draft.role.trim().toLocaleLowerCase()}`;
}

function isPendingDraft(value: unknown): value is PendingApplicationDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<PendingApplicationDraft>;
  return typeof draft.company === 'string' && typeof draft.role === 'string'
    && typeof draft.url === 'string' && typeof draft.sourceHost === 'string'
    && typeof draft.targetKey === 'string' && typeof draft.updatedAt === 'string'
    && Number.isFinite(Date.parse(draft.updatedAt));
}

function decode(value: unknown): PendingApplicationDraft[] {
  if (value && typeof value === 'object' && (value as { schemaVersion?: unknown }).schemaVersion === 2) {
    const drafts = (value as { drafts?: unknown }).drafts;
    return Array.isArray(drafts) ? drafts.filter(isPendingDraft) : [];
  }
  // Releases before P1-C stored one draft without a target key.
  if (value && typeof value === 'object') {
    const legacy = value as Partial<PendingApplicationDraft>;
    if (typeof legacy.company === 'string' && typeof legacy.role === 'string' && typeof legacy.url === 'string'
      && typeof legacy.sourceHost === 'string' && typeof legacy.updatedAt === 'string' && Number.isFinite(Date.parse(legacy.updatedAt))) {
      return [{ ...legacy as ApplicationDraftData & { updatedAt: string }, targetKey: pendingApplicationTargetKey(legacy as ApplicationDraftData) }];
    }
  }
  return [];
}

function activeDrafts(drafts: PendingApplicationDraft[], now: number): PendingApplicationDraft[] {
  return drafts.filter((draft) => now - Date.parse(draft.updatedAt) <= PENDING_APPLICATION_TTL_MS)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, PENDING_APPLICATION_MAX);
}

async function readCollection(now = Date.now()): Promise<PendingApplicationDraft[]> {
  const stored = await browser.storage.session.get(PENDING_APPLICATION_KEY);
  const decoded = decode(stored[PENDING_APPLICATION_KEY]);
  const active = activeDrafts(decoded, now);
  if (active.length !== decoded.length) await writeCollection(active);
  return active;
}

async function writeCollection(drafts: PendingApplicationDraft[]): Promise<void> {
  if (!drafts.length) { await browser.storage.session.remove(PENDING_APPLICATION_KEY); return; }
  const value: PendingApplicationCollection = { schemaVersion: 2, drafts };
  await browser.storage.session.set({ [PENDING_APPLICATION_KEY]: value });
}

export async function savePendingApplication(draft: ApplicationDraftData, now = Date.now()): Promise<PendingApplicationDraft> {
  return enqueuePendingWrite(async () => {
    const pending = { ...draft, targetKey: pendingApplicationTargetKey(draft), updatedAt: new Date(now).toISOString() };
    const existing = await readCollection(now);
    await writeCollection(activeDrafts([pending, ...existing.filter((item) => item.targetKey !== pending.targetKey)], now));
    return pending;
  });
}

export async function savePendingApplicationForPage(page: ScanPageInfo, now = Date.now()): Promise<PendingApplicationDraft> {
  const identity = inferApplicationIdentity(page);
  return savePendingApplication({ company: identity.company, role: identity.role, url: page.url, sourceHost: new URL(page.url).host }, now);
}

export interface PendingApplicationMatch {
  kind: 'none' | 'exact' | 'single-host' | 'multiple-host';
  selected?: PendingApplicationDraft;
  candidates: PendingApplicationDraft[];
}

function comparableHost(value: string): string {
  try { return new URL(value).host.toLocaleLowerCase(); } catch { return ''; }
}

/** Exact URL wins. Host fallback is automatic only when it is unambiguous. */
export async function matchPendingApplications(targetUrl: string, now = Date.now()): Promise<PendingApplicationMatch> {
  const drafts = await readCollection(now);
  const targetKey = pendingApplicationTargetKey({ url: targetUrl, company: '', role: '' });
  const exact = drafts.find((draft) => draft.targetKey === targetKey);
  if (exact) return { kind: 'exact', selected: exact, candidates: [exact] };
  const host = comparableHost(targetUrl);
  const candidates = host ? drafts.filter((draft) => comparableHost(draft.url) === host || draft.sourceHost.toLocaleLowerCase() === host) : [];
  if (!candidates.length) return { kind: 'none', candidates: [] };
  if (candidates.length === 1) return { kind: 'single-host', selected: candidates[0], candidates };
  return { kind: 'multiple-host', candidates };
}

export async function loadPendingApplication(target?: Partial<ApplicationDraftData>, now = Date.now()): Promise<PendingApplicationDraft | undefined> {
  const drafts = await readCollection(now);
  if (!target) return drafts[0];
  const key = pendingApplicationTargetKey({ url: target.url ?? '', company: target.company ?? '', role: target.role ?? '' });
  return drafts.find((draft) => draft.targetKey === key);
}

export async function clearPendingApplication(target?: Pick<PendingApplicationDraft, 'targetKey'> | Partial<ApplicationDraftData>): Promise<void> {
  return enqueuePendingWrite(async () => {
    if (!target) { await browser.storage.session.remove(PENDING_APPLICATION_KEY); return; }
    const draftTarget = target as Partial<ApplicationDraftData>;
    const key = 'targetKey' in target && target.targetKey
      ? target.targetKey
      : pendingApplicationTargetKey({ url: draftTarget.url ?? '', company: draftTarget.company ?? '', role: draftTarget.role ?? '' });
    const drafts = await readCollection();
    await writeCollection(drafts.filter((draft) => draft.targetKey !== key));
  });
}
