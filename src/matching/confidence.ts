import type { FieldStatus, MatchCandidate } from '../shared/form';
import type { FillPolicy } from '../shared/profile';

export const AUTO_MATCH_THRESHOLD = 0.85;
export const CONFIRMATION_THRESHOLD = 0.55;
export const CLOSE_TIE_THRESHOLD = 0.05;

function hasCloseTie(candidates: MatchCandidate[]): boolean {
  if (candidates.length < 2) {
    return false;
  }

  const [first, second] = [...candidates].sort((left, right) => right.score - left.score);
  return first.score - second.score <= CLOSE_TIE_THRESHOLD + Number.EPSILON;
}

export function assignConfidenceStatus(
  candidates: MatchCandidate[],
  policy: FillPolicy,
): FieldStatus {
  const selected = [...candidates].sort((left, right) => right.score - left.score)[0];

  if (!selected || policy === 'never') {
    return 'unsupported';
  }

  if (selected.source === 'user') {
    return 'matched';
  }

  if (selected.score >= AUTO_MATCH_THRESHOLD && policy === 'auto' && !hasCloseTie(candidates)) {
    return 'matched';
  }

  if (selected.score >= CONFIRMATION_THRESHOLD || hasCloseTie(candidates)) {
    return 'needs_confirmation';
  }

  return 'unsupported';
}
