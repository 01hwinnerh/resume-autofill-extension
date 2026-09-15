import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { PreviewSession, ProfilePreviewSection } from '../../src/preview/preview-session';
import { previewStorageKey } from '../../src/preview/preview-session';
import { ApplicationStore } from '../../src/storage/application-store';
import { LocalStorage } from '../../src/storage/local-storage';
import type { RuntimeCommandResponse } from '../../src/shared/messages';

const applicationStore = new ApplicationStore(new LocalStorage());

function extensionUrl(path: string): string {
  return (browser.runtime as typeof browser.runtime & { getURL(value: string): string }).getURL(path);
}

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
  const [recorded, setRecorded] = useState(false);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const id = new URLSearchParams(location.search).get('id');

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    void browser.storage.session.get(previewStorageKey(id)).then((stored) => {
      const value = stored[previewStorageKey(id)] as PreviewSession | undefined;
      setSession(value);
      if (value?.kind === 'profile') setActive('profile');
      if (value?.kind === 'fill') {
        const host = new URL(value.page.url).hostname.replace(/^www\./, '').split('.')[0];
        setCompany(host || value.page.host);
        setRole(value.page.title || '待补充职位');
      }
      setLoading(false);
    });
  }, [id]);

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

  async function confirmFill() {
    if (session?.kind !== 'fill' || !session.target || session.fields.length === 0) return;
    setMessage('正在写入目标页面…');
    const response = await browser.runtime.sendMessage({ type: 'fill-confirmed-fields', fields: session.fields, target: session.target }) as RuntimeCommandResponse;
    if (!response.ok) { setMessage(`填写失败：${response.error.message}`); return; }
    const summary = response.data as { verified: string[]; skippedExisting: string[]; failed: unknown[] };
    setFillCompleted(true);
    setMessage(`填写完成：${summary.verified.length} 项已校验，${summary.skippedExisting.length} 项保留已有值，${summary.failed.length} 项失败。`);
  }

  async function recordApplication() {
    if (session?.kind !== 'fill') return;
    try {
      await applicationStore.create({ company, role, url: session.page.url, sourceHost: session.page.host });
      setRecorded(true);
      setMessage('投递记录已保存，初始阶段为“已投递”。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '记录失败，请重试');
    }
  }

  async function openApplications() {
    await browser.tabs.create({ url: extensionUrl('applications.html') });
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
        <div className="preview-content">{groups.map(([group, items]) => <section className="preview-section" key={group}><header><h2>{group}</h2><span>{items.length} 项</span></header><div className="comparison-table"><div className="table-head"><span>页面字段</span><span>当前值</span><span>将填写值</span><span>依据</span></div>{items.map((item) => <div className="comparison-row" key={item.fieldId}><strong>{item.label}</strong><span>{item.currentValue || '空'}</span><span>{reveal ? item.nextValue : mask(item.nextValue)}</span><span><b>{item.confidence === undefined ? '手动' : `${Math.round(item.confidence * 100)}%`}</b><small>{item.reasons.join('；') || item.source}</small></span></div>)}</div></section>)}</div>
      </div>}
    </>}

    {session.kind === 'fill' && fillCompleted && <section className="record-after-submit">
      <div><h2>完成真实提交后，再记录本次申请</h2><p>填写完成不等于投递成功。请先回招聘页面检查并手动提交，再回来点击记录。</p></div>
      {!recorded && <div className="record-fields"><label>公司<input value={company} onChange={(event) => setCompany(event.target.value)} /></label><label>职位<input value={role} onChange={(event) => setRole(event.target.value)} /></label></div>}
      <div className="record-actions">{!recorded && <button className="primary" disabled={!company.trim() || !role.trim()} onClick={() => void recordApplication()}>已完成投递，记录本次申请</button>}<button className="secondary" onClick={() => void openApplications()}>查看投递记录</button></div>
    </section>}

    {session.kind === 'fill' && session.items.length > 0 && <footer className="action-bar"><div><strong>{fillCompleted ? '已填写，等待你手动提交' : `即将填写 ${session.items.length} 项`}</strong><span>{message || '不会自动提交申请'}</span></div><button className="primary" disabled={fillCompleted} onClick={() => void confirmFill()}>{fillCompleted ? '已完成填写' : '确认填写'}</button></footer>}
  </main>;
}
