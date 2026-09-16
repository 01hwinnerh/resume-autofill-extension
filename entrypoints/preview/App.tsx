import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { ProfileStore } from '../../src/profile/profile-store';
import type { PreviewSession, ProfilePreviewSection } from '../../src/preview/preview-session';
import { buildProfilePreviewSession, previewStorageKey, updateFillPreviewSessionValue } from '../../src/preview/preview-session';
import type { ConfirmedFill, RuntimeCommandResponse } from '../../src/shared/messages';
import { LocalStorage } from '../../src/storage/local-storage';
import { parseFieldValue } from '../../src/ui/profile-management';

const profileStore = new ProfileStore(new LocalStorage());

function mask(value: string): string {
  if (!value) return '空';
  if (value.length <= 2) return `${value.slice(0, 1)}*`;
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return value.length > 8 ? `${value.slice(0, 3)}••••${value.slice(-3)}` : value;
}

function ProfileView({ sections, reveal }: { sections: ProfilePreviewSection[]; reveal: boolean }) {
  if (sections.length === 0) {
    return <div className="empty-state"><h2>还没有可预览的资料</h2><p>请先在“我的资料”中保存内容，再打开预览。</p></div>;
  }
  return <div className="profile-preview">{sections.map((section) => (
    <section className="preview-section" key={section.id}>
      <header><h2>{section.label}</h2><span>{section.items.length} 项</span></header>
      <div className="profile-grid">{section.items.map((item) => (
        <div className="profile-item" key={item.key}><span>{item.label}</span><strong>{reveal ? item.value : mask(item.value)}</strong></div>
      ))}</div>
    </section>
  ))}</div>;
}

