import { storedRevision } from './local-storage';
import { StorageError, type StoragePort } from './storage-port';

export const STORAGE_TRANSACTION = 'storage-transaction' as const;
export const STORAGE_TRANSACTION_RECOVERY_STATE = 'storage-transaction-recovery-state' as const;
export const STORAGE_TRANSACTION_RESOLVE = 'storage-transaction-resolve' as const;
export const STORAGE_TRANSACTION_JOURNAL_KEY = 'resume-autofill.transaction.v1';
export const STORAGE_TRANSACTION_AUDIT_KEY = 'resume-autofill.transaction-audit.v1';
export const TRANSACTIONAL_STORAGE_KEYS = [
  'resume-autofill.profile.v1',
  'resume-autofill.mappings.v1',
  'resume-autofill.applications.v1',
] as const;

export type TransactionalStorageKey = typeof TRANSACTIONAL_STORAGE_KEYS[number];
export type TransactionKind = 'portable-import-v1' | 'portable-import-v2' | 'profile-mapping-update';
export type TransactionResolution = 'keep-current' | 'restore-previous';

export interface StorageTransactionTarget { key: TransactionalStorageKey; expectedRevision: number; value: unknown }
export interface StorageTransactionRequest { transactionId: string; kind: TransactionKind; targets: StorageTransactionTarget[] }
interface JournalValue { exists: boolean; value?: unknown }
export interface StorageTransactionJournal {
  schemaVersion: 1;
  transactionId: string;
  kind: TransactionKind;
  phase: 'applying' | 'committed' | 'recovering' | 'recovery-required' | 'manual-restoring';
  createdAt: string;
  previous: Record<string, JournalValue>;
  targets: StorageTransactionTarget[];
  appliedKeys: TransactionalStorageKey[];
  recoveredKeys: TransactionalStorageKey[];
  recoveryError?: string;
  resolution?: TransactionResolution;
}
export interface StorageRecoverySnapshot { key: TransactionalStorageKey; revision: number; value: unknown }
export interface StorageRecoveryState { journal: StorageTransactionJournal; current: StorageRecoverySnapshot[]; canRestore: boolean; rawJournal: unknown }
export interface StorageTransactionResolutionRequest {
  transactionId: string;
  action: TransactionResolution;
  expected: StorageRecoverySnapshot[];
  expectedJournal: unknown;
}
export interface StorageTransactionAudit {
  schemaVersion: 1;
  transactionId: string;
  kind: TransactionKind | 'unknown';
  status: 'auto-restored' | 'kept-current' | 'restored-previous';
  resolvedAt: string;
  revisions: Record<string, number>;
}
export interface StorageTransactionResult {
  ok: boolean;
  transactionId: string;
  outcome: 'committed' | 'failed-recovered' | 'manual-recovery-required' | 'resolved-kept-current' | 'resolved-restored';
  message?: string;
}

export type StorageCompareAndSetResult =
  | { ok: true }
  | { ok: false; error: { code: 'conflict' | 'recovery_required' | 'write_failed' | 'invalid_request'; message: string; outcome?: StorageTransactionResult['outcome'] } };

export class StorageTransactionError extends StorageError {
  readonly transactionId: string;
  readonly outcome: StorageTransactionResult['outcome'];
  constructor(result: StorageTransactionResult) {
    super(result.outcome === 'manual-recovery-required' ? 'recovery_required' : 'write_failed', 'write', STORAGE_TRANSACTION_JOURNAL_KEY, result.message);
    this.name = 'StorageTransactionError';
    this.transactionId = result.transactionId;
    this.outcome = result.outcome;
    this.message = result.message ?? (result.outcome === 'failed-recovered' ? '操作失败，已恢复到操作前状态。' : '操作失败，需要人工恢复。');
  }
}

