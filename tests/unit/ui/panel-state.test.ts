import { describe, expect, it } from 'vitest';

import { reducePanel, type PanelState } from '../../../src/ui/panel-state';
import type { ScanResult } from '../../../src/shared/form';
import type { FillSummary } from '../../../src/runtime/application-controller';
import type { ConfirmedFill } from '../../../src/shared/messages';

const result: ScanResult = {
  page: { url: 'https://fixture.test/application', host: 'fixture.test', title: 'Fixture' },
  fields: [],
};

const fields: ConfirmedFill[] = [{ fieldId: 'field-1', profileKey: 'identity.name', value: '测试用户' }];
const summary: FillSummary = {
  filled: ['field-1'],
  verified: ['field-1'],
  skippedExisting: [],
  failed: [],
};

describe('panel state', () => {
  it('moves from idle through scan review and fill result while retaining retry context', () => {
    const scanning = reducePanel({ kind: 'idle' }, { type: 'scan_requested' });
    const review = reducePanel(scanning, { type: 'scan_succeeded', result });
    const filling = reducePanel(review, { type: 'fill_requested', fields });
    const finished = reducePanel(filling, { type: 'fill_succeeded', summary });

    expect(scanning).toEqual({ kind: 'scanning' });
    expect(review).toEqual({ kind: 'review', result });
    expect(filling).toEqual({ kind: 'filling', result, fields });
    expect(finished).toEqual({ kind: 'result', result, fields, summary });
  });

  it('allows failed fields to be retried from the result state', () => {
    const previous: PanelState = { kind: 'result', result, fields, summary: { ...summary, failed: [{ fieldId: 'field-1', reason: 'verification failed' }] } };
    const retry = [{ ...fields[0], overwrite: true }];
    expect(reducePanel(previous, { type: 'fill_requested', fields: retry })).toEqual({ kind: 'filling', result, fields: retry });
  });

  it('keeps the stale result only in an explicit blocked invalidated state', () => {
    const review: PanelState = { kind: 'review', result };
    expect(reducePanel(review, { type: 'scan_invalidated', message: '页面已变化，请重新扫描' })).toEqual({
      kind: 'invalidated', result, message: '页面已变化，请重新扫描',
    });
  });

  it('does not misclassify an ordinary scan failure as page invalidation', () => {
    const state = reducePanel({ kind: 'scanning' }, { type: 'scan_failed', message: 'The active tab is unavailable' });
    expect(state).toEqual({ kind: 'idle', error: 'The active tab is unavailable' });
  });

  it('does not leave review state when no field is confirmed', () => {
    const review: PanelState = { kind: 'review', result };
    expect(reducePanel(review, { type: 'fill_requested', fields: [] })).toEqual(review);
  });
});