export default function App() {
  const [session, setSession] = useState<PreviewSession>();
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<'fill' | 'profile'>('fill');
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState('');
  const [fillCompleted, setFillCompleted] = useState(false);
  const [failures, setFailures] = useState<Array<{ fieldId: string; reason: string }>>([]);
  const id = new URLSearchParams(location.search).get('id');

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    void browser.storage.session.get(previewStorageKey(id)).then((stored) => {
      const value = stored[previewStorageKey(id)] as PreviewSession | undefined;
      setSession(value);
      if (value?.kind === 'profile') setActive('profile');
      setLoading(false);
    });
  }, [id]);

  function updateDraft(fieldId: string, value: string) {
    setSession((current) => current?.kind === 'fill'
      ? updateFillPreviewSessionValue(current, fieldId, value)
      : current);
    setFillCompleted(false);
    setFailures([]);
  }

  async function persistEditedValue(fieldId: string, rawValue: string) {
    if (!id || session?.kind !== 'fill') return;
    const field = session.fields.find((candidate) => candidate.fieldId === fieldId);
    if (!field) return;

    try {
      const profile = await profileStore.load();
      const profileField = profile.fields[field.profileKey];
      const value = profileField ? parseFieldValue(profileField.type, rawValue) : rawValue;
      if (profileField?.type === 'number' && typeof value === 'number' && !Number.isFinite(value)) {
        setMessage('请输入有效数字，当前修改尚未保存。');
        return;
      }

      let profileSections = session.profileSections;
      if (profileField) {
        const updatedProfile = {
          ...profile,
          fields: { ...profile.fields, [field.profileKey]: { ...profileField, value } },
        };
        await profileStore.save(updatedProfile);
        profileSections = buildProfilePreviewSession(updatedProfile).sections;
      }
      const updatedSession = updateFillPreviewSessionValue(session, fieldId, value, profileSections);
      await browser.storage.session.set({ [previewStorageKey(id)]: updatedSession });
      setSession(updatedSession);
      setMessage(profileField ? '已同步更新本地个人资料。' : '已更新本次填写值。');
    } catch (error) {
      setMessage(`保存修改失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  const groups = useMemo(() => {
    if (session?.kind !== 'fill') return [];
    const grouped = new Map<string, typeof session.items>();
    for (const item of session.items) grouped.set(item.group, [...(grouped.get(item.group) ?? []), item]);
    return Array.from(grouped.entries());
  }, [session]);

  async function returnToTarget() {
    if (session?.kind !== 'fill' || !session.target) return;
    await browser.tabs.update(session.target.tabId, { active: true });
    if (session.target.windowId !== undefined) await browser.windows.update(session.target.windowId, { focused: true });
  }

  async function runFill(fields: ConfirmedFill[]) {
    if (session?.kind !== 'fill' || !session.target || fields.length === 0) return;
    setMessage('正在写入目标页面…');
    setFailures([]);
    const response = await browser.runtime.sendMessage({ type: 'fill-confirmed-fields', fields, target: session.target }) as RuntimeCommandResponse;
    if (!response.ok) { setMessage(`填写失败：${response.error.message}`); return; }
    const summary = response.data as { verified: string[]; skippedExisting: string[]; failed: Array<{ fieldId: string; reason: string }> };
    setFillCompleted(true);
    setFailures(summary.failed);
    if (summary.failed.length > 0) {
      setMessage(`${summary.verified.length} 项成功，${summary.failed.length} 项需要处理。`);
      return;
    }
    setMessage(`已写入招聘页：${summary.verified.length} 项成功${summary.skippedExisting.length ? `，${summary.skippedExisting.length} 项保留原值` : ''}。`);
    await returnToTarget();
  }

  async function locateFailure(fieldId: string) {
    if (session?.kind !== 'fill' || !session.target) return;
    await returnToTarget();
    const response = await browser.runtime.sendMessage({ type: 'focus-active-field', fieldId, target: session.target }) as RuntimeCommandResponse;
    if (!response.ok || !('focused' in response.data) || !response.data.focused) setMessage(response.ok ? '未找到页面字段，请重新扫描' : response.error.message);
  }

  function retryFailures() {
    if (session?.kind !== 'fill') return;
    const failedIds = new Set(failures.map((failure) => failure.fieldId));
    void runFill(session.fields.filter((field) => failedIds.has(field.fieldId)).map((field) => ({ ...field, overwrite: true })));
  }

  if (loading) return <main className="preview-shell"><div className="empty-state"><span className="spinner" />正在准备预览…</div></main>;
  if (!session) return <main className="preview-shell"><div className="empty-state"><h1>预览已失效</h1><p>该预览可能已过期，请回到侧边栏重新扫描并选择字段。</p></div></main>;

  const profileSections = session.kind === 'fill' ? session.profileSections : session.sections;
  return <main className="preview-shell">
    <header className="preview-header">
      <div className="brand"><span>简</span><div><h1>{session.kind === 'fill' ? '本次填写预览' : '个人资料预览'}</h1><p>{session.kind === 'fill' ? `${session.page.title || session.page.host} · ${session.page.host}` : '以可读形式检查最终资料效果'}</p></div></div>
      <div className="header-actions"><label><input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />显示完整值</label>{session.kind === 'fill' && <button className="secondary" onClick={() => void returnToTarget()}>返回招聘页</button>}</div>
    </header>

    {session.kind === 'fill' && <nav className="preview-tabs"><button className={active === 'fill' ? 'active' : ''} onClick={() => setActive('fill')}>本次填写</button><button className={active === 'profile' ? 'active' : ''} onClick={() => setActive('profile')}>个人资料</button></nav>}

    {active === 'profile' ? <ProfileView sections={profileSections} reveal={reveal} /> : session.kind === 'fill' && <>
      {session.items.length === 0 ? <div className="empty-state"><h2>当前没有可预览的字段</h2><p>请返回侧边栏，重新扫描页面并至少选择一个可填写字段。</p><button onClick={() => void returnToTarget()}>返回招聘页</button></div> : <div className="preview-layout">
        <aside><strong>填写摘要</strong><span>{session.items.length} 个字段</span><span>{new Set(session.items.map((item) => item.group)).size} 个分组</span><small>最终提交始终由你在招聘页面完成。</small></aside>
        <div className="preview-content">{groups.map(([group, items]) => <section className="preview-section" key={group}><header><h2>{group}</h2><span>{items.length} 项</span></header><div className="comparison-table"><div className="table-head"><span>页面字段</span><span>当前值</span><span>将填写值（可修改）</span><span>依据</span></div>{items.map((item) => <div className="comparison-row" key={item.fieldId}><strong>{item.label}</strong><span>{item.currentValue || '空'}</span><span><input className="edit-next-value" aria-label={`修改${item.label}的待填值`} type={reveal ? 'text' : 'password'} value={item.nextValue} onChange={(event) => updateDraft(item.fieldId, event.target.value)} onBlur={(event) => void persistEditedValue(item.fieldId, event.currentTarget.value)} /><small>失焦后同步到本地资料</small></span><span><b>{item.confidence === undefined ? '手动' : `${Math.round(item.confidence * 100)}%`}</b><small>{item.reasons.join('；') || item.source}</small></span></div>)}</div></section>)}</div>
      </div>}
    </>}

    {session.kind === 'fill' && failures.length > 0 && <section className="preview-failures">
      <header><h2>需要处理的字段</h2><span>{failures.length} 项</span></header>
      {failures.map((failure) => <div className="preview-failure-item" key={failure.fieldId}><span><strong>{session.items.find((item) => item.fieldId === failure.fieldId)?.label ?? '未知字段'}</strong><small>{failure.reason}</small></span><button className="secondary" onClick={() => void locateFailure(failure.fieldId)}>定位</button></div>)}
      <button className="primary retry-failures" onClick={retryFailures}>仅重试失败项</button>
    </section>}

    {session.kind === 'fill' && session.items.length > 0 && <footer className="action-bar"><div><strong>{fillCompleted ? failures.length ? '部分字段需要处理' : '已写入招聘页面' : `即将填写 ${session.items.length} 项`}</strong><span>{message || '不会自动提交申请；投递完成后请在侧边栏主动记录'}</span></div><button className="primary" onClick={() => void (fillCompleted ? returnToTarget() : runFill(session.fields))}>{fillCompleted ? '返回招聘页检查' : '确认填写'}</button></footer>}
  </main>;
}
