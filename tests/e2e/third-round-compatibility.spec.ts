import { expect, test } from '@playwright/test';
import { runRuntimeMessage } from './support/runtime-harness';
import type { PageMessage } from '../../src/shared/messages';

test('aggregates a second-origin iframe with unique field ids and fills it independently', async ({ page }) => {
  await page.goto('/third-round-ats.html');
  await page.frameLocator('iframe').locator('input[name="company"]').waitFor();
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'third-scan' });
  const company = scan.result.descriptors.find((field) => field.label === '公司名称')!;
  const ids = scan.result.descriptors.map((field) => field.fieldId);
  expect(company.fieldId).toContain('frame-0');
  expect(new Set(ids).size).toBe(ids.length);

  const fill = await runRuntimeMessage(page, { type: 'fill-fields', requestId: 'third-frame-fill', fields: [
    { fieldId: company.fieldId, profileKey: 'workExperiences.0.company', value: '跨源公司' },
  ] });
  expect(fill.results[0]).toMatchObject({ outcome: { status: 'filled' }, verification: { verified: true } });
  await expect(page.frameLocator('iframe').locator('input[name="company"]')).toHaveValue('跨源公司');
});

test('handles slow body portal combobox and date display format', async ({ page }) => {
  await page.goto('/third-round-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'third-controls' });
  const degree = scan.result.descriptors.find((field) => field.htmlId === 'slow-degree')!;
  const month = scan.result.descriptors.find((field) => field.htmlId === 'month-text')!;
  const fill = await runRuntimeMessage(page, { type: 'fill-fields', requestId: 'third-controls-fill', fields: [
    { fieldId: degree.fieldId, profileKey: 'educations.0.degree', value: '本科' },
    { fieldId: month.fieldId, profileKey: 'educations.0.endDate', value: '2026-09-17' },
  ] });
  expect(fill.results.every((result) => result.outcome.status === 'filled' && result.verification?.verified)).toBe(true);
  await expect(page.locator('#selected')).toHaveText('本科');
  await expect(page.locator('#month-text')).toHaveValue('09/2026');
});

test('invalidates an old scan when a same-URL SPA step replaces key fields', async ({ page }) => {
  await page.goto('/third-round-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'third-spa-scan' });
  const name = scan.result.descriptors.find((field) => field.htmlId === 'step-field')!;
  await page.locator('#next').click();
  await expect(page.locator('#step-field-next')).toBeVisible();
  const response = await runRuntimeMessage(page, { type: 'fill-fields', requestId: 'third-stale-fill', fields: [
    { fieldId: name.fieldId, profileKey: 'identity.name', value: '不应写入' },
  ] } as PageMessage);
  expect(response.type).toBe('error');
  if (response.type === 'error') expect(response.error.message).toContain('重新扫描');
  await expect(page.locator('#step-field-next')).toHaveValue('');
});

test('reports blur rollback as a failed fill instead of success', async ({ page }) => {
  await page.goto('/third-round-ats.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'third-blur-scan' });
  const rollback = scan.result.descriptors.find((field) => field.htmlId === 'rollback')!;
  const fill = await runRuntimeMessage(page, { type: 'fill-fields', requestId: 'third-blur-fill', fields: [
    { fieldId: rollback.fieldId, profileKey: 'contact.email', value: 'valid@example.test' },
  ] });
  expect(fill.results[0]).toMatchObject({ outcome: { status: 'failed' } });
  await expect(page.locator('#rollback')).toHaveValue('');
});
