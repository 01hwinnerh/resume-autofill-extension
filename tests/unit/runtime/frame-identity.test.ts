import { describe, expect, it } from 'vitest';

import { createFrameIdentity } from '../../../src/runtime/frame-identity';

describe('semantic frame identity', () => {
  it('stays stable across SPA query, hash, and title changes', () => {
    const before = createFrameIdentity({ url: 'https://jobs.example.test/apply?step=1#profile', top: true });
    const after = createFrameIdentity({ url: 'https://jobs.example.test/apply?step=2#review', top: true });
    expect(before).toBe('https://jobs.example.test/apply');
    expect(after).toBe(before);
  });

  it('keeps different iframe semantics isolated without transient frame IDs', () => {
    const left = createFrameIdentity({
      url: 'https://ats.example.test/form?token=one',
      top: false,
      name: 'education-frame',
      ancestorOrigins: ['https://jobs.example.test'],
    });
    const right = createFrameIdentity({
      url: 'https://ats.example.test/form?token=two',
      top: false,
      name: 'experience-frame',
      ancestorOrigins: ['https://jobs.example.test'],
    });
    expect(left).not.toBe(right);
    expect(left).not.toMatch(/token=|title|frameId/);
  });
});
