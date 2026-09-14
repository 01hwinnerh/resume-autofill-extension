import { describe, expect, it } from 'vitest';

import { assignConfidenceStatus } from '../../../src/matching/confidence';
import type { MatchCandidate } from '../../../src/shared/form';
import type { FillPolicy } from '../../../src/shared/profile';

function candidate(score: number): MatchCandidate {
  return {
    profileKey: 'contact.email',
    score,
    source: 'generic',
    reasons: ['Normalized label matches email'],
  };
}

describe('assignConfidenceStatus', () => {
  it('marks an auto-policy candidate at the confirmed threshold as matched', () => {
    expect(assignConfidenceStatus([candidate(0.85)], 'auto')).toBe('matched');
  });

  it('requires confirmation below the auto threshold', () => {
    expect(assignConfidenceStatus([candidate(0.84)], 'auto')).toBe('needs_confirmation');
  });

  it('requires confirmation when candidates are within the close-tie threshold', () => {
    expect(assignConfidenceStatus([candidate(0.9), candidate(0.85)], 'auto')).toBe('needs_confirmation');
  });

  it('marks never-policy fields unsupported regardless of score', () => {
    const policy: FillPolicy = 'never';

    expect(assignConfidenceStatus([candidate(1)], policy)).toBe('unsupported');
  });
});
