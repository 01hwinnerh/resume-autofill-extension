export type SaveState = 'saving' | 'saved' | 'failed';

export class PendingSaveCoordinator {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failures = new Set<string>();
  private readonly drafts = new Map<string, string>();
  private readonly queuedValues = new Map<string, string>();
  private readonly composing = new Set<string>();
  private sessionQueue: Promise<void> = Promise.resolve();

  updateDraft(key: string, value: string): void { this.drafts.set(key, value); }
  setComposing(key: string, active: boolean): void { if (active) this.composing.add(key); else this.composing.delete(key); }
  isComposing(key: string): boolean { return this.composing.has(key); }
  draft(key: string): string | undefined { return this.drafts.get(key); }

  run(key: string, value: string, save: (value: string) => Promise<void>): Promise<void> {
    this.failures.delete(key); this.queuedValues.set(key, value);
    const previous = this.pending.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => save(value));
    this.pending.set(key, operation);
    void operation.then(
      () => {
        if (this.pending.get(key) !== operation) return;
        if (this.drafts.get(key) === value) this.drafts.delete(key);
        if (this.queuedValues.get(key) === value) this.queuedValues.delete(key);
        this.failures.delete(key);
        this.pending.delete(key);
      },
      () => {
        if (this.pending.get(key) !== operation) return;
        this.failures.add(key);
        this.pending.delete(key);
      },
    );
    return operation;
  }

  serializeSession(save: () => Promise<void>): Promise<void> {
    const operation = this.sessionQueue.catch(() => undefined).then(save);
    this.sessionQueue = operation.catch(() => undefined);
    return operation;
  }

  async flush(saveDraft?: (key: string, value: string) => Promise<void>): Promise<boolean> {
    if (saveDraft) {
      for (const [key, value] of this.drafts) {
        if (this.queuedValues.get(key) !== value) void this.run(key, value, (next) => saveDraft(key, next)).catch(() => undefined);
      }
    }
    while (this.pending.size) await Promise.allSettled([...this.pending.values()]);
    await this.sessionQueue;
    return this.failures.size === 0 && this.drafts.size === 0;
  }

  hasPending(): boolean { return this.pending.size > 0 || this.drafts.size > 0; }
  hasFailure(): boolean { return this.failures.size > 0; }
}