function sameValue(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function previousMatches(value: unknown, previous: JournalValue): boolean {
  return previous.exists ? sameValue(value, previous.value) : value === undefined;
}
function validKey(value: unknown): value is TransactionalStorageKey {
  return typeof value === 'string' && TRANSACTIONAL_STORAGE_KEYS.includes(value as TransactionalStorageKey);
}
export function isStorageTransactionJournal(value: unknown): value is StorageTransactionJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Partial<StorageTransactionJournal>;
  return journal.schemaVersion === 1 && typeof journal.transactionId === 'string'
    && ['applying', 'committed', 'recovering', 'recovery-required', 'manual-restoring'].includes(journal.phase ?? '')
    && Array.isArray(journal.targets) && journal.targets.every((target) => validKey(target?.key))
    && Array.isArray(journal.appliedKeys) && journal.appliedKeys.every(validKey)
    && (journal.recoveredKeys === undefined || (Array.isArray(journal.recoveredKeys) && journal.recoveredKeys.every(validKey)))
    && !!journal.previous && typeof journal.previous === 'object';
}
function normalizedJournal(journal: StorageTransactionJournal): StorageTransactionJournal {
  return { ...journal, recoveredKeys: journal.recoveredKeys ?? [] };
}
async function clearJournal(storage: StoragePort): Promise<void> {
  if (storage.remove) await storage.remove(STORAGE_TRANSACTION_JOURNAL_KEY);
  else await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, undefined);
}
async function restoreValue(storage: StoragePort, key: TransactionalStorageKey, previous: JournalValue): Promise<void> {
  if (previous.exists) await storage.set(key, structuredClone(previous.value));
  else if (storage.remove) await storage.remove(key);
  else await storage.set(key, undefined);
}
async function currentSnapshots(storage: StoragePort, journal: StorageTransactionJournal): Promise<StorageRecoverySnapshot[]> {
  return Promise.all(journal.targets.map(async ({ key }) => {
    const value = await storage.get<unknown>(key);
    return { key, revision: storedRevision(value), value: structuredClone(value) };
  }));
}
export async function readStorageRecoveryState(storage: StoragePort): Promise<StorageRecoveryState | undefined> {
  const raw = await storage.get<unknown>(STORAGE_TRANSACTION_JOURNAL_KEY);
  if (raw === undefined) return undefined;
  if (!isStorageTransactionJournal(raw)) return { journal: raw as StorageTransactionJournal, current: [], canRestore: false, rawJournal: structuredClone(raw) };
  const journal = normalizedJournal(raw);
  return { journal, current: await currentSnapshots(storage, journal), canRestore: true, rawJournal: structuredClone(raw) };
}
async function appendAudit(storage: StoragePort, journal: StorageTransactionJournal, status: StorageTransactionAudit['status']): Promise<void> {
  const current = await currentSnapshots(storage, journal);
  const audit: StorageTransactionAudit = {
    schemaVersion: 1, transactionId: journal.transactionId, kind: journal.kind, status,
    resolvedAt: new Date().toISOString(), revisions: Object.fromEntries(current.map((item) => [item.key, item.revision])),
  };
  const previous = await storage.get<unknown>(STORAGE_TRANSACTION_AUDIT_KEY);
  const entries = Array.isArray(previous) ? previous.filter((item) => item && typeof item === 'object') as StorageTransactionAudit[] : [];
  const deduped = entries.filter((item) => item.transactionId !== audit.transactionId || item.status !== audit.status);
  await storage.set(STORAGE_TRANSACTION_AUDIT_KEY, [...deduped.slice(-19), audit]);
}
async function requireManual(storage: StoragePort, journal: StorageTransactionJournal, message: string): Promise<StorageTransactionResult> {
  const updated = { ...journal, phase: 'recovery-required' as const, recoveryError: message };
  await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, updated);
  return { ok: false, transactionId: journal.transactionId, outcome: 'manual-recovery-required', message: `自动恢复已停止：${message}。请选择保留当前数据或按旧快照恢复。` };
}

