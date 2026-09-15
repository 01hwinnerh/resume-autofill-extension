import { expect, test } from '@playwright/test';

import { runRuntimeMessage } from './support/runtime-harness';

test('preserves existing values and never submits during scan or fill', async ({ page }) => {
  await page.goto('/basic-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-existing' });
  expect(scan.type).toBe('scan-result');
  const name = scan.result.descriptors.find((field) => field.label === '姓名')!;

  const response = await runRuntimeMessage(page, {
    type: 'fill-fields',
    requestId: 'fill-existing',
    fields: [{ fieldId: name.fieldId, profileKey: 'identity.name', value: 'New Candidate' }],
  });

  expect(response.type).toBe('fill-result');
  expect(response.results[0]?.outcome.status).toBe('skipped_existing');
  await expect(page.locator('#name')).toHaveValue('Existing Candidate');
  expect(await page.evaluate(() => (globalThis as { __submitted?: boolean }).__submitted)).toBe(false);
});

test('leaves file and CAPTCHA controls for manual handling', async ({ page }) => {
  await page.goto('/unsupported-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-unsupported' });

  expect(scan.type).toBe('scan-result');
  expect(scan.result.descriptors.some((field) => field.fieldId === 'resume-file')).toBe(false);
  await expect(page.locator('#captcha')).toHaveText('验证码区域');
  await expect(page.locator('#submit')).toBeVisible();
});
