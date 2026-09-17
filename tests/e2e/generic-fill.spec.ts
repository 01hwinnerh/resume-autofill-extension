import { expect, test } from '@playwright/test';

import { runRuntimeMessage, runtimeNotifications } from './support/runtime-harness';

test('scans without mutating the page before confirmation', async ({ page }) => {
  await page.goto('/basic-form.html');
  const before = await page.locator('#name').inputValue();
  const response = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-basic' });

  expect(response.type).toBe('scan-result');
  expect(response.result.descriptors.some((field) => field.label === '姓名')).toBe(true);
  expect(await page.locator('#name').inputValue()).toBe(before);
});

test('fills text, select, radio, and checkbox controls and returns verified results', async ({ page }) => {
  await page.goto('/basic-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-controls' });
  expect(scan.type).toBe('scan-result');

  const descriptors = scan.result.descriptors;
  const field = (label: string) => descriptors.find((candidate) => candidate.label === label);
  const radio = descriptors.find((candidate) => candidate.kind === 'radio');
  const response = await runRuntimeMessage(page, {
    type: 'fill-fields',
    requestId: 'fill-controls',
    fields: [
      { fieldId: field('邮箱')!.fieldId, profileKey: 'contact.email', value: 'candidate@example.test' },
      { fieldId: field('学历')!.fieldId, profileKey: 'education.degree', value: '硕士' },
      { fieldId: radio!.fieldId, profileKey: 'custom.workMode', value: 'remote' },
      { fieldId: field('同意隐私政策')!.fieldId, profileKey: 'custom.consent', value: true },
    ],
  });

  expect(response.type).toBe('fill-result');
  expect(response.results.every((result) => result.outcome.status === 'filled')).toBe(true);
  expect(response.results.every((result) => result.verification?.verified)).toBe(true);
  await expect(page.locator('#email')).toHaveValue('candidate@example.test');
  await expect(page.locator('#degree')).toHaveValue('master');
  await expect(page.locator('#remote')).toBeChecked();
  await expect(page.locator('#consent')).toBeChecked();
});

test('verifies controlled inputs after native events', async ({ page }) => {
  await page.goto('/controlled-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-controlled' });
  expect(scan.type).toBe('scan-result');
  const email = scan.result.descriptors.find((field) => field.label === 'email')!;
  const degree = scan.result.descriptors.find((field) => field.label === 'degree')!;

  const response = await runRuntimeMessage(page, {
    type: 'fill-fields',
    requestId: 'fill-controlled',
    fields: [
      { fieldId: email.fieldId, profileKey: 'contact.email', value: 'controlled@example.test' },
      { fieldId: degree.fieldId, profileKey: 'education.degree', value: 'Master' },
    ],
  });

  expect(response.type).toBe('fill-result');
  expect(response.results.every((result) => result.verification?.verified)).toBe(true);
  await expect(page.locator('#controlled-email')).toHaveValue('controlled@example.test');
  await expect(page.locator('#controlled-degree')).toHaveValue('master');
});

test('rescans a dynamic section after it appears', async ({ page }) => {
  await page.goto('/dynamic-form.html');
  const before = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-before-dynamic' });
  expect(before.type).toBe('scan-result');
  expect(before.result.descriptors).toHaveLength(1);

  await page.getByRole('button', { name: '添加教育经历' }).click();
  const after = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-after-dynamic' });
  expect(after.type).toBe('scan-result');
  expect(after.result.descriptors.some((field) => field.label === '毕业院校')).toBe(true);
});

test('reports one failed field without discarding successful fields', async ({ page }) => {
  await page.goto('/basic-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-partial' });
  expect(scan.type).toBe('scan-result');
  const email = scan.result.descriptors.find((field) => field.label === '邮箱')!;

  const response = await runRuntimeMessage(page, {
    type: 'fill-fields',
    requestId: 'fill-partial',
    fields: [
      { fieldId: email.fieldId, profileKey: 'contact.email', value: 'partial@example.test' },
      { fieldId: 'missing-field', profileKey: 'contact.phone', value: 'not-used' },
    ],
  });

  expect(response.type).toBe('fill-result');
  expect(response.results.find((result) => result.fieldId === email.fieldId)?.outcome.status).toBe('filled');
  expect(response.results.find((result) => result.fieldId === 'missing-field')?.outcome.status).toBe('failed');
  await expect(page.locator('#email')).toHaveValue('partial@example.test');
});


test('explicit retry can overwrite a value left by a failed attempt', async ({ page }) => {
  await page.goto('/basic-form.html');
  const scan = await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-retry-overwrite' });
  const email = scan.result.descriptors.find((field) => field.label === '邮箱')!;
  await page.locator('#email').fill('stale@example.test');

  const first = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-no-overwrite',
    fields: [{ fieldId: email.fieldId, profileKey: 'contact.email', value: 'fresh@example.test' }],
  });
  expect(first.results[0].outcome.status).toBe('skipped_existing');
  await expect(page.locator('#email')).toHaveValue('stale@example.test');

  const retry = await runRuntimeMessage(page, {
    type: 'fill-fields', requestId: 'fill-explicit-retry',
    fields: [{ fieldId: email.fieldId, profileKey: 'contact.email', value: 'fresh@example.test', overwrite: true }],
  });
  expect(retry.results[0].outcome.status).toBe('filled');
  expect(retry.results[0].verification?.verified).toBe(true);
  await expect(page.locator('#email')).toHaveValue('fresh@example.test');
});


test('notifies when a dynamic step reveals new fields without exposing values', async ({ page }) => {
  await page.goto('/dynamic-form.html');
  await runRuntimeMessage(page, { type: 'scan-page', requestId: 'scan-watch-dynamic' });
  await page.getByRole('button', { name: '添加教育经历' }).click();
  await expect.poll(async () => runtimeNotifications(page)).toEqual([{
    type: 'page-fields-changed', newFieldCount: 1, sessionInvalidated: true,
  }]);
  const serialized = JSON.stringify(await runtimeNotifications(page));
  expect(serialized).not.toContain('毕业院校');
});
