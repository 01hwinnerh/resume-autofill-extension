import { describe, expect, it } from 'vitest';

import { matchFields } from '../../../src/matching/generic-matcher';
import type { PageFieldDescriptor } from '../../../src/shared/form';
import type { UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile, ProfileField } from '../../../src/shared/profile';

function descriptor(overrides: Partial<PageFieldDescriptor>): PageFieldDescriptor {
  return {
    fieldId: 'field-1',
    kind: 'text',
    label: 'Unmatched field',
    options: [],
    currentValue: null,
    framePath: [],
    fingerprint: 'text|unmatched field',
    ...overrides,
  };
}

function profileWith(
  key: string,
  value: ProfileField['value'],
  overrides: Partial<ProfileField> = {},
): Profile {
  return {
    schemaVersion: 1,
    fields: {
      [key]: {
        key,
        label: key,
        type: 'text',
        value,
        policy: 'auto',
        ...overrides,
      },
    },
  };
}

describe('matchFields', () => {
  it('matches Chinese and English aliases to the same canonical field', () => {
    const matches = matchFields(
      [descriptor({
        fieldId: 'f1',
        label: '移动电话',
        kind: 'text',
        name: 'mobile',
        autocomplete: 'tel',
      })],
      profileWith('contact.phone', 'phone-test-value'),
      { mappings: [] },
    );

    expect(matches[0].selected?.profileKey).toBe('contact.phone');
    expect(matches[0].status).toBe('matched');
  });

  it('requires confirmation for an ambiguous location label', () => {
    const [match] = matchFields(
      [descriptor({ label: 'Location' })],
      profileWith('preference.city', 'Shanghai'),
      { mappings: [] },
    );

    expect(match.selected?.profileKey).toBe('preference.city');
    expect(match.selected?.score).toBe(0.6);
    expect(match.status).toBe('needs_confirmation');
  });

  it('does not auto-match a type-incompatible candidate', () => {
    const [match] = matchFields(
      [descriptor({ label: 'Email', kind: 'select', options: [{ label: 'A', value: 'a' }] })],
      profileWith('contact.email', 'candidate@example.test'),
      { mappings: [] },
    );

    expect(match.selected?.score).toBe(0.55);
    expect(match.status).toBe('needs_confirmation');
  });

  it('uses an explicit user mapping instead of the generic result', () => {
    const field = descriptor({
      label: 'Name',
      name: 'name',
      fingerprint: 'text|name|name',
    });
    const mappings: UserFieldMapping[] = [{
      id: 'mapping-1',
      scope: { host: 'example.test' },
      fingerprint: field.fingerprint,
      profileKey: 'contact.email',
      createdAt: '2026-09-14T00:00:00.000Z',
    }];
    const profile: Profile = {
      schemaVersion: 1,
      fields: {
        ...profileWith('identity.name', 'Candidate').fields,
        ...profileWith('contact.email', 'candidate@example.test').fields,
      },
    };

    const [match] = matchFields([field], profile, { mappings });

    expect(match.selected).toMatchObject({
      profileKey: 'contact.email',
      score: 1,
      source: 'user',
    });
    expect(match.status).toBe('matched');
  });
});
