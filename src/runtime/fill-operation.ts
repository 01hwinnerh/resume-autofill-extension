import type { PageFillResult } from '../shared/messages';
import { createRuntimeError, RuntimeRequestError } from './runtime-errors';

export interface FillOperationStatus {
  operationId: string;
  state: 'running' | 'completed' | 'unknown';
  results?: PageFillResult[];
}

export class FillOperations {
  private readonly operations = new Map<string, FillOperationStatus>();
  private active?: string;

  private snapshot(status: FillOperationStatus): FillOperationStatus {
    return {
      ...status,
      results: status.results?.map((result) => ({ ...result })),
    };
  }

  /** Starts an operation and returns a point-in-time snapshot; poll status() for updates. */
  start(operationId: string, write: () => Promise<PageFillResult[]>): FillOperationStatus {
    const existing = this.operations.get(operationId);
    if (existing) return this.snapshot(existing);
    this.assertIdle();
    const status: FillOperationStatus = { operationId, state: 'running' };
    this.operations.set(operationId, status);
    this.active = operationId;
    const finish = (completed: FillOperationStatus) => {
      this.operations.set(operationId, completed);
      if (this.active === operationId) this.active = undefined;
      while (this.operations.size > 100) this.operations.delete(this.operations.keys().next().value!);
    };
    void Promise.resolve().then(write).then(
      (results) => finish({ operationId, state: 'completed', results }),
      () => finish({ operationId, state: 'unknown' }),
    );
    return this.snapshot(status);
  }

  assertIdle(): void {
    if (this.active) {
      throw new RuntimeRequestError(createRuntimeError('FILL_IN_PROGRESS', '上一次填写仍在进行或结果未确认，请等待并检查页面；不要重复填写。', false));
    }
  }

  /** Returns a point-in-time snapshot that callers may safely mutate. */
  status(operationId: string): FillOperationStatus {
    const status = this.operations.get(operationId) ?? { operationId, state: 'unknown' as const };
    return this.snapshot(status);
  }
}
