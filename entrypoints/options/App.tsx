import { useEffect, useMemo, useState } from 'react';
import { ProfileStore } from '../../src/profile/profile-store';
import type { Profile } from '../../src/shared/profile';
import { LocalStorage } from '../../src/storage/local-storage';
import { PROFILE_FIELDS, PROFILE_SECTION_LABELS, buildProfileField, emptyProfile, experienceDefinitions, profileFieldDefinitions, type ProfileSection, type RepeatableProfileSection } from '../../src/ui/profile-fields';
import { addExperience, deleteExperience, experienceRecordCount, moveExperience, stringifyFieldValue } from '../../src/ui/profile-management';
import { ProfileSectionCard } from './ProfileSectionCard';

const profileStore = new ProfileStore(new LocalStorage());
const SECTIONS = Object.keys(PROFILE_SECTION_LABELS) as ProfileSection[];
const REPEATABLE = new Set<ProfileSection>(['education', 'work', 'project']);

export default function App() {
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [counts, setCounts] = useState<Record<RepeatableProfileSection, number>>({ education: 1, work: 1, project: 1 });
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { void profileStore.load().then((loaded) => { setProfile(loaded); setCounts({ education: Math.max(1, experienceRecordCount(loaded, 'education')), work: Math.max(1, experienceRecordCount(loaded, 'work')), project: Math.max(1, experienceRecordCount(loaded, 'project')) }); }); }, []);
  const definitions = useMemo(() => [...PROFILE_FIELDS.filter((item) => !REPEATABLE.has(item.section)), ...(['education', 'work', 'project'] as const).flatMap((section) => Array.from({ length: counts[section] }, (_, index) => experienceDefinitions(section, index)).flat())], [counts]);
  const grouped = useMemo(() => Object.fromEntries(SECTIONS.map((section) => [section, definitions.filter((item) => item.section === section)])) as Record<ProfileSection, typeof definitions>, [definitions]);
  const values = useMemo(() => Object.fromEntries(Object.entries(profile.fields).map(([key, field]) => [key, stringifyFieldValue(field.value)])), [profile]);
  function change(key: string, value: string) { const definition = definitions.find((item) => item.key === key); if (!definition) return; setProfile((current) => { const fields = { ...current.fields }; if (value.trim()) fields[key] = { ...buildProfileField(definition, value), policy: fields[key]?.policy ?? definition.policy }; else delete fields[key]; return { ...current, fields }; }); setDirty(true); setMessage(''); }
  function mutate(section: RepeatableProfileSection, action: 'add' | 'copy' | 'up' | 'down' | 'delete', index = 0) {
    setProfile((current) => action === 'copy' ? addExperience(current, section, index) : action === 'delete' ? deleteExperience(current, section, index) : action === 'up' ? moveExperience(current, section, index, -1) : action === 'down' ? moveExperience(current, section, index, 1) : current);
    setCounts((current) => ({ ...current, [section]: action === 'add' || action === 'copy' ? current[section] + 1 : action === 'delete' ? Math.max(1, current[section] - 1) : current[section] })); setDirty(true); setMessage('');
  }
  async function save() { setSaving(true); setMessage(''); try { await profileStore.save(profile); setDirty(false); setMessage(`已保存 ${Object.keys(profile.fields).length} 个资料字段到本机`); } catch (error) { setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试'); } finally { setSaving(false); } }
  return <main className="options-page">
    <header className="options-header"><div className="brand-mark">简</div><div><h1>简历资料中心</h1><p>资料仅保存在当前浏览器，填写前仍由你确认</p></div></header>
    <section className="intro-card"><div><strong>完善资料，减少重复填写</strong><span>支持多段教育、工作和项目；页面需已存在对应段落。</span></div><span className="privacy-badge">本地存储</span></section>
    <section className="profile-form">{SECTIONS.map((section, index) => <ProfileSectionCard key={section} section={section} fields={grouped[section]} values={values} recordCount={REPEATABLE.has(section) ? counts[section as RepeatableProfileSection] : undefined} defaultOpen={index === 0} onChange={change} onRecordAction={(action, recordIndex) => mutate(section as RepeatableProfileSection, action, recordIndex)} />)}</section>
    <section className="profile-preview"><div><h2>资料预览</h2><p>预览包含尚未保存的修改与全部经历。</p></div>{SECTIONS.filter((section) => ['basic', 'education', 'work', 'project'].includes(section)).map((section) => { const rows = grouped[section].filter((field) => values[field.key]?.trim()); return <article key={section}><h3>{PROFILE_SECTION_LABELS[section]}</h3>{rows.length ? <dl>{rows.map((field) => <div key={field.key}><dt>{field.label}{field.key.match(/\.(\d+)\./) ? ` ${Number(field.key.match(/\.(\d+)\./)![1]) + 1}` : ''}</dt><dd>{values[field.key]}</dd></div>)}</dl> : <p>暂未填写</p>}</article>; })}</section>
    <section className="management-entry"><div><h2>页面边界</h2><p>扩展只匹配页面已存在的经历区块，不点击“新增经历”，也不会自动提交。</p></div><span>安全优先</span></section>
    <details className="developer-info"><summary>开发者信息 / 高级详情</summary><p>Canonical Key 供匹配引擎和调试使用。</p><ul>{profileFieldDefinitions(profile).filter((field) => values[field.key]?.trim()).map((field) => <li key={field.key}><strong>{field.label}</strong><code>{field.key}</code></li>)}</ul></details>
    <footer className="save-bar"><span role="status">{saving ? '正在保存…' : message || (dirty ? '有未保存修改' : '所有修改已保存')}</span><button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存资料'}</button></footer>
  </main>;
}
