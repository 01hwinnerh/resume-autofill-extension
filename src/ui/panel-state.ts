import type { FillSummary } from '../runtime/application-controller';
import type { ScanResult } from '../shared/form';

export type PanelState =
  | { kind: 'idle'; error?: string }
  | { kind: 'scanning' }
  | { kind: 'review'; result: ScanResult }
  | { kind: 'filling'; selectedFieldIds: string[] }
  | { kind: 'result'; summary: FillSummary };

export type PanelAction =
  | { type: 'scan_requested' }
  | { type: 'scan_succeeded'; result: ScanResult }
  | { type: 'scan_failed'; message: string }
  | { type: 'fill_requested'; fieldIds: string[] }
  | { type: 'fill_succeeded'; summary: FillSummary };

export function reducePanel(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'scan_requested':
      return { kind: 'scanning' };
    case 'scan_succeeded':
      return { kind: 'review', result: action.result };
    case 'scan_failed':
      return { kind: 'idle', error: action.message };
    case 'fill_requested':
      return action.fieldIds.length === 0
        ? state
        : { kind: 'filling', selectedFieldIds: action.fieldIds };
    case 'fill_succeeded':
      return { kind: 'result', summary: action.summary };
  }
}
