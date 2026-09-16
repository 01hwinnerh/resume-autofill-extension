import { expect, test } from '@playwright/test';

import { resolveMatches } from '../../src/matching/resolve-match';
import { runRuntimeMessage } from './support/runtime-harness';

test('standard ATS exposes semantic fields and never submits during fill', async ({ page }) => {
  await page.goto('/standard-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-standard-ats' });
  const fields = scan.result.descriptors;
  const name = fields.find((field) => field.label === '姓名')!;
  const email = fields.find((field) => field.label === '电子邮箱')!;

  expect(fields).toHaveLength(9);
  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-standard-ats', fields: [
      { fieldId: name.fieldId, profileKey: 'identity.name', value: '测试用户' },
      { fieldId: email.fieldId, profileKey: 'contact.email', value: 'fixture@example.com' },
    ],
  });

  expect(fill.results.every((result) => result.outcome.status === 'filled' && result.verification?.verified)).toBe(true);
  await expect(page.locator('#full-name')).toHaveValue('测试用户');
  await expect(page.locator('#email')).toHaveValue('fixture@example.com');
  await expect(page.locator('#submit-state')).toHaveText('尚未提交');
});

test('component ATS recognizes Formily groups and safely selects one exact combobox option', async ({ page }) => {
  await page.goto('/component-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-component-ats' });
  const fields = scan.result.descriptors;
  const school = fields.find((field) => field.label === '学校名称')!;
  const start = fields.find((field) => field.label === '入学时间')!;
  const end = fields.find((field) => field.label === '毕业时间')!;
  const degree = fields.find((field) => field.label === '学历')!;

  expect(school).toMatchObject({ sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' });
  expect(start).toMatchObject({ sectionLabel: '教育经历', sectionIndex: 0 });
  expect(end).toMatchObject({ sectionLabel: '教育经历', sectionIndex: 0 });
  expect(degree.kind).toBe('combobox');

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-component-ats', fields: [{ fieldId: degree.fieldId, profileKey: 'educations.0.degree', value: '本科' }],
  });
  expect(fill.results[0]).toMatchObject({ outcome: { status: 'filled' }, verification: { verified: true } });
  await expect(page.locator('.selection-item')).toHaveText('本科');
  await expect(page.locator('#component-submit-state')).toHaveText('尚未提交');
});

test('dynamic ATS rescans later steps and fills a same-origin iframe field', async ({ page }) => {
  await page.goto('/complex-ats.html');
  await page.frameLocator('iframe').locator('input[name="company"]').waitFor();
  let scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-complex-initial' });
  expect(scan.result.descriptors.some((field) => field.label === '期望职位')).toBe(false);
  const company = scan.result.descriptors.find((field) => field.label === '公司名称');
  expect(company, JSON.stringify(scan.result.descriptors.map((field) => ({ label: field.label, framePath: field.framePath })))).toBeDefined();
  expect(company!.framePath).toEqual([0]);
  expect(company!.fieldId).toContain('frame-0-');

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-complex-frame', fields: [{ fieldId: company!.fieldId, profileKey: 'workExperiences.0.company', value: '示例公司' }],
  });
  expect(fill.results[0]).toMatchObject({ outcome: { status: 'filled' }, verification: { verified: true } });
  await expect(page.frameLocator('iframe').locator('input[name="company"]')).toHaveValue('示例公司');

  await page.locator('#next-step').click();
  await page.locator('#step-two').waitFor({ state: 'visible' });
  scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-complex-next' });
  expect(scan.result.descriptors.some((field) => field.label === '期望职位')).toBe(true);
  expect(scan.result.descriptors.some((field) => field.label === '期望城市')).toBe(true);
});


