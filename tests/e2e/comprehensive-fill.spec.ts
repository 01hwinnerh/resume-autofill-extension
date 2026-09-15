import { expect, test } from '@playwright/test';

import { runRuntimeMessage } from './support/runtime-harness';

test('scans comprehensive sections while excluding manual file input', async ({ page }) => {
  await page.goto('/');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-comprehensive' });

  expect(scan.type).toBe('scan-result');
  const descriptors = scan.result.descriptors;
  const descriptor = (label: string) => descriptors.find((candidate) => candidate.label === label);

  expect(descriptor('毕业院校')?.sectionLabel).toBe('教育经历');
  expect(descriptor('公司名称')?.sectionLabel).toBe('工作经历');
  expect(descriptor('项目名称')?.sectionLabel).toBe('项目经历');
  expect(descriptor('专业技能')?.sectionLabel).toBe('求职意向 / 技能');
  expect(descriptor('同意在本地测试中处理以上虚构信息')?.sectionLabel).toBe('授权与边界');
  expect(descriptors.some((candidate) => candidate.fieldId === 'resume-file')).toBe(false);
  await expect(page.locator('#resume-file')).toBeVisible();
  expect(await page.evaluate(() => (globalThis as { __submitted?: boolean }).__submitted)).toBe(false);
});

test('fills comprehensive control types, preserves existing value, and never submits', async ({ page }) => {
  await page.goto('/comprehensive-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-comprehensive-fill' });
  expect(scan.type).toBe('scan-result');

  const descriptors = scan.result.descriptors;
  const field = (label: string) => {
    const result = descriptors.find((candidate) => candidate.label === label);
    expect(result, `missing descriptor for ${label}`).toBeDefined();
    return result!;
  };
  const workMode = descriptors.find((candidate) => candidate.kind === 'radio' && candidate.name === 'workMode');
  expect(workMode).toBeDefined();

  const response = await runRuntimeMessage(page, {
    type: 'fill-fields',
    requestId: 'fill-comprehensive',
    fields: [
      { fieldId: field('姓名').fieldId, profileKey: 'identity.name', value: '不应覆盖的新姓名' },
      { fieldId: field('电子邮箱').fieldId, profileKey: 'contact.email', value: 'candidate@example.test' },
      { fieldId: field('学历').fieldId, profileKey: 'educations.0.degree', value: '硕士' },
      { fieldId: field('入学时间').fieldId, profileKey: 'educations.0.startDate', value: '2021-09-01' },
      { fieldId: field('gpa').fieldId, profileKey: 'educations.0.gpa', value: 3.8 },
      { fieldId: field('工作内容').fieldId, profileKey: 'workExperiences.0.description', value: '负责虚构测试项目的质量保障。' },
      { fieldId: workMode!.fieldId, profileKey: 'preference.workMode', value: 'remote' },
      { fieldId: field('同意在本地测试中处理以上虚构信息').fieldId, profileKey: 'custom.consent', value: true },
    ],
  });

  expect(response.type).toBe('fill-result');
  const outcome = (fieldId: string) => response.results.find((result) => result.fieldId === fieldId)?.outcome.status;
  expect(outcome(field('姓名').fieldId)).toBe('skipped_existing');
  expect(response.results.filter((result) => result.fieldId !== field('姓名').fieldId).every((result) => result.outcome.status === 'filled')).toBe(true);
  expect(response.results.filter((result) => result.outcome.status === 'filled').every((result) => result.verification?.verified)).toBe(true);

  await expect(page.locator('#full-name')).toHaveValue('测试候选人（已有值）');
  await expect(page.locator('#email')).toHaveValue('candidate@example.test');
  await expect(page.locator('#edu-degree')).toHaveValue('master');
  await expect(page.locator('#edu-start')).toHaveValue('2021-09-01');
  await expect(page.locator('#edu-gpa')).toHaveValue('3.8');
  await expect(page.locator('#work-description')).toHaveValue('负责虚构测试项目的质量保障。');
  await expect(page.locator('#mode-remote')).toBeChecked();
  await expect(page.locator('#consent')).toBeChecked();
  expect(await page.evaluate(() => (globalThis as { __submitted?: boolean }).__submitted)).toBe(false);
  await expect(page.locator('#submit-status')).toHaveText('尚未提交');
});

test('intercepts an explicit manual submit with visible feedback', async ({ page }) => {
  await page.goto('/comprehensive-form.html');
  await page.locator('#submit').click();

  expect(await page.evaluate(() => (globalThis as { __submitted?: boolean }).__submitted)).toBe(true);
  await expect(page.locator('#submit-status')).toHaveText('测试提交已拦截');
});
