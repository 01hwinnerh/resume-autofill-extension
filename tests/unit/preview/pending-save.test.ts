import { describe, expect, it, vi } from 'vitest';
import { PendingSaveCoordinator } from '../../../src/preview/pending-save';

describe('PendingSaveCoordinator', () => {
  it('makes an immediate confirmation wait for the save started by blur', async () => {
    const coordinator = new PendingSaveCoordinator(); let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const save = coordinator.run('field', 'blur value', () => gate);
    const confirmed = vi.fn(); const confirmation = coordinator.flush().then((ok) => { if (ok) confirmed(); });
    await Promise.resolve(); expect(confirmed).not.toHaveBeenCalled();
    release(); await save; await confirmation; expect(confirmed).toHaveBeenCalledOnce();
  });

  it('serializes session writes so consecutive edits to A and B retain both changes', async () => {
    const coordinator = new PendingSaveCoordinator(); const session: Record<string, string> = {};
    let releaseA!: () => void; const gateA = new Promise<void>((resolve) => { releaseA = resolve; });
    const writeA = coordinator.serializeSession(async () => { await gateA; session.A = 'new A'; });
    const writeB = coordinator.serializeSession(async () => { session.B = 'new B'; });
    await Promise.resolve(); expect(session).toEqual({});
    releaseA(); await Promise.all([writeA, writeB]);
    expect(session).toEqual({ A: 'new A', B: 'new B' });
  });

  it('forces an unfinished IME draft to save before confirmation', async () => {
    const coordinator = new PendingSaveCoordinator(); const persisted = vi.fn(async () => undefined);
    coordinator.setComposing('name', true); coordinator.updateDraft('name', '方浩');
    await expect(coordinator.flush(persisted)).resolves.toBe(true);
    expect(persisted).toHaveBeenCalledWith('name', '方浩');
  });

  it('reports failed saves and allows an explicit retry to clear the failure', async () => {
    const coordinator = new PendingSaveCoordinator();
    await expect(coordinator.run('field', 'value', async () => { throw new Error('disk failed'); })).rejects.toThrow('disk failed');
    await expect(coordinator.flush()).resolves.toBe(false);
    await coordinator.run('field', 'value', async () => undefined);
    await expect(coordinator.flush()).resolves.toBe(true);
  });
});
