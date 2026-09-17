import { useEffect, useReducer, useState } from 'react';
import { browser } from 'wxt/browser';
import { buildFillPreviewSession, buildProfilePreviewSession, previewStorageKey } from '../../src/preview/preview-session';
import type { NewApplicationRecord } from '../../src/shared/application-record';
import { ProfileStore } from '../../src/profile/profile-store';
import { inferApplicationIdentity } from '../../src/runtime/application-identity';
import type { FillSummary } from '../../src/runtime/application-controller';
import type { ScanTarget } from '../../src/runtime/scan-session';
import type { ScanPageInfo } from '../../src/shared/form';
import { createMappingId, normalizeMappingScope, type MappingScope, type UserFieldMapping } from '../../src/shared/mapping';
import type { ConfirmedFill, PageFieldsChangedMessage, RuntimeCommandResponse } from '../../src/shared/messages';
import type { FillPolicy, Profile, ProfileField } from '../../src/shared/profile';
import { ApplicationStore } from '../../src/storage/application-store';
import { LocalStorage } from '../../src/storage/local-storage';
import { MappingStore } from '../../src/storage/mapping-store';
import { defaultSelectedFieldIds } from '../../src/ui/field-selection';
import { emptyProfile } from '../../src/ui/profile-fields';
import { parseFieldValue, profileCompletion } from '../../src/ui/profile-management';
import { reducePanel } from '../../src/ui/panel-state';
import { runtimeErrorMessage, userErrorMessage } from '../../src/ui/user-error-message';
import { ApplicationRecordPrompt, type ApplicationDraft } from './ApplicationRecordPrompt';
import { CustomFieldsManager } from './CustomFieldsManager';
import { FillResultPanel } from './FillResultPanel';
import { QuickProfileEditor } from './QuickProfileEditor';
import { ReviewPanel } from './ReviewPanel';

const storage = new LocalStorage();
const profileStore = new ProfileStore(storage);
const mappingStore = new MappingStore(storage);
const applicationStore = new ApplicationStore(storage);
type View = 'assistant' | 'profile' | 'custom';

function applicationDraft(page: ScanPageInfo): ApplicationDraft {
  const identity = inferApplicationIdentity(page);
  return {
    company: identity.company,
    role: identity.role,
    url: page.url,
    sourceHost: new URL(page.url).host,
  };
}

function extensionUrl(path: string): string {
  return (browser.runtime as typeof browser.runtime & { getURL(value: string): string }).getURL(path);
}

function isSessionInvalidation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'FIELD_OPERATION_FAILED';
}

async function currentPageTarget(): Promise<Omit<ScanTarget, 'scannedAt'>> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined || !tab.url || !/^https?:/i.test(tab.url)) {
    throw new Error('请先切换到要填写的招聘网页，再点击扫描。');
  }
  return { tabId: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title ?? '' };
}

