import { describe, expect, it, vi } from 'vitest';
import { FillOperations } from '../../../src/runtime/fill-operation';
import type { PageFillResult } from '../../../src/shared/messages';

describe('page fill operations', () => {
  it('deduplicates the same operation and rejects another while writing', async () => {
    const operations = new FillOperations();
    let finish!: (value: PageFillResult[]) => void;
    let writes = 0;
    const write = () => { writes += 1; return new Promise<PageFillResult[]>((resolve) => { finish = resolve; }); };
    expect(operations.start('one', write).state).toBe('running');
    expect(() => operations.assertIdle()).toThrow(/进行/);
    expect(operations.start('one', write).state).toBe('running');
    expect(() => operations.start('two', write)).toThrow(/进行/);
    await Promise.resolve();
    expect(writes).toBe(1);
    const results: PageFillResult[] = [{ fieldId: 'email', outcome: { status: 'filled', fieldId: 'email' }, verification: { fieldId: 'email', verified: true } }];
    finish(results);
    await vi.waitFor(() => expect(operations.status('one')).toEqual({ operationId: 'one', state: 'completed', results }));
    expect(operations.start('one', write).state).toBe('completed');
    expect(writes).toBe(1);
  });

  it('returns detached point-in-time snapshots from start and status', async () => {
    const operations = new FillOperations();
    let finish!: (value: PageFillResult[]) => void;
    const started = operations.start('snapshot', () => new Promise<PageFillResult[]>((resolve) => { finish = resolve; }));
    expect(started.state).toBe('running');
    await Promise.resolve();
    finish([{ fieldId: 'name', outcome: { status: 'filled', fieldId: 'name' } }]);
    await vi.waitFor(() => expect(operations.status('snapshot').state).toBe('completed'));

    expect(started.state).toBe('running');
    const completed = operations.status('snapshot');
    completed.state = 'unknown';
    completed.results?.splice(0);
    expect(operations.status('snapshot')).toMatchObject({ state: 'completed', results: [{ fieldId: 'name' }] });
  });

  it('releases the active lock after a rejected write while keeping its unknown status queryable', async () => {
    const operations = new FillOperations();
    operations.start('one', async () => { throw new Error('interrupted'); });
    await vi.waitFor(() => expect(operations.status('one')).toEqual({ operationId: 'one', state: 'unknown' }));

    expect(() => operations.assertIdle()).not.toThrow();
    const results: PageFillResult[] = [{ fieldId: 'email', outcome: { status: 'filled', fieldId: 'email' } }];
    expect(operations.start('two', async () => results).state).toBe('running');
    await vi.waitFor(() => expect(operations.status('two')).toEqual({ operationId: 'two', state: 'completed', results }));
    expect(operations.status('one')).toEqual({ operationId: 'one', state: 'unknown' });
  });
});
