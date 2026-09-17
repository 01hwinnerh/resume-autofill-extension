import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { ProfileStore } from '../../src/profile/profile-store';
import { PendingSaveCoordinator, type SaveState } from '../../src/preview/pending-save';
import type { PreviewSession, ProfilePreviewSection } from '../../src/preview/preview-session';
import { buildProfilePreviewSession, previewStorageKey, updateFillPreviewSessionValue } from '../../src/preview/preview-session';
import { PREVIEW_REQUEST_CLOSE_MESSAGE, postMessageOrigin, requestEmbeddedPreviewClose } from '../../src/runtime/preview-overlay';
import type { ConfirmedFill, RuntimeCommandResponse } from '../../src/shared/messages';
import type { FieldValue } from '../../src/shared/profile';
import { LocalStorage } from '../../src/storage/local-storage';
import { failureFeedback } from '../../src/ui/fill-feedback';
import { parseFieldValue } from '../../src/ui/profile-management';
import { runtimeErrorMessage, userErrorMessage } from '../../src/ui/user-error-message';

const profileStore = new ProfileStore(new LocalStorage());

function ProfileView({ sections }: { sections: ProfilePreviewSection[] }) {
  if (sections.length === 0) return <div className="empty-state"><h2>还没有可预览的资料</h2><p>请先在“我的资料”中保存内容，再打开预览。</p></div>;
  return <div className="profile-preview">{sections.map((section) => (
    <section className="preview-section" key={section.id}>
      <header><h2>{section.label}</h2><span>{section.items.length} 项</span></header>
      <div className="profile-grid">{section.items.map((item) => <div className="profile-item" key={item.key}><span>{item.label}</span><strong>{item.value || '空'}</strong></div>)}</div>
    </section>
  ))}</div>;
}

