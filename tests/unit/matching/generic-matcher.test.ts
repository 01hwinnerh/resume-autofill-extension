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
  it('recognizes known page fields even when the profile is empty', () => {
    const profile: Profile = { schemaVersion: 1, fields: {} };
    const matches = matchFields(
      [
        descriptor({ fieldId: 'name', label: '姓名', name: 'full_name', autocomplete: 'name' }),
        descriptor({ fieldId: 'degree', label: '学历类型', kind: 'combobox', sectionLabel: '教育经历', sectionIndex: 0 }),
      ],
      profile,
      { mappings: [], pageContext: { host: 'fixture.test', path: '/all-features-ats.html' } },
    );

    expect(matches).toMatchObject([
      { status: 'missing_profile', selected: { profileKey: 'identity.name', source: 'generic' } },
      { status: 'missing_profile', selected: { profileKey: 'educations.0.degreeType', source: 'generic' } },
    ]);
  });

  it('still leaves unknown fields unrecognized when the profile is empty', () => {
    const [match] = matchFields(
      [descriptor({ label: '内部审批编码', name: 'internal_approval_code' })],
      { schemaVersion: 1, fields: {} },
      { mappings: [], pageContext: { host: 'fixture.test', path: '/all-features-ats.html' } },
    );

    expect(match.status).toBe('unrecognized');
    expect(match.selected).toBeUndefined();
  });

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
      { mappings: [], pageContext: { host: 'fixture.test', path: '/application' } },
    );

    expect(matches[0].selected?.profileKey).toBe('contact.phone');
    expect(matches[0].status).toBe('matched');
  });

  it('requires confirmation for an ambiguous location label', () => {
    const [match] = matchFields(
      [descriptor({ label: 'Location' })],
      profileWith('preference.city', 'Shanghai'),
      { mappings: [], pageContext: { host: 'fixture.test', path: '/application' } },
    );

    expect(match.selected?.profileKey).toBe('preference.city');
    expect(match.selected?.score).toBe(0.55);
    expect(match.status).toBe('matched');
  });

  it('keeps an education start date separate from employment start time', () => {
    const profile: Profile = { schemaVersion: 1, fields: {
      'educations.0.startDate': { key: 'educations.0.startDate', label: '入学时间', type: 'date', value: '2022-09', policy: 'auto' },
      'employment.startWorkDate': { key: 'employment.startWorkDate', label: '参加工作时间', type: 'date', value: null, policy: 'auto' },
    } };
    const [match] = matchFields(
      [descriptor({ label: '入学时间', inputType: 'month', sectionLabel: '教育经历', sectionIndex: 0 })],
      profile,
      { mappings: [], pageContext: { host: 'jobs.bytedance.com', path: '/campus/resume/example/apply' } },
    );

    expect(match.selected?.profileKey).toBe('educations.0.startDate');
    expect(match.status).toBe('matched');
  });

  it('does not use a repeated-section index as the only evidence for an unrelated date field', () => {
    const profile: Profile = { schemaVersion: 1, fields: {
      'educations.0.degree': { key: 'educations.0.degree', label: '学历', type: 'enum', value: '硕士研究生', policy: 'review' },
      'educations.0.endDate': { key: 'educations.0.endDate', label: '毕业时间', type: 'date', value: '2026-06-30', policy: 'auto' },
    } };
    const [match] = matchFields(
      [descriptor({ label: '毕业时间', inputType: 'date', sectionLabel: '教育经历', sectionIndex: 0 })],
      profile,
      { mappings: [], pageContext: { host: 'fixture.test', path: '/application' } },
    );

    expect(match.selected?.profileKey).toBe('educations.0.endDate');
    expect(match.candidates.some((candidate) => candidate.profileKey === 'educations.0.degree')).toBe(false);
  });

  it('leaves an unknown date field unmatched instead of borrowing another field from the same section', () => {
    const [match] = matchFields(
      [descriptor({ label: '未知日期', inputType: 'date', sectionLabel: '教育经历', sectionIndex: 0 })],
      profileWith('educations.0.degree', '硕士研究生', { type: 'enum' }),
      { mappings: [], pageContext: { host: 'fixture.test', path: '/application' } },
    );

    expect(match.selected).toBeUndefined();
    expect(match.candidates).toEqual([]);
  });

  it('does not auto-match a type-incompatible candidate', () => {
    const [match] = matchFields(
      [descriptor({ label: 'Email', kind: 'select', options: [{ label: 'A', value: 'a' }] })],
      profileWith('contact.email', 'candidate@example.test'),
      { mappings: [], pageContext: { host: 'fixture.test', path: '/application' } },
    );

    expect(match.selected?.score).toBe(0.5);
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

    const [match] = matchFields(
      [field],
      profile,
      { mappings, pageContext: { host: 'example.test', path: '/apply' } },
    );

    expect(match.selected).toMatchObject({
      profileKey: 'contact.email',
      score: 1,
      source: 'user',
    });
    expect(match.status).toBe('matched');
  });

  it('does not reuse an identical fingerprint across repeated section indexes', () => {
    const fields = [
      descriptor({ fieldId: 'school-0', label: '学校', fingerprint: 'text|school', sectionIndex: 0 }),
      descriptor({ fieldId: 'school-1', label: '学校', fingerprint: 'text|school', sectionIndex: 1 }),
    ];
    const profile: Profile = { schemaVersion: 1, fields: {
      ...profileWith('educations.0.school', 'A').fields,
      ...profileWith('educations.1.school', 'B').fields,
    } };
    const mappings: UserFieldMapping[] = [
      { id: 'legacy-0', scope: { host: 'example.test' }, fingerprint: 'text|school', profileKey: 'educations.0.school', createdAt: '2026-09-14T00:00:00.000Z' },
      { id: 'current-1', scope: { host: 'example.test' }, fingerprint: 'text|school', profileKey: 'educations.1.school', sectionIndex: 1, createdAt: '2026-09-14T00:00:00.000Z' },
    ];

    const matches = matchFields(fields, profile, { mappings, pageContext: { host: 'example.test', path: '/apply' } });

    expect(matches.map((match) => match.selected?.profileKey)).toEqual(['educations.0.school', 'educations.1.school']);
    expect(matches.map((match) => match.selected?.source)).toEqual(['user', 'user']);
  });

  it('does not let an explicit user mapping bypass never policy', () => {
    const field = descriptor({ label: 'Name', fingerprint: 'text|name' });
    const [match] = matchFields(
      [field],
      profileWith('contact.email', 'candidate@example.test', { policy: 'never' }),
      { mappings: [{ id: 'never', scope: { host: 'example.test' }, fingerprint: field.fingerprint, profileKey: 'contact.email', createdAt: '2026-09-15T00:00:00.000Z' }], pageContext: { host: 'example.test', path: '/apply' } },
    );

    expect(match.selected?.source).toBe('user');
    expect(match.status).toBe('unsupported');
  });

  it('falls back to generic matching when a mapping scope does not match the page', () => {
    const field = descriptor({
      label: 'Name',
      name: 'name',
      fingerprint: 'text|name|name',
    });
    const mappings: UserFieldMapping[] = [{
      id: 'mapping-1',
      scope: { host: 'example.test', path: '/apply' },
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

    const [match] = matchFields(
      [field],
      profile,
      { mappings, pageContext: { host: 'other.test', path: '/other' } },
    );

    expect(match.selected).toMatchObject({
      profileKey: 'identity.name',
      source: 'generic',
    });
    expect(match.status).toBe('matched');
  });
});