/** Called under the background's single storage mutex, or by the in-memory test fallback. */
export async function recoverStorageTransaction(storage: StoragePort): Promise<StorageTransactionResult | undefined> {
  const raw = await storage.get<unknown>(STORAGE_TRANSACTION_JOURNAL_KEY);
  if (raw === undefined) return undefined;
  if (!isStorageTransactionJournal(raw)) return { ok: false, transactionId: 'unknown', outcome: 'manual-recovery-required', message: '事务恢复日志已损坏；请导出后人工恢复。' };
  let journal = normalizedJournal(raw);
  if (journal.phase === 'committed') { await clearJournal(storage); return { ok: true, transactionId: journal.transactionId, outcome: 'committed' }; }
  if (journal.phase === 'recovery-required' || journal.phase === 'manual-restoring') {
    return { ok: false, transactionId: journal.transactionId, outcome: 'manual-recovery-required', message: journal.recoveryError ?? '事务等待用户明确处理。' };
  }
  const initial = await currentSnapshots(storage, journal);
  if (journal.phase === 'applying' && journal.recoveredKeys.length === 0 && journal.targets.every((target, index) => sameValue(initial[index]?.value, target.value))) {
    await clearJournal(storage); return { ok: true, transactionId: journal.transactionId, outcome: 'committed' };
  }
  journal = { ...journal, phase: 'recovering', recoveryError: undefined };
  await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
  try {
    for (let index = journal.targets.length - 1; index >= 0; index -= 1) {
      const target = journal.targets[index]!; const previous = journal.previous[target.key]!;
      const value = await storage.get<unknown>(target.key);
      if (!previousMatches(value, previous)) {
        if (!sameValue(value, target.value)) return requireManual(storage, journal, `${target.key} 已被并发修改，拒绝覆盖`);
        await restoreValue(storage, target.key, previous);
      }
      if (!journal.recoveredKeys.includes(target.key)) {
        journal = { ...journal, recoveredKeys: [...journal.recoveredKeys, target.key] };
        await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
      }
    }
    await appendAudit(storage, journal, 'auto-restored');
    await clearJournal(storage);
    return { ok: false, transactionId: journal.transactionId, outcome: 'failed-recovered', message: '检测到未完成操作，已幂等恢复到操作前状态。' };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '未知恢复错误';
    try { await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, { ...journal, phase: 'recovering', recoveryError: message }); } catch { /* Keep the last durable checkpoint. */ }
    return { ok: false, transactionId: journal.transactionId, outcome: 'manual-recovery-required', message: `恢复中断：${message}；已记录恢复进度，可重试或人工处理。` };
  }
}

function resolutionExpectedMatches(current: StorageRecoverySnapshot[], expected: StorageRecoverySnapshot[]): boolean {
  return current.length === expected.length && current.every((item) => {
    const match = expected.find((candidate) => candidate.key === item.key);
    return match?.revision === item.revision && sameValue(match.value, item.value);
  });
}
export async function resolveStorageTransaction(storage: StoragePort, request: StorageTransactionResolutionRequest): Promise<StorageTransactionResult> {
  const raw = await storage.get<unknown>(STORAGE_TRANSACTION_JOURNAL_KEY);
  if (!sameValue(raw, request.expectedJournal)) return { ok: false, transactionId: request.transactionId, outcome: 'manual-recovery-required', message: '事务日志已变化，请刷新后重新确认。' };
  if (!isStorageTransactionJournal(raw)) {
    if (raw === undefined || request.action !== 'keep-current') return { ok: false, transactionId: request.transactionId, outcome: 'manual-recovery-required', message: '日志损坏，只能导出后选择保留当前数据。' };
    const audit: StorageTransactionAudit = { schemaVersion: 1, transactionId: request.transactionId, kind: 'unknown', status: 'kept-current', resolvedAt: new Date().toISOString(), revisions: {} };
    const previousAudit = await storage.get<unknown>(STORAGE_TRANSACTION_AUDIT_KEY);
    await storage.set(STORAGE_TRANSACTION_AUDIT_KEY, [...(Array.isArray(previousAudit) ? previousAudit.slice(-19) : []), audit]);
    await clearJournal(storage);
    return { ok: true, transactionId: request.transactionId, outcome: 'resolved-kept-current', message: '已保留当前数据、清除损坏日志并写入审计记录。' };
  }
  let journal = normalizedJournal(raw);
  if (journal.transactionId !== request.transactionId) return { ok: false, transactionId: request.transactionId, outcome: 'manual-recovery-required', message: '事务日志已变化，请刷新后重新确认。' };
  const current = await currentSnapshots(storage, journal);
  if (!resolutionExpectedMatches(current, request.expected)) return requireManual(storage, journal, '确认后数据 revision 或内容发生变化，请刷新后重新选择');
  if (request.action === 'keep-current') {
    await appendAudit(storage, journal, 'kept-current');
    await clearJournal(storage);
    return { ok: true, transactionId: journal.transactionId, outcome: 'resolved-kept-current', message: '已保留当前数据并归档放弃事务的审计记录。' };
  }
  journal = { ...journal, phase: 'manual-restoring', resolution: 'restore-previous', recoveryError: undefined };
  await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
  try {
    for (let index = journal.targets.length - 1; index >= 0; index -= 1) {
      const target = journal.targets[index]!; const previous = journal.previous[target.key]!;
      const value = await storage.get<unknown>(target.key);
      if (!previousMatches(value, previous)) {
        const observed = request.expected.find((item) => item.key === target.key);
        if (!observed || !sameValue(value, observed.value)) return requireManual(storage, journal, `${target.key} 在恢复期间被并发修改，拒绝覆盖`);
        await restoreValue(storage, target.key, previous);
      }
      if (!journal.recoveredKeys.includes(target.key)) {
        journal = { ...journal, recoveredKeys: [...journal.recoveredKeys, target.key] };
        await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
      }
    }
    await appendAudit(storage, journal, 'restored-previous');
    await clearJournal(storage);
    return { ok: true, transactionId: journal.transactionId, outcome: 'resolved-restored', message: '已按事务旧快照恢复，并写入审计记录。' };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '未知恢复错误';
    try { await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, { ...journal, phase: 'manual-restoring', recoveryError: message }); } catch { /* Keep the last durable checkpoint. */ }
    return { ok: false, transactionId: journal.transactionId, outcome: 'manual-recovery-required', message: `人工恢复中断：${message}；进度已保留，可再次选择恢复。` };
  }
}