export default function App() {
  const [state, dispatch] = useReducer(reducePanel, { kind: 'idle' });
  const [view, setView] = useState<View>('assistant');
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [mappings, setMappings] = useState<UserFieldMapping[]>([]);
  const [lastApplication, setLastApplication] = useState<ApplicationDraft>();
  const [manualApplication, setManualApplication] = useState<ApplicationDraft>();
  const [newFieldCount, setNewFieldCount] = useState(0);
  const completion = profileCompletion(profile);
  const scanResult = state.kind === 'review' || state.kind === 'invalidated' || state.kind === 'filling' || state.kind === 'result' ? state.result : undefined;
  const activeTarget = scanResult?.target;

  useEffect(() => {
    void Promise.all([profileStore.load(), mappingStore.list()]).then(([loadedProfile, loadedMappings]) => {
      setProfile(loadedProfile);
      setMappings(loadedMappings);
    });
    const unsubscribeProfile = profileStore.subscribe((loadedProfile) => setProfile(loadedProfile));
    const unsubscribeMappings = mappingStore.subscribe((loadedMappings) => setMappings(loadedMappings));
    return () => { unsubscribeProfile(); unsubscribeMappings(); };
  }, []);

  useEffect(() => {
    if (!activeTarget) return undefined;
    const invalidate = (message: string) => {
      setSelected([]);
      setNotice(message);
      dispatch({ type: 'scan_invalidated', message });
    };
    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (activeTarget.windowId !== undefined && info.windowId !== activeTarget.windowId) return;
      if (info.tabId === activeTarget.tabId) return;
      void browser.tabs.get(info.tabId).then((tab) => {
        if (tab.url?.startsWith(extensionUrl(''))) return;
        invalidate('页面已变化，请重新扫描');
      });
    };
    const onUpdated = (tabId: number, change: { url?: string }) => {
      if (tabId === activeTarget.tabId && change.url && change.url !== activeTarget.url) invalidate('页面已变化，请重新扫描');
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [activeTarget]);

  useEffect(() => {
    if (!activeTarget) return;
    const onFieldsChanged = (message: unknown, sender: { tab?: { id?: number } }) => {
      const change = message as Partial<PageFieldsChangedMessage>;
      if (change.type !== 'page-fields-changed'
        || sender.tab?.id !== activeTarget.tabId
        || typeof change.newFieldCount !== 'number') return;
      if (change.sessionInvalidated) {
        const message = '页面已变化，请重新扫描';
        setSelected([]);
        setNotice(message);
        dispatch({ type: 'scan_invalidated', message });
        return;
      }
      setNewFieldCount(change.newFieldCount);
    };
    browser.runtime.onMessage.addListener(onFieldsChanged);
    return () => browser.runtime.onMessage.removeListener(onFieldsChanged);
  }, [activeTarget?.tabId, activeTarget?.url]);

  async function scan() {
    setNotice('');
    setSelected([]);
    setLastApplication(undefined);
    setNewFieldCount(0);
    dispatch({ type: 'scan_requested' });
    try {
      const [loadedProfile, target] = await Promise.all([profileStore.load(), currentPageTarget()]);
      setProfile(loadedProfile);
      const response = await browser.runtime.sendMessage({ type: 'scan-active-tab', target }) as RuntimeCommandResponse;
      if (!response.ok || !('page' in response.data)) throw response.ok ? new Error('invalid-scan-result') : response.error;
      setSelected(defaultSelectedFieldIds(response.data.fields));
      dispatch({ type: 'scan_succeeded', result: response.data });
    } catch (cause) {
      const message = userErrorMessage(cause, '扫描失败');
      setNotice(message);
      dispatch({ type: 'scan_failed', message });
    }
  }

  async function saveProfile(next: Profile) {
    await profileStore.save(next);
    setProfile(next);
  }

  async function saveMapping(input: { fieldId: string; profileKey: string; customValue: string; policy: FillPolicy; label?: string; scopeKind: MappingScope['kind'] }) {
    if (state.kind !== 'review') throw new Error('请先扫描页面');
    const field = state.result.fields.find((match) => match.descriptor.fieldId === input.fieldId);
    if (!field) throw new Error('页面字段不存在');
    if (input.profileKey.startsWith('custom.')) {
      const type = field.descriptor.inputType === 'date' ? 'date' as const : field.descriptor.inputType === 'number' ? 'number' as const : 'text' as const;
      const nextProfile = { ...profile, fields: { ...profile.fields, [input.profileKey]: { key: input.profileKey, label: input.label || field.descriptor.label || input.profileKey, type, value: parseFieldValue(type, input.customValue), policy: input.policy } } };
      await saveProfile(nextProfile);
    }
    const pageUrl = new URL(state.result.page.url);
    const scope: MappingScope = input.scopeKind === 'global' ? { kind: 'global' } : input.scopeKind === 'host' ? { kind: 'host', host: state.result.page.host } : { kind: 'path', host: state.result.page.host, path: pageUrl.pathname };
    await mappingStore.upsert({ id: createMappingId(field.descriptor.fingerprint, scope, field.descriptor.sectionIndex), scope, fingerprint: field.descriptor.fingerprint, profileKey: input.profileKey, sectionIndex: field.descriptor.sectionIndex, createdAt: new Date().toISOString() });
    setMappings(await mappingStore.list());
  }

  async function saveCustomField(field: ProfileField, previousKey?: string) {
    if (previousKey && previousKey !== field.key) await mappingStore.deleteByProfileKey(previousKey);
    const next = { ...profile, fields: { ...profile.fields } };
    if (previousKey && previousKey !== field.key) delete next.fields[previousKey];
    next.fields[field.key] = field;
    await saveProfile(next);
    setMappings(await mappingStore.list());
  }

  async function deleteCustomField(key: string) {
    const next = { ...profile, fields: { ...profile.fields } };
    delete next.fields[key];
    await Promise.all([profileStore.save(next), mappingStore.deleteByProfileKey(key)]);
    setProfile(next);
    setMappings(await mappingStore.list());
  }

  async function updateMappingScope(mapping: UserFieldMapping, kind: MappingScope['kind']) {
    const existing = normalizeMappingScope(mapping.scope);
    const currentUrl = state.kind === 'review' ? new URL(state.result.page.url) : undefined;
    const host = existing.kind === 'global' ? currentUrl?.host : existing.host;
    const path = existing.kind === 'path' ? existing.path : currentUrl?.pathname;
    if (kind !== 'global' && !host) throw new Error('请先扫描目标网站，再改为网站或页面作用域');
    if (kind === 'path' && !path) throw new Error('请先扫描目标页面，再改为页面作用域');
    const scope: MappingScope = kind === 'global' ? { kind } : kind === 'host' ? { kind, host: host! } : { kind, host: host!, path: path! };
    await mappingStore.updateMapping(mapping.id, { ...mapping, id: createMappingId(mapping.fingerprint, scope, mapping.sectionIndex), scope });
    setMappings(await mappingStore.list());
  }

  async function deleteMapping(id: string) {
    await mappingStore.delete(id);
    setMappings(await mappingStore.list());
  }

  async function locate(fieldId: string) {
    if (!scanResult?.target || state.kind === 'invalidated') return;
    const response = await browser.runtime.sendMessage({ type: 'focus-active-field', fieldId, target: scanResult.target }) as RuntimeCommandResponse;
    if (!response.ok && isSessionInvalidation(response.error)) {
      const message = '页面已变化，请重新扫描';
      setSelected([]);
      setNotice(message);
      dispatch({ type: 'scan_invalidated', message });
      return;
    }
    if (!response.ok || !('focused' in response.data) || !response.data.focused) setNotice(response.ok ? '页面中已找不到该字段，请重新扫描后再定位。' : runtimeErrorMessage(response.error, '定位失败'));
  }

  async function fill(fields: ConfirmedFill[]) {
    if (!scanResult?.target || !fields.length || (state.kind !== 'review' && state.kind !== 'result')) return;
    const target = scanResult.target;
    const draft = applicationDraft(scanResult.page);
    dispatch({ type: 'fill_requested', fields });
    try {
      const response = await browser.runtime.sendMessage({ type: 'fill-confirmed-fields', fields, target }) as RuntimeCommandResponse;
      if (!response.ok || !('filled' in response.data)) throw response.ok ? new Error('invalid-fill-result') : response.error;
      const summary = response.data as FillSummary;
      setLastApplication(draft);
      dispatch({ type: 'fill_succeeded', summary });
      if (summary.failed.length > 0) await locate(summary.failed[0].fieldId);
    } catch (cause) {
      if (isSessionInvalidation(cause)) {
        const message = '页面已变化，请重新扫描';
        setSelected([]);
        setNotice(message);
        dispatch({ type: 'scan_invalidated', message });
        return;
      }
      const message = userErrorMessage(cause, '填写失败');
      setNotice(message);
      dispatch({ type: 'scan_failed', message });
    }
  }

  async function openFillPreview(fields: ConfirmedFill[]) {
    if (state.kind !== 'review' || !state.result.target) throw new Error('当前扫描结果没有绑定页面，请重新扫描。');
    const session = buildFillPreviewSession(state.result, profile, fields);
    await browser.storage.session.set({ [previewStorageKey(session.id)]: session });
    await browser.tabs.create({ url: extensionUrl(`preview.html?id=${encodeURIComponent(session.id)}`) });
  }

  async function openProfilePreview() {
    const session = buildProfilePreviewSession(profile);
    await browser.storage.session.set({ [previewStorageKey(session.id)]: session });
    await browser.tabs.create({ url: extensionUrl(`preview.html?id=${encodeURIComponent(session.id)}`) });
  }

  async function openFullProfile() {
    await browser.tabs.create({ url: extensionUrl('options.html') });
  }

  async function openApplications() {
    await browser.tabs.create({ url: extensionUrl('applications.html') });
  }

  async function beginManualApplicationRecord() {
    setNotice('');
    try {
      const target = await currentPageTarget();
      const page = scanResult?.page.url === target.url
        ? scanResult.page
        : { url: target.url, host: new URL(target.url).host, title: target.title };
      setManualApplication(applicationDraft(page));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '无法读取当前招聘页面');
    }
  }

  async function findDuplicateApplications(draft: ApplicationDraft) {
    return applicationStore.findDuplicates(draft);
  }

  async function recordApplication(draft: ApplicationDraft) {
    const input: NewApplicationRecord = { ...draft };
    return applicationStore.create(input);
  }

  return <main className="sidepanel-page">
    <header className="app-header"><div className="brand-mark">简</div><div><h1>简历填写助手</h1><p>本地存储 · 确认填写 · 绝不自动提交</p></div></header>
    <nav className="primary-nav" aria-label="主要导航"><button className={view === 'assistant' ? 'active' : ''} onClick={() => setView('assistant')}>填写助手</button><button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>我的资料</button><button className={view === 'custom' ? 'active' : ''} onClick={() => setView('custom')}>自定义字段</button><button onClick={() => void openApplications()}>投递记录</button></nav>
    {notice && <p className="notice" role="alert">{notice}</p>}
    {view === 'profile' && <QuickProfileEditor profile={profile} onSave={saveProfile} onOpenFull={() => void openFullProfile()} onPreview={() => void openProfilePreview()} />}
    {view === 'custom' && <CustomFieldsManager profile={profile} mappings={mappings} onSave={saveCustomField} onDelete={deleteCustomField} onUpdateMapping={updateMappingScope} onDeleteMapping={deleteMapping} />}
    {view === 'assistant' && <>
      {state.kind === 'idle' && <section className="assistant-empty card"><div className="completion-ring" aria-label={`资料完成度 ${completion.percent}%`}>{completion.percent}%</div><div><h2>{completion.filled ? '继续完善资料并扫描页面' : '先完善基础资料'}</h2><p>{completion.filled ? `已填写 ${completion.filled}/${completion.total} 项资料` : '填写姓名、手机和邮箱后，匹配会更准确。'}</p></div><div className="completion-groups"><span>基本信息 {completion.bySection.basic.filled}/{completion.bySection.basic.total}</span><span>教育 {completion.bySection.education.filled}/{completion.bySection.education.total}</span><span>工作 {completion.bySection.work.filled}/{completion.bySection.work.total}</span></div>{!completion.filled && <button className="secondary-button" type="button" onClick={() => setView('profile')}>完善基础资料</button>}</section>}
      <section className="scan-card card"><div><strong>{scanResult ? scanResult.page.title || scanResult.page.host : '扫描当前招聘页面'}</strong><span>{scanResult ? scanResult.page.url : '仅扫描当前显示的网页'}</span></div><button type="button" onClick={() => void scan()} disabled={state.kind === 'scanning'}>{state.kind === 'scanning' ? '正在扫描…' : scanResult ? '重新扫描' : '扫描当前页面'}</button></section>
      {state.kind !== 'invalidated' && newFieldCount > 0 && <section className="new-fields-alert" role="status"><span><strong>发现 {newFieldCount} 个新字段</strong><small>页面步骤或经历区块已变化，重新扫描不会自动填写或提交。</small></span><button type="button" onClick={() => void scan()}>重新扫描</button></section>}
      <section className="manual-application-card card"><strong>已经完成投递？</strong><button type="button" onClick={() => void beginManualApplicationRecord()}>确认已完成投递</button></section>
      {manualApplication && <ApplicationRecordPrompt draft={manualApplication} onFindDuplicates={findDuplicateApplications} onRecord={recordApplication} onOpenManager={() => void openApplications()} />}
      {state.kind === 'invalidated' && <section className="invalidated-card card" role="alert" aria-labelledby="invalidated-title"><div><h2 id="invalidated-title">页面已变化，请重新扫描</h2><p>旧扫描结果已停用，重新扫描后才能继续定位、预览或填写。</p></div><button type="button" className="primary-button" onClick={() => void scan()}>重新扫描当前页面</button></section>}
      {state.kind === 'review' && <ReviewPanel result={state.result} profile={profile} selected={selected} setSelected={setSelected} onFill={(fields) => void fill(fields)} onPreview={openFillPreview} onSaveMapping={saveMapping} onLocate={locate} onRescan={scan} />}
      {state.kind === 'filling' && <div className="loading-card card" role="status"><span className="spinner" />正在填写 {state.fields.length} 个字段…</div>}
      {state.kind === 'result' && <>
        <FillResultPanel result={state.result} fields={state.fields} summary={state.summary} onRetry={(fields) => void fill(fields)} onLocate={(fieldId) => void locate(fieldId)} onRescan={() => void scan()} />
        {lastApplication && <ApplicationRecordPrompt draft={lastApplication} onFindDuplicates={findDuplicateApplications} onRecord={recordApplication} onOpenManager={() => void openApplications()} />}
      </>}
    </>}
  </main>;
}