describe('mapping scope priority and repeated section matching', () => {
  it('prefers path over host over global for the same fingerprint', () => {
    const field = descriptor({ fingerprint: 'same', label: 'Email' });
    const profile: Profile = { schemaVersion: 1, fields: {
      global: { key: 'global', label: 'Global', type: 'text', value: 'g', policy: 'auto' },
      host: { key: 'host', label: 'Host', type: 'text', value: 'h', policy: 'auto' },
      path: { key: 'path', label: 'Path', type: 'text', value: 'p', policy: 'auto' },
    } };
    const mappings: UserFieldMapping[] = [
      { id: 'g', scope: { kind: 'global' }, fingerprint: 'same', profileKey: 'global', createdAt: '' },
      { id: 'h', scope: { kind: 'host', host: 'job.test' }, fingerprint: 'same', profileKey: 'host', createdAt: '' },
      { id: 'p', scope: { kind: 'path', host: 'job.test', path: '/apply' }, fingerprint: 'same', profileKey: 'path', createdAt: '' },
    ];
    expect(matchFields([field], profile, { mappings, pageContext: { host: 'job.test', path: '/apply' } })[0].selected?.profileKey).toBe('path');
    expect(matchFields([field], profile, { mappings, pageContext: { host: 'job.test', path: '/other' } })[0].selected?.profileKey).toBe('host');
    expect(matchFields([field], profile, { mappings, pageContext: { host: 'other.test', path: '/' } })[0].selected?.profileKey).toBe('global');
  });

  it('uses sectionIndex to choose the corresponding profile record', () => {
    const fields = [descriptor({ fieldId: 'edu-2', label: '学校', sectionLabel: '教育经历', sectionIndex: 1 })];
    const profile: Profile = { schemaVersion: 1, fields: {
      'educations.0.school': { key: 'educations.0.school', label: '学校', type: 'text', value: '第一大学', policy: 'auto' },
      'educations.1.school': { key: 'educations.1.school', label: '学校', type: 'text', value: '第二大学', policy: 'auto' },
    } };
    const [match] = matchFields(fields, profile, { mappings: [], pageContext: { host: 'job.test', path: '/' } });
    expect(match.selected?.profileKey).toBe('educations.1.school');
    expect(match.candidates.find((item) => item.profileKey === 'educations.0.school')!.score).toBeLessThan(match.selected!.score);
  });
});
