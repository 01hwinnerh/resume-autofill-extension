import type { FieldStatus, PageFieldDescriptor } from '../../src/shared/form';

export interface ExpectedField {
  selector?: string;
  descriptor?: PageFieldDescriptor;
  profileKey?: string;
  status: FieldStatus;
  sectionIndex?: number;
}

export interface MatchingCorpusFixture {
  id: string;
  version: number;
  fixture?: string;
  pageContext: { host: string; path: string; url?: string };
  adapter?: 'bytedance-jobs';
  evaluationMode?: 'scanner+matcher' | 'matcher-only';
  evidence?: string;
  fields: ExpectedField[];
}

const field = (selector: string, profileKey: string | undefined, status: FieldStatus, sectionIndex?: number): ExpectedField => ({ selector, profileKey, status, sectionIndex });
const descriptor = (fieldId: string, label: string, profileKey: string, status: FieldStatus, sectionLabel?: string, sectionIndex?: number): ExpectedField => ({
  descriptor: { fieldId, kind: 'text', label, options: [], currentValue: '', sectionLabel, sectionIndex, framePath: [], fingerprint: `fixture|${fieldId}` },
  profileKey, status, sectionIndex,
});

/** Versioned synthetic regression annotations, not production-site observations. */
export const MATCHING_CORPUS: MatchingCorpusFixture[] = [
  {
    id: 'standard-generic', version: 1, fixture: 'standard-ats.html', pageContext: { host: 'fixture.test', path: '/standard-ats.html' }, fields: [
      field('#full-name', 'identity.name', 'matched'), field('#email', 'contact.email', 'matched'), field('#phone', 'contact.phone', 'needs_confirmation'),
      field('#city', undefined, 'unrecognized'), field('#school', 'educations.0.school', 'matched', 0), field('#major', 'educations.0.major', 'matched', 0),
      field('#education-start', 'educations.0.startDate', 'matched', 0), field('#education-end', 'educations.0.endDate', 'matched', 0), field('#summary', 'summary.selfEvaluation', 'needs_confirmation'),
    ],
  },
  {
    id: 'greenhouse-style', version: 1, fixture: 'greenhouse-ats.html', pageContext: { host: 'fixture.test', path: '/greenhouse-ats.html' }, fields: [
      field('#gh-first-name', 'identity.firstName', 'matched'), field('#gh-last-name', 'identity.lastName', 'matched'), field('#gh-email', 'contact.email', 'matched'),
      field('#gh-phone', 'contact.phone', 'needs_confirmation'), field('#gh-linkedin', 'links.linkedin', 'missing_profile'),
      field('#gh-school', 'educations.0.school', 'matched', 0), field('#gh-major', 'educations.0.major', 'matched', 0), field('#gh-degree', 'educations.0.degree', 'needs_confirmation', 0),
      field('#gh-start', 'educations.0.startDate', 'matched', 0), field('#gh-end', 'educations.0.endDate', 'matched', 0), field('#gh-cover-letter', undefined, 'unrecognized'),
    ],
  },
  {
    id: 'lever-style', version: 1, fixture: 'lever-ats.html', pageContext: { host: 'fixture.test', path: '/lever-ats.html' }, fields: [
      field('#lever-name', 'identity.name', 'matched'), field('#lever-email', 'contact.email', 'matched'), field('#lever-phone', 'contact.phone', 'needs_confirmation'),
      field('#lever-location', 'location.current', 'matched'), field('#lever-company', 'workExperiences.0.company', 'matched', 0), field('#lever-title', 'workExperiences.0.title', 'matched', 0),
      field('#lever-start', 'workExperiences.0.startDate', 'matched', 0), field('#lever-end', 'workExperiences.0.endDate', 'matched', 0), field('#lever-description', 'workExperiences.0.description', 'needs_confirmation', 0),
      field('#lever-portfolio', 'links.portfolio', 'missing_profile'),
    ],
  },
  {
    id: 'workday-style', version: 1, fixture: 'workday-ats.html', pageContext: { host: 'fixture.test', path: '/workday-ats.html' }, fields: [
      field('#wd-first', 'identity.firstName', 'matched'), field('#wd-last', 'identity.lastName', 'matched'), field('#wd-email', 'contact.email', 'needs_confirmation'), field('#wd-phone', 'contact.phone', 'needs_confirmation'),
      field('#wd-school', 'educations.0.school', 'matched', 0), field('#wd-major', 'educations.0.major', 'matched', 0), field('#wd-degree', 'educations.0.degree', 'needs_confirmation', 0),
      field('#wd-start', 'educations.0.startDate', 'matched', 0), field('#wd-end', 'educations.0.endDate', 'matched', 0),
    ],
  },
  {
    id: 'component-formily', version: 1, fixture: 'component-ats.html', pageContext: { host: 'fixture.test', path: '/component-ats.html' }, fields: [
      field('#formily-item-school input', 'educations.0.school', 'matched', 0), field('#formily-item-start_end_time input:first-of-type', 'educations.0.startDate', 'matched', 0),
      field('#formily-item-start_end_time input:last-of-type', 'educations.0.endDate', 'matched', 0), field('#formily-item-degree input', 'educations.0.degree', 'needs_confirmation', 0),
    ],
  },
  {
    id: 'third-round-top-frame', version: 1, fixture: 'third-round-ats.html', pageContext: { host: 'fixture.test', path: '/third-round-ats.html' }, fields: [
      field('#step-field', 'identity.name', 'matched'), field('#month-text', 'educations.0.endDate', 'matched', 0), field('#slow-degree', 'educations.0.degree', 'needs_confirmation', 0),
      field('#email', 'contact.email', 'matched'), field('#controlled-rollback', undefined, 'unrecognized'),
    ],
  },
  {
    id: 'iframe-work-section', version: 1, fixture: 'iframe-ats-form.html', pageContext: { host: 'fixture-frame.test', path: '/iframe-ats-form.html' }, fields: [
      field('[name="company"]', 'workExperiences.0.company', 'matched', 0), field('[name="title"]', 'workExperiences.0.title', 'matched', 0),
      field('[name="work_start"]', 'workExperiences.0.startDate', 'matched', 0), field('[name="work_end"]', 'workExperiences.0.endDate', 'matched', 0),
      field('[name="work_description"]', 'workExperiences.0.description', 'needs_confirmation', 0),
    ],
  },
  {
    id: 'all-features-generic', version: 1, fixture: 'all-features-ats.html', pageContext: { host: 'fixture.test', path: '/all-features-ats.html' }, fields: [
      field('[name="full_name"]', 'identity.name', 'matched'), field('[name="email"]', 'contact.email', 'matched'), field('[name="phone"]', 'contact.phone', 'needs_confirmation'),
      field('[name="birth_date"]', 'identity.birthDate', 'needs_confirmation'), field('[name="current_location"]', 'location.current', 'matched'), field('[name="job_seeking_status"]', 'employment.jobSeekingStatus', 'needs_confirmation'),
      field('[name="gender"]', 'identity.gender', 'needs_confirmation'), field('[name="consent"]', undefined, 'unrecognized'), field('[name="self_evaluation"]', 'summary.selfEvaluation', 'needs_confirmation'),
      field('#school-input', 'educations.0.school', 'matched', 0), field('#major-input', 'educations.0.major', 'matched', 0),
      field('#formily-item-start_end_time input:first-of-type', 'educations.0.startDate', 'matched', 0), field('#formily-item-start_end_time input:last-of-type', 'educations.0.endDate', 'matched', 0),
      field('#degree-combobox', 'educations.0.degreeType', 'matched', 0),
    ],
  },
  {
    id: 'bytedance-adapter-descriptors', version: 1, adapter: 'bytedance-jobs', evaluationMode: 'matcher-only',
    evidence: 'descriptor-only: derived from the existing ByteDance adapter unit fixture; no sanitized ByteDance HTML fixture exists in this repository, so scanner coverage is not claimed.',
    pageContext: { host: 'jobs.bytedance.com', path: '/campus/resume/fixture/apply', url: 'https://jobs.bytedance.com/campus/resume/fixture/apply' },
    fields: [
      descriptor('bd-email', '电子邮箱', 'contact.email', 'matched'), descriptor('bd-school', '学校名称', 'educations.1.school', 'matched', '教育经历', 1),
      descriptor('bd-degree', '学历', 'educations.0.degree', 'needs_confirmation', '教育经历', 0), descriptor('bd-education-start', '开始时间', 'educations.1.startDate', 'matched', '教育经历', 1),
      descriptor('bd-company', '公司名称', 'workExperiences.0.company', 'matched', '工作经历', 0), descriptor('bd-project', '项目名称', 'projects.0.name', 'matched', '项目经历', 0),
    ],
  },
];
