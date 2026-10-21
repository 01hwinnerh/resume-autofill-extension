import { describe, expect, it } from 'vitest';
import {
  executeCoordinatedCompareAndSet,
  executeStorageTransaction,
  readStorageRecoveryState,
  recoverStorageTransaction,
  resolveStorageTransaction,
  STORAGE_TRANSACTION_AUDIT_KEY,
  STORAGE_TRANSACTION_JOURNAL_KEY,
  type StorageTransactionJournal,
} from '../../../src/storage/coordinated-transaction';
import type { StoragePort } from '../../../src/storage/storage-port';

const PROFILE_KEY = 'resume-autofill.profile.v1' as const;
const MAPPINGS_KEY = 'resume-autofill.mappings.v1' as const;

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  failOnceFor?: string;
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> {
    if (key === this.failOnceFor) { this.failOnceFor = undefined; throw new Error(`${key} failed`); }
    this.values.set(key, structuredClone(value));
  }
  async remove(key: string): Promise<void> { this.values.delete(key); }
}

const oldProfile = { schemaVersion: 1, revision: 3, profile: { schemaVersion: 1, fields: {} } };
const newProfile = { schemaVersion: 1, revision: 4, profile: { schemaVersion: 1, fields: { name: { key: 'name', label: '姓名', type: 'text', value: '新', policy: 'auto' } } } };
const oldMappings = { schemaVersion: 1, revision: 7, mappings: [] };
const newMappings = { schemaVersion: 1, revision: 8, mappings: [] };

function request() {
  return { transactionId: 'tx-test', kind: 'profile-mapping-update' as const, targets: [
    { key: PROFILE_KEY, expectedRevision: 3, value: newProfile },
    { key: MAPPINGS_KEY, expectedRevision: 7, value: newMappings },
  ] };
}

