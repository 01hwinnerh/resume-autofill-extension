import type { FillSummary } from '../runtime/application-controller';
import type { ScanResult } from '../shared/form';
import type { ConfirmedFill } from '../shared/messages';

export type PanelState =
  | { kind: 'idle'; error?: string }
  | { kind: 'scanning' }
  | { kind: 'review'; result: ScanResult }
  | { kind: 'invalidated'; result: ScanResult; message: string }
  | { kind: 'filling'; result: ScanResult; fields: ConfirmedFill[] }
  | { kind: 'result'; result: ScanResult; fields: ConfirmedFill[]; summary: FillSummary };

export type PanelAction =
  | { type: 'scan_requested' }
  | { type: 'scan_succeeded'; result: ScanResult }
  | { type: 'scan_failed'; message: string }
  | { type: 'scan_invalidated'; message: string }
  | { type: 'fill_requested'; fields: ConfirmedFill[] }
  | { type: 'fill_succeeded'; summary: FillSummary };

export function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'scan_requested':
      return { kind: 'scanning' };
    case 'scan_succeeded':
      return { kind: 'review', result: action.result };
    case 'scan_failed':
      return { kind: 'idle', error: action.message };
    case 'scan_invalidated':
      return state.kind === 'review' || state.kind === 'filling' || state.kind === 'result'
        ? { kind: 'invalidated', result: state.result, message: action.message }
        : state;
    case 'fill_requested':
      return action.fields.length === 0 || (state.kind !== 'review' && state.kind !== 'result')
        ? state
        : { kind: 'filling', result: state.result, fields: action.fields };
    case 'fill_succeeded':
      return state.kind === 'filling'
        ? { kind: 'result', result: state.result, fields: state.fields, summary: action.summary }
        : state;
  }
}