export default function App() {
  const [session, setSessionState] = useState<PreviewSession>();
  const sessionRef = useRef<PreviewSession | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<'fill' | 'profile'>('fill');
  const [message, setMessage] = useState('');
  const [fillCompleted, setFillCompleted] = useState(false);
  const [failures, setFailures] = useState<Array<{ fieldId: string; reason: string }>>([]);
  const [modifiedFieldIds, setModifiedFieldIds] = useState<Set<string>>(new Set());
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const saveCoordinator = useRef(new PendingSaveCoordinator()).current;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const searchParams = new URLSearchParams(location.search);
  const id = searchParams.get('id');
  const embedded = searchParams.get('embedded') === '1';
  const runtimeOrigin = postMessageOrigin((browser.runtime as typeof browser.runtime & { getURL(value: string): string }).getURL('/'));
  const requestedParentOrigin = searchParams.get('parentOrigin');
  const parentOrigin = requestedParentOrigin && /^https?:\/\//i.test(requestedParentOrigin)
    ? postMessageOrigin(requestedParentOrigin)
    : runtimeOrigin;
  function setSession(value: PreviewSession | undefined) { sessionRef.current = value; setSessionState(value); }

  function closeEmbeddedPreview() {
    if (embedded && id) requestEmbeddedPreviewClose(window.parent, id, parentOrigin);
  }

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    void browser.storage.session.get(previewStorageKey(id)).then((stored) => {
      const value = stored[previewStorageKey(id)] as PreviewSession | undefined;
      setSession(value);
      if (value?.kind === 'profile') setActive('profile');
      setLoading(false);
    });
  }, [id]);

  useEffect(() => profileStore.subscribe((profile) => {
    const current = sessionRef.current;
    if (!current) return;
    const sections = buildProfilePreviewSession(profile).sections;
    setSession(current.kind === 'profile' ? { ...current, sections } : { ...current, profileSections: sections });
  }), []);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (!saveCoordinator.hasPending() && !saveCoordinator.hasFailure()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [saveCoordinator]);

  function updateDraft(fieldId: string, value: string) {
    const current = sessionRef.current;
    if (current?.kind === 'fill') setSession(updateFillPreviewSessionValue(current, fieldId, value));
    saveCoordinator.updateDraft(fieldId, value);
    setModifiedFieldIds((previous) => new Set(previous).add(fieldId));
    setSaveStates((previous) => ({ ...previous, [fieldId]: 'saving' }));
    setFillCompleted(false); setFailures([]);
  }

  async function persistEditedValue(fieldId: string, rawValue: string): Promise<void> {
    const current = sessionRef.current;
    if (!id || current?.kind !== 'fill') return;
    const field = current.fields.find((candidate) => candidate.fieldId === fieldId);
    if (!field) return;
    try {
      let value: FieldValue = rawValue;
      let profileFieldFound = false;
      const updatedProfile = await profileStore.update((profile) => {
        const profileField = profile.fields[field.profileKey];
        if (!profileField) return profile;
        value = parseFieldValue(profileField.type, rawValue);
        if (profileField.type === 'number' && typeof value === 'number' && !Number.isFinite(value)) throw new Error('invalid-number');
        profileFieldFound = true;
        return { ...profile, fields: { ...profile.fields, [field.profileKey]: { ...profileField, value } } };
      });
      await saveCoordinator.serializeSession(async () => {
        const latest = sessionRef.current;
        if (latest?.kind !== 'fill') return;
        const profileSections = profileFieldFound ? buildProfilePreviewSession(updatedProfile).sections : latest.profileSections;
        const updatedSession = updateFillPreviewSessionValue(latest, fieldId, value, profileSections);
        await browser.storage.session.set({ [previewStorageKey(id)]: updatedSession });
        setSession(updatedSession);
      });
      setSaveStates((previous) => ({ ...previous, [fieldId]: 'saved' }));
      setMessage(profileFieldFound ? '修改已保存并同步到本地个人资料。' : '修改已保存到本次填写。');
    } catch (error) {
      setSaveStates((previous) => ({ ...previous, [fieldId]: 'failed' }));
      setMessage(userErrorMessage(error, '修改保存失败'));
      throw error;
    }
  }

  function queueEditedValue(fieldId: string, rawValue: string): Promise<void> {
    const oldTimer = timers.current.get(fieldId);
    if (oldTimer) { clearTimeout(oldTimer); timers.current.delete(fieldId); }
    setSaveStates((previous) => ({ ...previous, [fieldId]: 'saving' }));
    return saveCoordinator.run(fieldId, rawValue, (value) => persistEditedValue(fieldId, value));
  }

  function scheduleSave(fieldId: string, value: string) {
    const oldTimer = timers.current.get(fieldId); if (oldTimer) clearTimeout(oldTimer);
    timers.current.set(fieldId, setTimeout(() => { timers.current.delete(fieldId); void queueEditedValue(fieldId, value).catch(() => undefined); }, 350));
  }

  async function flushPendingSaves(): Promise<boolean> {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    const saved = await saveCoordinator.flush((fieldId, value) => persistEditedValue(fieldId, value));
    if (!saved) setMessage('有修改尚未保存。请检查标记为“保存失败”的字段并重试。');
    return saved;
  }

  const groups = useMemo(() => {
    if (session?.kind !== 'fill') return [];
    const grouped = new Map<string, typeof session.items>();
    for (const item of session.items) grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
    return Array.from(grouped.entries());
  }, [session]);

  async function returnToTarget() {
    if (!(await flushPendingSaves())) return;
    const current = sessionRef.current;
    if (current?.kind !== 'fill' || !current.target) return;
    if (embedded) { closeEmbeddedPreview(); return; }
    await browser.tabs.update(current.target.tabId, { active: true });
    if (current.target.windowId !== undefined) await browser.windows.update(current.target.windowId, { focused: true });
  }

  useEffect(() => {
    if (!embedded || !id) return undefined;
    const onParentMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; sessionId?: unknown } | null;
      if (event.source !== window.parent
        || event.origin !== parentOrigin
        || !data
        || data.type !== PREVIEW_REQUEST_CLOSE_MESSAGE
        || data.sessionId !== id) return;
      void returnToTarget();
    };
    window.addEventListener('message', onParentMessage);
    return () => window.removeEventListener('message', onParentMessage);
  });

  async function runFill(requestedFields: ConfirmedFill[]) {
    if (!(await flushPendingSaves())) return;
    const current = sessionRef.current;
    if (current?.kind !== 'fill' || !current.target || requestedFields.length === 0) return;
    const requestedIds = new Set(requestedFields.map((field) => field.fieldId));
    const fields = current.fields.filter((field) => requestedIds.has(field.fieldId));
    setMessage('正在写入目标页面…'); setFailures([]);
    const response = await browser.runtime.sendMessage({ type: 'fill-confirmed-fields', fields, target: current.target }) as RuntimeCommandResponse;
    if (!response.ok) { setMessage(runtimeErrorMessage(response.error, '填写失败')); return; }
    const summary = response.data as { verified: string[]; skippedExisting: string[]; failed: Array<{ fieldId: string; reason: string }> };
    setFillCompleted(true); setFailures(summary.failed);
    if (summary.failed.length > 0) { setMessage(`${summary.verified.length} 项成功，${summary.failed.length} 项需要处理。请查看原因并按需定位。`); return; }
    setMessage(`已写入招聘页：${summary.verified.length} 项成功${summary.skippedExisting.length ? `，${summary.skippedExisting.length} 项保留原值` : ''}。`);
    if (!embedded) await returnToTarget();
  }

  async function locateFailure(fieldId: string) {
    if (!(await flushPendingSaves())) return;
    const current = sessionRef.current;
    if (current?.kind !== 'fill' || !current.target) return;
    await browser.tabs.update(current.target.tabId, { active: true });
    const response = await browser.runtime.sendMessage({ type: 'close-and-focus-active-field', fieldId, target: current.target }) as RuntimeCommandResponse;
    if (!response.ok || !('focused' in response.data) || !response.data.focused) setMessage(response.ok ? '页面中已找不到该字段，请重新扫描后再定位。' : runtimeErrorMessage(response.error, '关闭预览并定位失败'));
  }

  function retryFailures() {
    const current = sessionRef.current; if (current?.kind !== 'fill') return;
    const failedIds = new Set(failures.map((failure) => failure.fieldId));
    void runFill(current.fields.filter((field) => failedIds.has(field.fieldId)).map((field) => ({ ...field, overwrite: true })));
  }

  if (loading) return <main className="preview-shell"><div className="empty-state" role="status"><span className="spinner" />正在准备预览…</div></main>;
  if (!session) return <main className="preview-shell"><div className="empty-state"><h1>预览已失效</h1><p>该预览可能已过期，请回到侧边栏重新扫描并选择字段。</p></div></main>;
  const profileSections = session.kind === 'fill' ? session.profileSections : session.sections;
  return <main className={`preview-shell${embedded ? ' embedded' : ''}`}>
    <header className="preview-header"><div className="brand"><span>简</span><div><h1>{session.kind === 'fill' ? '本次填写预览' : '个人资料预览'}</h1><p>{session.kind === 'fill' ? `${session.page.title || session.page.host} · ${session.page.host}` : '以可读形式检查最终资料效果'}</p></div></div>{session.kind === 'fill' && <div className="header-actions"><button type="button" className="secondary" onClick={() => void returnToTarget()}>{embedded ? '关闭预览' : '返回招聘页'}</button></div>}</header>
    {session.kind === 'fill' && <nav className="preview-tabs" aria-label="预览内容"><button type="button" aria-current={active === 'fill' ? 'page' : undefined} className={active === 'fill' ? 'active' : ''} onClick={() => setActive('fill')}>本次填写</button><button type="button" aria-current={active === 'profile' ? 'page' : undefined} className={active === 'profile' ? 'active' : ''} onClick={() => setActive('profile')}>个人资料</button></nav>}
    {session.kind === 'fill' && (session.repeatSectionWarnings ?? []).map((warning) => <section className="slot-warning" role="alert" aria-live="polite" key={warning.category}><strong>页面经历槽位不足</strong><span>{warning.message}</span></section>)}
    {active === 'profile' ? <ProfileView sections={profileSections} /> : session.kind === 'fill' && <>{session.items.length === 0 ? <div className="empty-state"><h2>当前没有可预览的字段</h2><p>请返回侧边栏，重新扫描页面并至少选择一个可填写字段。</p><button type="button" onClick={() => void returnToTarget()}>返回招聘页</button></div> : <div className="preview-layout">
      <aside><strong>填写摘要</strong><span>{session.items.length} 个字段</span><span>{new Set(session.items.map((item) => item.group)).size} 个分组</span>{modifiedFieldIds.size > 0 && <span className="modified-count">本次已修改 {modifiedFieldIds.size} 项</span>}<small>页面已有值默认跳过；只有你明确选择覆盖或重试才会覆盖。</small><small>修改会自动保存到本地资料；离开或填写前会等待保存完成。</small><small>最终提交始终由你在招聘页面完成。</small></aside>
      <div className="preview-content">{groups.map(([group, items]) => <section className="preview-section" key={group}><header><h2>{group}</h2><span>{items.length} 项</span></header><div className="comparison-table"><div className="table-head"><span>页面字段</span><span>当前值</span><span>将填写值（可修改）</span><span>依据</span></div>{items.map((item) => { const state = saveStates[item.fieldId]; return <div className={`comparison-row${modifiedFieldIds.has(item.fieldId) ? ' modified' : ''}`} key={item.fieldId}><strong>{item.label}</strong><span>{item.currentValue || '空'}</span><span><input className="edit-next-value" aria-label={`修改${item.label}的待填值`} type="text" value={item.nextValue} onCompositionStart={() => saveCoordinator.setComposing(item.fieldId, true)} onCompositionEnd={(event) => { saveCoordinator.setComposing(item.fieldId, false); updateDraft(item.fieldId, event.currentTarget.value); scheduleSave(item.fieldId, event.currentTarget.value); }} onChange={(event) => { updateDraft(item.fieldId, event.target.value); if (!saveCoordinator.isComposing(item.fieldId)) scheduleSave(item.fieldId, event.target.value); }} onBlur={(event) => { if (!saveCoordinator.isComposing(item.fieldId)) void queueEditedValue(item.fieldId, event.currentTarget.value).catch(() => undefined); }} aria-describedby={`save-${item.fieldId}`} /><small id={`save-${item.fieldId}`} className={`save-state ${state ?? ''}`} role="status" aria-live="polite">{state === 'saving' ? '保存中…' : state === 'saved' ? '已保存' : state === 'failed' ? <>保存失败 <button type="button" className="retry-save" onClick={() => void queueEditedValue(item.fieldId, saveCoordinator.draft(item.fieldId) ?? item.nextValue).catch(() => undefined)}>重试</button></> : '修改后自动保存'}</small></span><span><b>{item.confidence === undefined ? '手动' : `${Math.round(item.confidence * 100)}%`}</b><small>{item.reasons.join('；') || item.source}</small></span></div>; })}</div></section>)}</div>
    </div>}</>}
    {session.kind === 'fill' && failures.length > 0 && <section className="preview-failures" aria-labelledby="failure-heading"><header><h2 id="failure-heading">需要处理的字段</h2><span>{failures.length} 项</span></header>{failures.map((failure) => { const feedback = failureFeedback(failure.reason); return <div className={`preview-failure-item failure-${feedback.category}`} key={failure.fieldId}><span><strong>{session.items.find((item) => item.fieldId === failure.fieldId)?.label ?? '未知字段'}</strong><small>{feedback.title}</small><em>{feedback.action}</em></span><button type="button" className="secondary" onClick={() => void locateFailure(failure.fieldId)}>定位并关闭预览</button></div>; })}<button type="button" className="primary retry-failures" onClick={retryFailures}>仅重试失败项</button></section>}
    {session.kind === 'fill' && session.items.length > 0 && <footer className="action-bar"><div><strong>{fillCompleted ? failures.length ? '部分字段需要处理' : '已写入招聘页面' : `即将填写 ${session.items.length} 项`}</strong><span role="status" aria-live="polite">{message || '不会自动提交申请；投递完成后请在侧边栏主动记录'}</span></div><button type="button" className="primary" onClick={() => void (fillCompleted ? returnToTarget() : runFill(session.fields))}>{fillCompleted ? '返回招聘页检查' : '确认填写'}</button></footer>}
  </main>;
}
