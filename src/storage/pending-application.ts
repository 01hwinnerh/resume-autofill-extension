import { browser } from 'wxt/browser';

interface ApplicationDraftData {
  company: string;
  role: string;
  url: string;
  sourceHost: string;
}

export const PENDING_APPLICATION_KEY = 'resume-autofill.pending-application.v1';
export const PENDING_APPLICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingApplicationDraft extends ApplicationDraftData {
  updatedAt: string;
}

function isPendingDraft(value: unknown): value is PendingApplicationDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<PendingApplicationDraft>;
  return typeof draft.company === 'string' && typeof draft.role === 'string'
    && typeof draft.url === 'string' && typeof draft.sourceHost === 'string'
    && typeof draft.updatedAt === 'string' && Number.isFinite(Date.parse(draft.updatedAt));
}

export async function savePendingApplication(draft: ApplicationDraftData): Promise<PendingApplicationDraft> {
  const pending = { ...draft, updatedAt: new Date().toISOString() };
  await browser.storage.session.set({ [PENDING_APPLICATION_KEY]: pending });
  return pending;
}

export async function loadPendingApplication(now = Date.now()): Promise<PendingApplicationDraft | undefined> {
  const result = await browser.storage.session.get(PENDING_APPLICATION_KEY);
  const value = result[PENDING_APPLICATION_KEY];
  if (!isPendingDraft(value) || now - Date.parse(value.updatedAt) > PENDING_APPLICATION_TTL_MS) {
    if (value !== undefined) await clearPendingApplication();
    return undefined;
  }
  return value;
}

export async function clearPendingApplication(): Promise<void> {
  await browser.storage.session.remove(PENDING_APPLICATION_KEY);
}