export async function executeCoordinatedCompareAndSet(storage: StoragePort, key: string, expectedRevision: number, value: unknown): Promise<StorageCompareAndSetResult> {
  if (!validKey(key)) return { ok: false, error: { code: 'invalid_request', message: `不允许对存储键 ${key} 执行 CAS。` } };
  try {
    const recovery = await recoverStorageTransaction(storage);
    if (recovery && !recovery.ok) {
      return {
        ok: false,
        error: {
          code: recovery.outcome === 'manual-recovery-required' ? 'recovery_required' : 'write_failed',
          message: recovery.message ?? '未完成的存储事务恢复失败。',
          outcome: recovery.outcome,
        },
      };
    }
    const current = await storage.get<unknown>(key);
    if (storedRevision(current) !== expectedRevision) {
      return { ok: false, error: { code: 'conflict', message: '存储 revision 已变化。' } };
    }
    await storage.set(key, value);
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: { code: 'write_failed', message: cause instanceof Error ? cause.message : '存储写入失败。' } };
  }
}

export async function executeStorageTransaction(storage: StoragePort, request: StorageTransactionRequest): Promise<StorageTransactionResult> {
  const recovered = await recoverStorageTransaction(storage);
  if (recovered?.outcome === 'manual-recovery-required') return recovered;
  if (!request.targets.length || new Set(request.targets.map((target) => target.key)).size !== request.targets.length || request.targets.some((target) => !TRANSACTIONAL_STORAGE_KEYS.includes(target.key))) {
    return { ok: false, transactionId: request.transactionId, outcome: 'manual-recovery-required', message: '事务目标无效，未写入任何数据。' };
  }
  const current = await Promise.all(request.targets.map((target) => storage.get<unknown>(target.key)));
  const conflict = request.targets.find((target, index) => storedRevision(current[index]) !== target.expectedRevision);
  if (conflict) return { ok: false, transactionId: request.transactionId, outcome: 'failed-recovered', message: `数据已被其他页面更新（${conflict.key}），本次操作未写入。` };
  const previous = Object.fromEntries(request.targets.map((target, index) => [target.key, { exists: current[index] !== undefined, ...(current[index] === undefined ? {} : { value: structuredClone(current[index]) }) }]));
  let journal: StorageTransactionJournal = { schemaVersion: 1, transactionId: request.transactionId, kind: request.kind, phase: 'applying', createdAt: new Date().toISOString(), previous, targets: structuredClone(request.targets), appliedKeys: [], recoveredKeys: [] };
  await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
  try {
    for (const target of request.targets) {
      const latest = await storage.get<unknown>(target.key);
      if (storedRevision(latest) !== target.expectedRevision) throw new Error(`数据已被其他页面更新（${target.key}）`);
      await storage.set(target.key, structuredClone(target.value));
      journal = { ...journal, appliedKeys: [...journal.appliedKeys, target.key] };
      await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
    }
    await storage.set(STORAGE_TRANSACTION_JOURNAL_KEY, { ...journal, phase: 'committed' });
    await clearJournal(storage);
    return { ok: true, transactionId: request.transactionId, outcome: 'committed' };
  } catch (cause) {
    const recovery = await recoverStorageTransaction(storage);
    if (recovery?.outcome === 'failed-recovered') return { ...recovery, message: `操作失败：${cause instanceof Error ? cause.message : '未知错误'}；已恢复到操作前状态。` };
    return recovery ?? { ok: false, transactionId: request.transactionId, outcome: 'manual-recovery-required', message: '操作失败且无法读取恢复状态。' };
  }
}

export function createTransactionId(): string { return globalThis.crypto?.randomUUID?.() ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