test('all-features ATS exposes every compatibility path and recognizes fields with an empty profile', async ({ page }) => {
  await page.goto('/all-features-ats.html');
  await page.frameLocator('iframe').locator('input[name="company"]').waitFor();

  let scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-all-features' });
  const fields = scan.result.descriptors;
  const name = fields.find((field) => field.label === '姓名')!;
  const degree = fields.find((field) => field.label === '学历类型')!;
  const educationStart = fields.find((field) => field.label === '入学时间')!;
  const educationEnd = fields.find((field) => field.label === '毕业时间')!;
  const company = fields.find((field) => field.label === '公司名称')!;

  expect(name).toMatchObject({ kind: 'text', autocomplete: 'name' });
  expect(degree).toMatchObject({ kind: 'combobox', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' });
  expect(company.framePath).toEqual([0]);
  expect(scan.result.metadata).toMatchObject({ jobTitle: '高级前端工程师', companyName: '星云科技' });

  const matches = resolveMatches(fields, { schemaVersion: 1, fields: {} }, {
    mappings: [],
    pageContext: { host: '127.0.0.1:4173', path: '/all-features-ats.html' },
  });
  expect(matches.find((match) => match.descriptor.fieldId === name.fieldId)).toMatchObject({
    status: 'missing_profile', selected: { profileKey: 'identity.name' },
  });
  expect(matches.find((match) => match.descriptor.fieldId === degree.fieldId)).toMatchObject({
    status: 'missing_profile', selected: { profileKey: 'educations.0.degreeType' },
  });

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-all-features-combobox',
    fields: [
      { fieldId: degree.fieldId, profileKey: 'educations.0.degreeType', value: '硕士研究生' },
      { fieldId: educationStart.fieldId, profileKey: 'educations.0.startDate', value: '2022-09-08' },
      { fieldId: educationEnd.fieldId, profileKey: 'educations.0.endDate', value: '2026/06/30' },
    ],
  });
  expect(fill.results).toEqual(expect.arrayContaining([
    expect.objectContaining({ fieldId: degree.fieldId, outcome: { status: 'filled', fieldId: degree.fieldId }, verification: { fieldId: degree.fieldId, verified: true } }),
    expect.objectContaining({ fieldId: educationStart.fieldId, outcome: { status: 'filled', fieldId: educationStart.fieldId }, verification: { fieldId: educationStart.fieldId, verified: true } }),
    expect.objectContaining({ fieldId: educationEnd.fieldId, outcome: { status: 'filled', fieldId: educationEnd.fieldId }, verification: { fieldId: educationEnd.fieldId, verified: true } }),
  ]));
  await expect(page.locator('.selection-item')).toHaveText('硕士研究生');
  await expect(page.locator('#formily-item-start_end_time input').nth(0)).toHaveValue('2022-09');
  await expect(page.locator('#formily-item-start_end_time input').nth(1)).toHaveValue('2026-06');
  await expect(page.locator('#submit-state')).toHaveText('尚未提交');

  await page.locator('#reveal-dynamic').click();
  scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-all-features-dynamic' });
  expect(scan.result.descriptors.some((field) => field.label === '期望职位')).toBe(true);
  expect(scan.result.descriptors.some((field) => field.label === '期望城市')).toBe(true);
  expect(scan.result.descriptors.some((field) => field.label === '专业技能')).toBe(true);
});


test('Greenhouse-style ATS supports bracketed names, education dates, native selects, and manual upload boundaries', async ({ page }) => {
  await page.goto('/greenhouse-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-greenhouse-ats' });
  const fields = scan.result.descriptors;
  const firstName = fields.find((field) => field.label === 'first name')!;
  const email = fields.find((field) => field.label === 'email')!;
  const school = fields.find((field) => field.label === 'school')!;
  const degree = fields.find((field) => field.label === 'degree')!;
  const start = fields.find((field) => field.label === 'start date')!;
  const end = fields.find((field) => field.label === 'end date')!;

  expect(fields).toHaveLength(11);
  expect(school).toMatchObject({ sectionLabel: 'education', sectionIndex: 0 });
  expect(degree.kind).toBe('select');
  expect(fields.some((field) => field.name === 'job_application[resume]')).toBe(false);

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-greenhouse-ats', fields: [
      { fieldId: firstName.fieldId, profileKey: 'identity.firstName', value: '测试' },
      { fieldId: email.fieldId, profileKey: 'contact.email', value: 'greenhouse@example.com' },
      { fieldId: school.fieldId, profileKey: 'educations.0.school', value: '示例大学' },
      { fieldId: degree.fieldId, profileKey: 'educations.0.degree', value: 'Master' },
      { fieldId: start.fieldId, profileKey: 'educations.0.startDate', value: '2021-09-01' },
      { fieldId: end.fieldId, profileKey: 'educations.0.endDate', value: '2025/06/30' },
    ],
  });
  expect(fill.results.every((result) => result.outcome.status === 'filled' && result.verification?.verified)).toBe(true);
  await expect(page.locator('#gh-first-name')).toHaveValue('测试');
  await expect(page.locator('#gh-degree')).toHaveValue('Master');
  await expect(page.locator('#gh-start')).toHaveValue('2021-09');
  await expect(page.locator('#gh-end')).toHaveValue('2025-06');
  await expect(page.locator('#submit-state')).toHaveText('尚未提交');
});

