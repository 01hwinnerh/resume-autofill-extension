import type { Page } from '@playwright/test';
import type { RuntimeCommand, RuntimeCommandResponse } from '../../src/shared/messages';
import { expect, test } from './support/extension-fixture';

declare const chrome: any;

async function targetFor(extensionPage: Page, targetPage: Page) {
  const url = targetPage.url();
  return extensionPage.evaluate(async (targetUrl) => {
    const tab = (await chrome.tabs.query({})).find((candidate: { url?: string; id?: number; windowId?: number; title?: string }) => candidate.url === targetUrl);
    if (tab?.id === undefined || !tab.url) throw new Error(`Target tab not found: ${targetUrl}`);
    return { tabId: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title ?? '' };
  }, url);
}

async function command(extensionPage: Page, message: RuntimeCommand): Promise<RuntimeCommandResponse> {
  return extensionPage.evaluate((value) => chrome.runtime.sendMessage(value), message) as Promise<RuntimeCommandResponse>;
}

test.describe('real MV3 extension integration', () => {
  test('drives scan, inline profile save, preview fill, overlay close and confirmed application record', async ({ extensionContext, extensionId, extensionPage, targetPage }) => {
    await extensionPage.getByRole('button', { name: '扫描当前页面' }).click();
    await expect(extensionPage.getByText('资料缺失', { exact: true }).first()).toBeVisible();

    const emailEditor = extensionPage.getByLabel('邮箱本次填写值');
    await emailEditor.fill('real-extension@example.test');
    await emailEditor.locator('../..').getByRole('button', { name: '保存到我的资料' }).click();
    await expect(extensionPage.getByText(/缺失的标准资料字段已保存/)).toBeVisible();

    const other = await targetPage.context().newPage();
    await other.goto('http://127.0.0.1:4173/controlled-form.html');
    await other.bringToFront();
    await expect(extensionPage.getByText('目标页未激活', { exact: true })).toBeVisible();
    await targetPage.bringToFront();
    await expect(extensionPage.getByText('目标页未激活', { exact: true })).toBeHidden();

    await extensionPage.getByRole('button', { name: '完整预览' }).click();
    const preview = await targetPage.waitForEvent('framenavigated', {
      predicate: (frame) => frame.url().startsWith('chrome-extension://') && frame.url().includes('/preview.html'),
    }).catch(() => targetPage.frames().find((frame) => frame.url().startsWith('chrome-extension://') && frame.url().includes('/preview.html'))!);
    await expect(preview.getByRole('heading', { name: '本次填写预览' })).toBeVisible();
    await preview.getByRole('button', { name: '确认填写' }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(preview.getByText(/已写入招聘页面/).first()).toBeVisible();
    await expect(targetPage.locator('#email')).toHaveValue('real-extension@example.test');
    await expect(targetPage.locator('#name')).toHaveValue('Existing Candidate');
    await preview.getByRole('button', { name: '关闭预览' }).click();
    await expect.poll(() => targetPage.frames().some((frame) => frame.url().includes('/preview.html'))).toBe(false);

    await extensionPage.getByRole('button', { name: '确认已完成投递' }).click();
    await expect(extensionPage.getByRole('heading', { name: '确认投递信息' })).toBeVisible();
    await extensionPage.getByLabel('公司').fill('真实集成公司');
    await extensionPage.getByLabel('职位', { exact: true }).fill('真实集成岗位');

    const applicationsPage = await extensionContext.newPage();
    await applicationsPage.goto(`chrome-extension://${extensionId}/applications.html`);
    await expect(applicationsPage.getByText('还没有投递记录')).toBeVisible();
    const before = await extensionPage.evaluate(async () => (await chrome.storage.local.get('resume-autofill.applications.v1'))['resume-autofill.applications.v1']);
    const beforeCount = before?.records?.length ?? 0;
    await applicationsPage.bringToFront();
    await expect(extensionPage.getByText('目标页未激活', { exact: true })).toBeVisible();

    await extensionPage.getByRole('button', { name: '确认投递并记录' }).click();
    await expect(extensionPage.getByText('记录成功，查看该记录')).toBeVisible();
    const persisted = await extensionPage.evaluate(async () => ({ local: await chrome.storage.local.get('resume-autofill.applications.v1'), session: await chrome.storage.session.get(null) }));
    const envelope = persisted.local['resume-autofill.applications.v1'];
    expect(envelope.records).toHaveLength(beforeCount + 1);
    const created = envelope.records[0];
    expect(created).toMatchObject({ company: '真实集成公司', role: '真实集成岗位', url: targetPage.url(), sourceHost: '127.0.0.1:4173', currentStage: 'applied' });
    expect(created.id).toBeTruthy();
    expect(created.events).toEqual([expect.objectContaining({ stage: 'applied', label: '已投递' })]);
    expect(JSON.stringify(persisted.session)).not.toContain('real-extension@example.test');

    await expect(applicationsPage.getByRole('button', { name: /真实集成公司.*真实集成岗位/ })).toHaveClass(/active/);
    await expect(applicationsPage.getByRole('heading', { name: '真实集成公司' })).toBeVisible();
    const openedPagePromise = extensionContext.waitForEvent('page');
    await extensionPage.getByRole('button', { name: '查看该记录' }).click();
    const openedPage = await openedPagePromise;
    await openedPage.waitForLoadState('domcontentloaded');
    expect(openedPage.url()).toBe(`chrome-extension://${extensionId}/applications.html?id=${encodeURIComponent(created.id)}`);
    await expect(openedPage.getByRole('button', { name: /真实集成公司.*真实集成岗位/ })).toHaveClass(/active/);
    await expect(openedPage.getByRole('heading', { name: '真实集成公司' })).toBeVisible();
  });

  test('keeps application records in the sidepanel until the explicit manager action', async ({ extensionContext, extensionId, extensionPage }) => {
    const records = [
      { id: 'sidepanel-newer', company: '侧栏新公司', role: '前端工程师', url: 'https://jobs.example/newer', sourceHost: 'jobs.example', appliedAt: '2026-09-25T08:00:00.000Z', updatedAt: '2026-09-26T08:00:00.000Z', currentStage: 'interview_1', currentStageLabel: '一面', events: [{ id: 'event-newer', stage: 'interview_1', label: '一面', occurredAt: '2026-09-26T08:00:00.000Z' }] },
      { id: 'sidepanel-older', company: '侧栏旧公司', role: '产品经理', url: 'https://jobs.example/older', sourceHost: 'jobs.example', appliedAt: '2026-09-20T08:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z', currentStage: 'applied', currentStageLabel: '已投递', events: [{ id: 'event-older', stage: 'applied', label: '已投递', occurredAt: '2026-09-20T08:00:00.000Z' }] },
    ];
    await extensionPage.evaluate(async (value) => chrome.storage.local.set({ 'resume-autofill.applications.v1': { schemaVersion: 1, revision: 1, records: value } }), records);
    const pagesBeforeTab = extensionContext.pages().length;

    const applicationsTab = extensionPage.getByRole('button', { name: '投递记录' });
    await applicationsTab.click();
    await expect(applicationsTab).toHaveClass(/active/);
    await expect(applicationsTab).toHaveAttribute('aria-current', 'page');
    await expect(extensionPage.getByRole('list', { name: '投递记录列表' })).toBeVisible();
    await expect(extensionPage.getByText('共 2 条投递记录')).toBeVisible();
    expect(extensionContext.pages()).toHaveLength(pagesBeforeTab);

    const olderRow = extensionPage.getByRole('button', { name: /侧栏旧公司/ });
    await olderRow.click();
    await expect(olderRow).toHaveAttribute('aria-current', 'true');
    await expect(extensionPage.getByLabel('选中投递记录详情')).toContainText('侧栏旧公司');
    expect(extensionContext.pages()).toHaveLength(pagesBeforeTab);

    const managerPromise = extensionContext.waitForEvent('page');
    await extensionPage.getByRole('button', { name: '打开完整管理页' }).click();
    const managerPage = await managerPromise;
    await managerPage.waitForLoadState('domcontentloaded');
    expect(managerPage.url()).toBe(`chrome-extension://${extensionId}/applications.html?id=sidepanel-older`);
  });

  test('uses real background/content runtimes for cross-origin iframe, open shadow DOM and no-overwrite safety', async ({ extensionPage, targetPage }) => {
    await targetPage.goto('http://127.0.0.1:4173/extension-integration.html');
    await targetPage.bringToFront();
    const target = await targetFor(extensionPage, targetPage);
    const scanned = await command(extensionPage, { type: 'scan-active-tab', target });
    expect(scanned.ok).toBe(true);
    if (!scanned.ok || !('fields' in scanned.data)) throw new Error('real extension scan failed');
    const fields = scanned.data.fields;
    const shadowEmail = fields.find((item) => item.descriptor.label === '邮箱');
    const iframeCompany = fields.find((item) => item.descriptor.label === '公司名称');
    const existing = fields.find((item) => item.descriptor.name === 'name');
    expect(shadowEmail?.descriptor.frameIdentity).toBeTruthy();
    expect(iframeCompany?.descriptor.frameOrigin).toBe('http://127.0.0.1:4174');
    expect(iframeCompany?.descriptor.frameUrl).toContain('iframe-ats-form.html');

    const response = await command(extensionPage, {
      type: 'fill-confirmed-fields', target: scanned.data.target!, fields: [
        { fieldId: shadowEmail!.descriptor.fieldId, profileKey: 'contact.email', value: 'shadow@example.test' },
        { fieldId: iframeCompany!.descriptor.fieldId, profileKey: 'workExperiences.0.company', value: '跨域公司' },
        { fieldId: existing!.descriptor.fieldId, profileKey: 'identity.name', value: '不应覆盖' },
      ],
    });
    expect(response.ok).toBe(true);
    await expect(targetPage.locator('#shadow-host').locator('#shadow-email')).toHaveValue('shadow@example.test');
    await expect(targetPage.frameLocator('iframe').locator('input[name="company"]')).toHaveValue('跨域公司');
    await expect(targetPage.locator('#existing-name')).toHaveValue('请保留我');
  });

  test('hard-invalidates a same-URL step and preserves operation queries across service-worker restart', async ({ extensionContext, extensionId, extensionPage, targetPage }) => {
    await extensionPage.getByRole('button', { name: '扫描当前页面' }).click();
    await expect(extensionPage.getByText('资料缺失', { exact: true }).first()).toBeVisible();
    await targetPage.locator('#phone').evaluate((element) => element.remove());
    await expect(extensionPage.getByRole('heading', { name: '页面已变化，请重新扫描' })).toBeVisible();

    await targetPage.reload();
    await targetPage.bringToFront();
    const target = await targetFor(extensionPage, targetPage);
    const scanned = await command(extensionPage, { type: 'scan-active-tab', target });
    if (!scanned.ok || !('fields' in scanned.data)) throw new Error('scan failed');
    const email = scanned.data.fields.find((item) => item.descriptor.label === '邮箱')!;
    const operationId = `restart-${Date.now()}`;
    const filled = await command(extensionPage, { type: 'fill-confirmed-fields', operationId, target: scanned.data.target!, fields: [{ fieldId: email.descriptor.fieldId, profileKey: 'contact.email', value: 'restart@example.test' }] });
    expect(filled.ok).toBe(true);
    await extensionPage.evaluate(async () => chrome.storage.local.set({
      'resume-autofill.transaction.v1': { schemaVersion: 1, transactionId: 'restart-journal', kind: 'profile-mapping-update', phase: 'committed', createdAt: new Date().toISOString(), previous: {}, targets: [], appliedKeys: [] },
    }));
    const cdp = await extensionContext.newCDPSession(extensionPage);
    const versionUpdate = new Promise<{ versions: Array<{ versionId: string; scriptURL: string }> }>((resolve) => cdp.once('ServiceWorker.workerVersionUpdated', resolve));
    await cdp.send('ServiceWorker.enable');
    const versions = await versionUpdate;
    const version = versions.versions.find((item) => item.scriptURL.startsWith(`chrome-extension://${extensionId}/`));
    expect(version).toBeDefined();
    await cdp.send('ServiceWorker.stopWorker', { versionId: version!.versionId });
    const queried = await command(extensionPage, { type: 'query-fill-operation', operationId, target: scanned.data.target!, fields: [{ fieldId: email.descriptor.fieldId, profileKey: 'contact.email', value: 'restart@example.test' }] });
    expect(queried).toMatchObject({ ok: true, data: { state: 'completed' } });
    await expect.poll(() => extensionPage.evaluate(async () => (await chrome.storage.local.get('resume-autofill.transaction.v1'))['resume-autofill.transaction.v1'])).toBeUndefined();
  });

  test('restores a detail-page draft on the personal application list and records the original URL', async ({ extensionContext, extensionId, extensionPage, targetPage }) => {
    await targetPage.goto('http://127.0.0.1:4173/application-detail.html');
    await targetPage.bringToFront();
    await extensionPage.getByRole('button', { name: '扫描当前页面' }).click();
    await extensionPage.getByLabel('邮箱本次填写值').fill('draft@example.test');
    await extensionPage.getByLabel('邮箱本次填写值').locator('../..').getByRole('button', { name: '保存到我的资料' }).click();
    await extensionPage.getByRole('button', { name: /^(?:预览并确认|快速填写) \d+ 项$/ }).click();
    const preview = targetPage.frames().find((frame) => frame.url().startsWith('chrome-extension://') && frame.url().includes('/preview.html'))
      ?? await targetPage.waitForEvent('framenavigated', { predicate: (frame) => frame.url().startsWith('chrome-extension://') && frame.url().includes('/preview.html') });
    await preview.getByRole('button', { name: '确认填写' }).evaluate((button: HTMLButtonElement) => button.click());
    await expect(preview.getByText(/已写入招聘页面/).first()).toBeVisible();

    const detailUrl = targetPage.url();
    await targetPage.goto('http://127.0.0.1:4173/meituan-applications.html');
    await targetPage.bringToFront();
    await extensionPage.getByRole('button', { name: '确认已完成投递' }).click();
    await expect(extensionPage.getByText('来源：最近填写草稿')).toBeVisible();
    await expect(extensionPage.getByLabel('公司')).toHaveValue('美团');
    await expect(extensionPage.getByLabel('职位', { exact: true })).toHaveValue('AI Agent开发工程师');
    await expect(extensionPage.getByLabel('职位链接')).toHaveValue(detailUrl);
    const beforeCount = await extensionPage.evaluate(async () => ((await chrome.storage.local.get('resume-autofill.applications.v1'))['resume-autofill.applications.v1']?.records?.length ?? 0));
    await extensionPage.getByRole('button', { name: '确认投递并记录' }).click();
    await expect(extensionPage.getByText('记录成功，查看该记录')).toBeVisible();
    const after = await extensionPage.evaluate(async () => (await chrome.storage.local.get('resume-autofill.applications.v1'))['resume-autofill.applications.v1']);
    expect(after.records).toHaveLength(beforeCount + 1);
    expect(after.records[0]).toMatchObject({ company: '美团', role: 'AI Agent开发工程师', url: detailUrl });
    const applicationsPage = await extensionContext.newPage();
    await applicationsPage.goto(`chrome-extension://${extensionId}/applications.html`);
    await expect(applicationsPage.getByRole('button', { name: /美团.*AI Agent开发工程师/ })).toBeVisible();
  });

  test('extracts the unique active successful Meituan candidate when no draft exists', async ({ extensionPage, targetPage }) => {
    await targetPage.goto('http://127.0.0.1:4173/meituan-applications.html');
    await targetPage.bringToFront();
    await extensionPage.getByRole('button', { name: '确认已完成投递' }).click();
    await expect(extensionPage.getByText('来源：当前投递页面唯一候选')).toBeVisible();
    await expect(extensionPage.getByLabel('公司')).toHaveValue('美团');
    await expect(extensionPage.getByLabel('职位', { exact: true })).toHaveValue('AI Agent开发工程师');
  });
});
