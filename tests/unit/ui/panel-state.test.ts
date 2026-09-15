import { describe, expect, it } from 'vitest';

import { reducePanel, type PanelState } from '../../../src/ui/panel-state';
import type { ScanResult } from '../../../src/shared/form';
import type { FillSummary } from '../../../src/runtime/application-controller';

const result: ScanResult = {
  page: { url: 'https://fixture.test/application', host: 'fixture.test', title: 'Fixture' },
  fields: [],
};

const summary: FillSummary = {
  filled: ['field-1'],
  verified: ['field-1'],
  skippedExisting: [],
  failed: [],
};

describe('panel state', () => {
  it('moves from idle through scan review and fill result', () => {
    const scanning = reducePanel({ kind: 'idle' }, { type: 'scan_requested' });
    const review = reducePanel(scanning, { type: 'scan_succeeded', result });
    const filling = reducePanel(review, { type: 'fill_requested', fieldIds: ['field-1'] });
    const finished = reducePanel(filling, { type: 'fill_succeeded', summary });

    expect(scanning).toEqual({ kind: 'scanning' });
    expect(review).toEqual({ kind: 'review', result });
    expect(filling).toEqual({ kind: 'filling', selectedFieldIds: ['field-1'] });
    expect(finished).toEqual({ kind: 'result', summary });
  });

  it('returns to idle with an error after a scan failure', () => {
    const state = reducePanel({ kind: 'scanning' }, {
      type: 'scan_failed',
      message: 'The active tab is unavailable',
    });

    expect(state).toEqual({ kind: 'idle', error: 'The active tab is unavailable' });
  });

  it('does not leave review state when no field is confirmed', () => {
    const review: PanelState = { kind: 'review', result };
    const next = reducePanel(review, { type: 'fill_requested', fieldIds: [] });

    expect(next).toEqual(review);
  });
});
