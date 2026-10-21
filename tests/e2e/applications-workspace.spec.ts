import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './support/extension-fixture';

const STORAGE_KEY = 'resume-autofill.applications.v1';

type SeedRecord = {
  id: string; company: string; role: string; url: string; sourceHost: string;
  appliedAt: string; updatedAt: string; currentStage: 'applied' | 'written_test' | 'interview_1';
  currentStageLabel: string; events: Array<{ id: string; stage: 'applied' | 'written_test' | 'interview_1'; label: string; occurredAt: string }>;
};

function makeRecords(count = 50): SeedRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    const time = `2026-01-${day}T08:00:00.000Z`;
    const stage = index % 2 ? 'interview_1' : 'applied';
    const label = stage === 'interview_1' ? '一面' : '已投递';
    return { id: `record-${index}`, company: `公司 ${index}`, role: `职位 ${index}`, url: `https://example.com/jobs/${index}`, sourceHost: 'example.com', appliedAt: time, updatedAt: time, currentStage: stage, currentStageLabel: label, events: [{ id: `event-${index}`, stage, label, occurredAt: time }] };
  });
}

async function extensionId(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

async function openApplications(context: BrowserContext, records = makeRecords()): Promise<Page> {
  const id = await extensionId(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/applications.html`);
  await page.evaluate(async ({ key, value }) => {
    const extensionApi = (globalThis as typeof globalThis & {
      chrome: { storage: { local: { set(items: Record<string, unknown>): Promise<void> } } };
    }).chrome;
    await extensionApi.storage.local.set({ [key]: { schemaVersion: 1, revision: 1, records: value } });
  }, { key: STORAGE_KEY, value: records });
  await page.goto(`chrome-extension://${id}/applications.html`);
  await expect(page.getByText(`${records.length}/${records.length} 条`)).toBeVisible();
  return page;
}

test.describe('真实扩展投递记录工作台', () => {
  test('桌面端可展开完整列表，收起或选择公司后恢复双栏详情', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext);
    const list = page.getByRole('complementary', { name: '投递列表' });
    const detail = page.getByRole('region', { name: '投递详情' });
    const splitWidth = await list.evaluate((element) => element.getBoundingClientRect().width);
    const separator = page.getByRole('separator', { name: '调整投递列表宽度' });
    const separatorBox = (await separator.boundingBox())!;
    await page.mouse.move(separatorBox.x + separatorBox.width / 2, separatorBox.y + separatorBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(separatorBox.x + separatorBox.width / 2 + 120, separatorBox.y + separatorBox.height / 2, { steps: 5 });
    await page.mouse.up();
    const resizedWidth = await list.evaluate((element) => element.getBoundingClientRect().width);
    expect(resizedWidth).toBeGreaterThan(splitWidth + 100);
    expect(await page.evaluate(() => Number(localStorage.getItem('resume-autofill.applications.list-width')))).toBe(Math.round(resizedWidth));

    await list.evaluate((element) => { element.scrollTop = 420; });
    const beforeScroll = await list.evaluate((element) => element.scrollTop);

    await page.getByRole('button', { name: '展开列表' }).click();
    await expect(detail).toBeHidden();
    await expect(page.getByRole('button', { name: '收起列表' })).toHaveAttribute('aria-pressed', 'true');
    expect(await list.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(splitWidth * 1.5);
    const cardRects = await list.locator('.record-row').evaluateAll((elements) => elements.slice(0, 4).map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), width: Math.round(rect.width) };
    }));
    expect(cardRects.length).toBe(4);
    expect(cardRects[1]!.top).toBe(cardRects[0]!.top);
    expect(cardRects[0]!.width).toBeLessThan((await list.evaluate((element) => element.getBoundingClientRect().width)) / 2);
    expect(await list.evaluate((element) => element.scrollTop)).toBe(beforeScroll);

    await page.getByRole('button', { name: '收起列表' }).click();
    await expect(detail).toBeVisible();
    await page.getByRole('button', { name: '展开列表' }).click();
    const search = page.getByLabel('搜索投递记录');
    await search.fill('公司 2');
    const targetRow = list.locator('.record-row').first();
    const company = (await targetRow.locator('strong').textContent())!;
    await targetRow.click();
    await expect(detail).toBeVisible();
    await expect(page.getByRole('heading', { name: company })).toBeVisible();
    await expect(search).toHaveValue('公司 2');
  });

  test('50 条记录滚到底选择后左右独立滚动且详情顶部立即可见', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext);
    const list = page.getByRole('complementary', { name: '投递列表' });
    const detail = page.getByRole('region', { name: '投递详情' });
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const listTop = await list.evaluate((element) => element.scrollTop);
    const bottomRow = list.locator('.record-row').last();
    const company = (await bottomRow.locator('strong').textContent())!;
    await bottomRow.click();
    await expect(page.getByRole('heading', { name: company })).toBeVisible();
    expect(await list.evaluate((element) => element.scrollTop)).toBe(listTop);
    expect(await detail.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(detail.locator('.detail-header')).toBeInViewport();
    await expect(detail.getByRole('button', { name: '编辑信息' })).toBeVisible();
    const overflow = await Promise.all([list, detail].map((locator) => locator.evaluate((element) => getComputedStyle(element).overflowY)));
    expect(overflow).toEqual(['auto', 'auto']);
  });

  test('窄屏使用主从视图并返回时恢复列表滚动位置', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext);
    await page.setViewportSize({ width: 720, height: 760 });
    const list = page.getByRole('complementary', { name: '投递列表' });
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const before = await list.evaluate((element) => element.scrollTop);
    await list.locator('.record-row').last().click();
    await expect(page.getByRole('button', { name: /返回投递列表/ })).toBeVisible();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: /返回投递列表/ }).click();
    await expect(list).toBeVisible();
    expect(await list.evaluate((element) => element.scrollTop)).toBe(before);
  });

  test('阶段筛选、搜索、排序与计数协同工作', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext, makeRecords(6));
    const detailHeading = page.getByRole('region', { name: '投递详情' }).locator('h2');
    const initialCompany = await detailHeading.textContent();
    await page.getByLabel('按阶段筛选').selectOption('interview_1');
    await expect(page.getByText('3/6 条')).toBeVisible();
    const search = page.getByLabel('搜索投递记录');
    await search.fill('公司 3');
    await expect(page.getByText('1/6 条')).toBeVisible();
    await expect(detailHeading).toHaveText(initialCompany!);
    await search.blur();
    await expect(detailHeading).toHaveText(initialCompany!);
    await search.press('Enter');
    await expect(page.getByRole('heading', { name: '公司 3' })).toBeVisible();
    await search.fill('');
    await page.getByLabel('按阶段筛选').selectOption('all');
    await page.getByLabel('投递记录排序').selectOption('applied-asc');
    await expect(page.locator('.record-row').first()).toContainText('公司 0');
  });

  test('阶段选择器提供大点击热区并支持整行选择', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext, makeRecords(2));
    const trigger = page.getByRole('button', { name: '更新进度阶段' });
    expect(await trigger.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

    await trigger.click();
    const listbox = page.getByRole('listbox', { name: '更新进度阶段选项' });
    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(10);
    const optionHeights = await options.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(optionHeights.every((height) => height >= 44)).toBe(true);
    await listbox.getByRole('option', { name: '自定义阶段' }).click();
    await expect(page.getByLabel('阶段名称')).toBeVisible();

    await trigger.click();
    await listbox.getByRole('option', { name: '测评' }).click();
    await expect(trigger).toContainText('测评');
    await expect(page.getByLabel('阶段名称')).toHaveCount(0);
  });

  test('有未保存编辑时切换记录可取消或放弃', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext, makeRecords(3));
    await page.getByRole('button', { name: '编辑信息' }).click();
    await page.getByLabel('公司').fill('未保存公司');
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('.record-row').nth(1).click();
    await expect(page.getByLabel('公司')).toHaveValue('未保存公司');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.record-row').nth(1).click();
    await expect(page.getByLabel('公司')).toHaveCount(0);
  });

  test('窄屏浏览器 back 从详情返回列表', async ({ extensionContext }) => {
    const page = await openApplications(extensionContext, makeRecords(3));
    await page.setViewportSize({ width: 720, height: 760 });
    await page.locator('.record-row').first().click();
    await expect(page.getByRole('region', { name: '投递详情' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('complementary', { name: '投递列表' })).toBeVisible();
  });
});