test('Lever-style ATS recognizes SPA question wrappers and work-experience context', async ({ page }) => {
  await page.goto('/lever-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-lever-ats' });
  const fields = scan.result.descriptors;
  const name = fields.find((field) => field.label === 'full name')!;
  const location = fields.find((field) => field.label === 'current location')!;
  const company = fields.find((field) => field.label === 'company')!;
  const title = fields.find((field) => field.label === 'job title')!;
  const description = fields.find((field) => field.label === 'description')!;

  expect(fields).toHaveLength(10);
  expect(company).toMatchObject({ sectionLabel: 'work experience', sectionIndex: 0 });
  expect(title).toMatchObject({ sectionLabel: 'work experience', sectionIndex: 0 });
  expect(fields.some((field) => field.name === 'resume')).toBe(false);

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-lever-ats', fields: [
      { fieldId: name.fieldId, profileKey: 'identity.name', value: '测试用户' },
      { fieldId: location.fieldId, profileKey: 'location.current', value: 'Shanghai' },
      { fieldId: company.fieldId, profileKey: 'workExperiences.0.company', value: '示例公司' },
      { fieldId: title.fieldId, profileKey: 'workExperiences.0.title', value: 'Frontend Engineer' },
      { fieldId: description.fieldId, profileKey: 'workExperiences.0.description', value: 'Built accessible web applications.' },
    ],
  });
  expect(fill.results.every((result) => result.outcome.status === 'filled' && result.verification?.verified)).toBe(true);
  await expect(page.locator('#lever-location')).toHaveValue('Shanghai');
  await expect(page.locator('#lever-company')).toHaveValue('示例公司');
  await expect(page.locator('#submit-state')).toHaveText('尚未提交');
});

test('Workday-style ATS resolves aria-labelled groups and safely selects an exact prompt option', async ({ page }) => {
  await page.goto('/workday-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-workday-ats' });
  const fields = scan.result.descriptors;
  const firstName = fields.find((field) => field.label === 'first name')!;
  const school = fields.find((field) => field.label === 'school')!;
  const degree = fields.find((field) => field.label === 'degree')!;
  const start = fields.find((field) => field.label === 'start date')!;
  const end = fields.find((field) => field.label === 'end date')!;

  expect(fields).toHaveLength(9);
  expect(firstName.sectionLabel).toBe('personal information');
  expect(school).toMatchObject({ sectionLabel: 'education', sectionIndex: 0 });
  expect(degree).toMatchObject({ kind: 'combobox', sectionLabel: 'education', sectionIndex: 0 });
  expect(fields.some((field) => field.htmlId === 'wd-resume')).toBe(false);

  const fill = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-workday-ats', fields: [
      { fieldId: firstName.fieldId, profileKey: 'identity.firstName', value: '测试' },
      { fieldId: school.fieldId, profileKey: 'educations.0.school', value: '示例大学' },
      { fieldId: degree.fieldId, profileKey: 'educations.0.degree', value: 'Master' },
      { fieldId: start.fieldId, profileKey: 'educations.0.startDate', value: '2020-09-01' },
      { fieldId: end.fieldId, profileKey: 'educations.0.endDate', value: '2024-06-30' },
    ],
  });
  expect(fill.results.every((result) => result.outcome.status === 'filled' && result.verification?.verified)).toBe(true);
  await expect(page.locator('#wd-degree')).toHaveAttribute('aria-valuetext', 'Master');
  await expect(page.locator('#wd-start')).toHaveValue('2020-09');
  await expect(page.locator('#wd-end')).toHaveValue('2024-06');
  await expect(page.locator('#submit-state')).toHaveText('尚未提交');
});
