import { expect, test } from '@playwright/test';

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
  const start = fields.find((field) => field.label === '开始时间')!;
  const end = fields.find((field) => field.label === '结束时间')!;
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
