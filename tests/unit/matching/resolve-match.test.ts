import { describe, expect, it } from 'vitest';

import { resolveMatches } from '../../../src/matching/resolve-match';
import type { PageFieldDescriptor } from '../../../src/shared/form';
import type { UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile, ProfileField } from '../../../src/shared/profile';

function descriptor(overrides: Partial<PageFieldDescriptor> = {}): PageFieldDescriptor {
  return {
    fieldId: 'field-1',
    kind: 'text',
    label: 'Name',
    options: [],
    currentValue: null,
    framePath: [],
    fingerprint: 'text|name',
    ...overrides,
  };
}

function profileWith(fields: Record<string, Partial<ProfileField>>): Profile {
  return {
    schemaVersion: 1,
    fields: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, {
      key,
      label: key,
      type: 'text',
      value: 'value',
      policy: 'auto',
      ...field,
    }])),
  };
}

function mapping(field: PageFieldDescriptor, profileKey: string, host = 'fixture.test'): UserFieldMapping {
  return {
    id: 'mapping-1',
    scope: { host },
    fingerprint: field.fingerprint,
    profileKey,
    createdAt: '2026-09-14T00:00:00.000Z',
  };
}

describe('resolveMatches', () => {
  it('keeps a scoped user mapping ahead of an adapter hint and generic candidate', () => {
    const field = descriptor();
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': {}, 'contact.email': {} }),
      {
        mappings: [mapping(field, 'contact.email')],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [{ fieldId: field.fieldId, profileKey: 'identity.name', score: 1, reason: 'Adapter rule' }],
      },
    );

    expect(match.selected).toMatchObject({ profileKey: 'contact.email', source: 'user', score: 1 });
    expect(match.selected?.reasons).toEqual(['Explicit user mapping for this field fingerprint.']);
  });

  it('uses an adapter hint before generic matching and preserves its reason', () => {
    const field = descriptor({ label: 'Email' });
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': {}, 'contact.email': {} }),
      {
        mappings: [],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [{ fieldId: field.fieldId, profileKey: 'identity.name', score: 0.95, reason: 'Known platform field' }],
      },
    );

    expect(match.candidates.map((candidate) => candidate.source)).toEqual(['adapter', 'generic']);
    expect(match.selected).toEqual({
      profileKey: 'identity.name',
      score: 0.95,
      source: 'adapter',
      reasons: ['Known platform field'],
    });
    expect(match.status).toBe('matched');
  });

  it('selects the highest-scoring adapter hint regardless of input order', () => {
    const field = descriptor();
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': {}, 'contact.email': {} }),
      {
        mappings: [],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [
          { fieldId: field.fieldId, profileKey: 'identity.name', score: 0.8, reason: 'Lower score' },
          { fieldId: field.fieldId, profileKey: 'contact.email', score: 0.95, reason: 'Higher score' },
        ],
      },
    );

    expect(match.candidates.slice(0, 2).map((candidate) => candidate.profileKey))
      .toEqual(['contact.email', 'identity.name']);
    expect(match.selected).toMatchObject({ profileKey: 'contact.email', source: 'adapter', score: 0.95 });
  });

  it('requires confirmation when adapter hints are within the close-tie threshold', () => {
    const field = descriptor();
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': {}, 'contact.email': {} }),
      {
        mappings: [],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [
          { fieldId: field.fieldId, profileKey: 'identity.name', score: 0.95, reason: 'First candidate' },
          { fieldId: field.fieldId, profileKey: 'contact.email', score: 0.91, reason: 'Close candidate' },
        ],
      },
    );

    expect(match.selected).toMatchObject({ profileKey: 'identity.name', source: 'adapter' });
    expect(match.status).toBe('needs_confirmation');
  });

  it('falls back to adapter hints when a mapping scope does not match', () => {
    const field = descriptor();
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': {}, 'contact.email': {} }),
      {
        mappings: [mapping(field, 'contact.email', 'other.test')],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [{ fieldId: field.fieldId, profileKey: 'identity.name', score: 0.9, reason: 'Adapter rule' }],
      },
    );

    expect(match.selected).toMatchObject({ profileKey: 'identity.name', source: 'adapter' });
  });

  it('does not let an adapter hint override a never-policy profile field', () => {
    const field = descriptor();
    const [match] = resolveMatches(
      [field],
      profileWith({ 'identity.name': { policy: 'never' } }),
      {
        mappings: [],
        pageContext: { host: 'fixture.test', path: '/apply' },
        adapterHints: [{ fieldId: field.fieldId, profileKey: 'identity.name', score: 1, reason: 'Adapter rule' }],
      },
    );

    expect(match.selected).toMatchObject({ profileKey: 'identity.name', source: 'adapter' });
    expect(match.status).toBe('unsupported');
  });
});