describe('coordinated storage transaction', () => {
  it('rejects a concurrent page write before applying any target', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, oldProfile); storage.values.set(MAPPINGS_KEY, { ...oldMappings, revision: 8 });
    const result = await executeStorageTransaction(storage, request());
    expect(result).toMatchObject({ ok: false, outcome: 'failed-recovered' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(oldProfile);
    expect(storage.values.has(STORAGE_TRANSACTION_JOURNAL_KEY)).toBe(false);
  });

  it('restores the first collection when the second collection write fails', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, oldProfile); storage.values.set(MAPPINGS_KEY, oldMappings); storage.failOnceFor = MAPPINGS_KEY;
    const result = await executeStorageTransaction(storage, request());
    expect(result).toMatchObject({ ok: false, outcome: 'failed-recovered' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(oldProfile);
    expect(storage.values.get(MAPPINGS_KEY)).toEqual(oldMappings);
    expect(storage.values.has(STORAGE_TRANSACTION_JOURNAL_KEY)).toBe(false);
  });

  it('recovers an unfinished journal after a background restart', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, newProfile); storage.values.set(MAPPINGS_KEY, oldMappings);
    const journal: StorageTransactionJournal = {
      schemaVersion: 1, transactionId: 'tx-restart', kind: 'profile-mapping-update', phase: 'applying', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [],
    };
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, journal);
    await expect(recoverStorageTransaction(storage)).resolves.toMatchObject({ outcome: 'failed-recovered' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(oldProfile);
    expect(storage.values.has(STORAGE_TRANSACTION_JOURNAL_KEY)).toBe(false);
  });

  it('does not overwrite an unrelated write during recovery and leaves the journal for manual recovery', async () => {
    const storage = new MemoryStorage(); const concurrent = { ...newProfile, revision: 5 };
    storage.values.set(PROFILE_KEY, concurrent); storage.values.set(MAPPINGS_KEY, oldMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-manual', kind: 'profile-mapping-update', phase: 'applying', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [],
    } satisfies StorageTransactionJournal);
    await expect(recoverStorageTransaction(storage)).resolves.toMatchObject({ outcome: 'manual-recovery-required' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(concurrent);
    expect(storage.values.get(STORAGE_TRANSACTION_JOURNAL_KEY)).toMatchObject({ phase: 'recovery-required' });
  });

  it('blocks ordinary CAS while a transaction requires manual recovery', async () => {
    const storage = new MemoryStorage(); const concurrent = { ...newProfile, revision: 5 };
    storage.values.set(PROFILE_KEY, concurrent); storage.values.set(MAPPINGS_KEY, oldMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-block', kind: 'profile-mapping-update', phase: 'recovery-required', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [], recoveryError: 'manual',
    } satisfies StorageTransactionJournal);
    await expect(executeCoordinatedCompareAndSet(storage, PROFILE_KEY, 5, { ...concurrent, revision: 6 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'recovery_required', outcome: 'manual-recovery-required' },
    });
    expect(storage.values.get(PROFILE_KEY)).toEqual(concurrent);
  });

  it('checkpoints each restored key and continues idempotently after a restore write failure', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, newProfile); storage.values.set(MAPPINGS_KEY, newMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-resume', kind: 'profile-mapping-update', phase: 'recovering', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY, MAPPINGS_KEY], recoveredKeys: [],
    } satisfies StorageTransactionJournal);
    storage.failOnceFor = PROFILE_KEY;
    await expect(recoverStorageTransaction(storage)).resolves.toMatchObject({ outcome: 'manual-recovery-required' });
    expect(storage.values.get(MAPPINGS_KEY)).toEqual(oldMappings);
    expect(storage.values.get(STORAGE_TRANSACTION_JOURNAL_KEY)).toMatchObject({ phase: 'recovering', recoveredKeys: [MAPPINGS_KEY] });
    await expect(recoverStorageTransaction(storage)).resolves.toMatchObject({ outcome: 'failed-recovered' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(oldProfile);
    expect(storage.values.has(STORAGE_TRANSACTION_JOURNAL_KEY)).toBe(false);
  });

  it('requires revision-protected confirmation before keeping current data and writes an audit record', async () => {
    const storage = new MemoryStorage(); const concurrent = { ...newProfile, revision: 5 };
    storage.values.set(PROFILE_KEY, concurrent); storage.values.set(MAPPINGS_KEY, oldMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-keep', kind: 'profile-mapping-update', phase: 'recovery-required', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [], recoveryError: 'concurrent',
    } satisfies StorageTransactionJournal);
    const state = (await readStorageRecoveryState(storage))!;
    const result = await resolveStorageTransaction(storage, { transactionId: 'tx-keep', action: 'keep-current', expected: state.current, expectedJournal: state.rawJournal });
    expect(result).toMatchObject({ ok: true, outcome: 'resolved-kept-current' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(concurrent);
    expect(storage.values.has(STORAGE_TRANSACTION_JOURNAL_KEY)).toBe(false);
    expect(storage.values.get(STORAGE_TRANSACTION_AUDIT_KEY)).toEqual([expect.objectContaining({ transactionId: 'tx-keep', status: 'kept-current' })]);
  });

  it('restores old snapshots after explicit revision-protected confirmation', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, newProfile); storage.values.set(MAPPINGS_KEY, oldMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-restore', kind: 'profile-mapping-update', phase: 'recovery-required', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [],
    } satisfies StorageTransactionJournal);
    const state = (await readStorageRecoveryState(storage))!;
    await expect(resolveStorageTransaction(storage, { transactionId: 'tx-restore', action: 'restore-previous', expected: state.current, expectedJournal: state.rawJournal })).resolves.toMatchObject({ ok: true, outcome: 'resolved-restored' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(oldProfile);
    expect(storage.values.get(STORAGE_TRANSACTION_AUDIT_KEY)).toEqual([expect.objectContaining({ transactionId: 'tx-restore', status: 'restored-previous' })]);
  });

  it('stops manual snapshot restore when data changes after confirmation', async () => {
    const storage = new MemoryStorage(); storage.values.set(PROFILE_KEY, newProfile); storage.values.set(MAPPINGS_KEY, oldMappings);
    storage.values.set(STORAGE_TRANSACTION_JOURNAL_KEY, {
      schemaVersion: 1, transactionId: 'tx-protected', kind: 'profile-mapping-update', phase: 'recovery-required', createdAt: '2026-09-23T04:00:00.000Z',
      previous: { [PROFILE_KEY]: { exists: true, value: oldProfile }, [MAPPINGS_KEY]: { exists: true, value: oldMappings } },
      targets: request().targets, appliedKeys: [PROFILE_KEY], recoveredKeys: [],
    } satisfies StorageTransactionJournal);
    const state = (await readStorageRecoveryState(storage))!; const concurrent = { ...newProfile, revision: 9 };
    storage.values.set(PROFILE_KEY, concurrent);
    await expect(resolveStorageTransaction(storage, { transactionId: 'tx-protected', action: 'restore-previous', expected: state.current, expectedJournal: state.rawJournal })).resolves.toMatchObject({ outcome: 'manual-recovery-required' });
    expect(storage.values.get(PROFILE_KEY)).toEqual(concurrent);
  });
});
