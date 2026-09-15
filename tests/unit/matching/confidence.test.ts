import { describe, expect, it } from 'vitest';
import { assignConfidenceStatus } from '../../../src/matching/confidence';
import type { MatchCandidate } from '../../../src/shared/form';

function candidate(score: number, source: MatchCandidate['source'] = 'generic', key = 'contact.email'): MatchCandidate {
  return { profileKey: key, score, source, reasons: ['match'] };
}

describe('assignConfidenceStatus', () => {
  it('matches an ordinary auto field only strictly above 0.5', () => {
    expect(assignConfidenceStatus([candidate(0.500001)], 'auto')).toBe('matched');
  });

  it('requires confirmation at the exact 0.5 boundary and below when a candidate exists', () => {
    expect(assignConfidenceStatus([candidate(0.5)], 'auto')).toBe('needs_confirmation');
    expect(assignConfidenceStatus([candidate(0.2)], 'auto')).toBe('needs_confirmation');
  });

  it('requires confirmation for a close tie even above threshold', () => {
    expect(assignConfidenceStatus([candidate(0.9), candidate(0.85, 'generic', 'contact.phone')], 'auto')).toBe('needs_confirmation');
  });

  it('always requires confirmation for review policy', () => {
    expect(assignConfidenceStatus([candidate(1)], 'review')).toBe('needs_confirmation');
    expect(assignConfidenceStatus([candidate(1, 'user')], 'review')).toBe('needs_confirmation');
  });

  it('allows an explicit user mapping for auto but never bypasses never policy', () => {
    expect(assignConfidenceStatus([candidate(0.1, 'user')], 'auto')).toBe('matched');
    expect(assignConfidenceStatus([candidate(1, 'user')], 'never')).toBe('unsupported');
  });

  it('is unsupported only when no candidate exists or policy is never', () => {
    expect(assignConfidenceStatus([], 'auto')).toBe('unsupported');
    expect(assignConfidenceStatus([candidate(0)], 'auto')).toBe('needs_confirmation');
  });
});
