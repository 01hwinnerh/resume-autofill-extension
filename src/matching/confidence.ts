import type { FieldStatus, MatchCandidate } from '../shared/form';
import type { FillPolicy } from '../shared/profile';

export const AUTO_MATCH_THRESHOLD = 0.5;
export const CLOSE_TIE_THRESHOLD = 0.05;

function hasCloseTie(candidates: MatchCandidate[]): boolean {
  if (candidates.length < 2) return false;
  const [first, second] = [...candidates].sort((left, right) => right.score - left.score);
  return first.score - second.score <= CLOSE_TIE_THRESHOLD + Number.EPSILON;
}

export function assignConfidenceStatus(
  candidates: MatchCandidate[],
  policy: FillPolicy,
): FieldStatus {
  const selected = [...candidates].sort((left, right) => right.score - left.score)[0];

  // `never` is an absolute safety boundary, including explicit user mappings.
  if (!selected || policy === 'never') return 'unsupported';
  if (policy === 'review') return 'needs_confirmation';
  if (selected.source === 'user') return 'matched';
  if (selected.score > AUTO_MATCH_THRESHOLD && !hasCloseTie(candidates)) return 'matched';
  return 'needs_confirmation';
}
