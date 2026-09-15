import { useEffect, useMemo, useState } from 'react';
import { ProfileStore } from '../../src/profile/profile-store';
import type { Profile } from '../../src/shared/profile';
import { LocalStorage } from '../../src/storage/local-storage';
import { PROFILE_FIELDS, PROFILE_SECTION_LABELS, buildProfileField, emptyProfile, type ProfileSection } from '../../src/ui/profile-fields';
import { ProfileSectionCard } from './ProfileSectionCard';

const profileStore = new ProfileStore(new LocalStorage());
const SECTIONS = Object.keys(PROFILE_SECTION_LABELS) as ProfileSection[];

export default function App() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadedProfile, setLoadedProfile] = useState<Profile>(emptyProfile());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const grouped = useMemo(() => Object.fromEntries(SECTIONS.map((section) => [section, PROFILE_FIELDS.filter((item) => item.section === section)])) as Record<ProfileSection, typeof PROFILE_FIELDS>, []);

  useEffect(() => { void profileStore.load().then((profile) => {
    setLoadedProfile(profile);
    setValues(Object.fromEntries(Object.entries(profile.fields).map(([key, field]) => [key, field.value === null ? '' : Array.isArray(field.value) ? field.value.join(', ') : String(field.value)])));
  }); }, []);

  function change(key: string, value: string) { setValues((current) => ({ ...current, [key]: value })); setDirty(true); setMessage(''); }

  async function save() {
    setSaving(true); setMessage('');
    try {
      const profile = emptyProfile();
      for (const definition of PROFILE_FIELDS) { const value = values[definition.key]?.trim(); if (value) profile.fields[definition.key] = buildProfileField(definition, value); }
      for (const [key, existing] of Object.entries(loadedProfile.fields)) if (key.startsWith('custom.')) profile.fields[key] = existing;
      await profileStore.save(profile); setLoadedProfile(profile); setDirty(false); setMessage(`已保存 ${Object.keys(profile.fields).length} 个资料字段到本机`);
    } catch (error) { setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试'); }
    finally { setSaving(false); }
  }

  return <main className="options-page">
    <header className="options-header"><div className="brand-mark">简</div><div><h1>简历资料中心</h1><p>资料仅保存在当前浏览器，填写前仍由你确认</p></div></header>
    <section className="intro-card"><div><strong>完善资料，减少重复填写</strong><span>中文申请优先使用完整姓名；敏感字段不会被静默提交。</span></div><span className="privacy-badge">本地存储</span></section>
    <section className="profile-form">{SECTIONS.map((section, index) => <ProfileSectionCard key={section} section={section} fields={grouped[section]} values={values} defaultOpen={index === 0} onChange={change} />)}</section>
    <section className="profile-preview"><div><h2>资料预览</h2><p>预览包含尚未保存的修改。</p></div>{SECTIONS.filter((section) => ['basic', 'education', 'work', 'project'].includes(section)).map((section) => { const rows = grouped[section].filter((field) => values[field.key]?.trim()); return <article key={section}><h3>{PROFILE_SECTION_LABELS[section]}</h3>{rows.length ? <dl>{rows.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{values[field.key]}</dd></div>)}</dl> : <p>暂未填写</p>}</article>; })}</section>
    <section className="management-entry"><div><h2>自定义字段</h2><p>请在扩展侧边栏的“自定义字段”中统一新建、编辑、删除并查看网站映射数量。</p></div><span>侧边栏管理</span></section>
    <details className="developer-info"><summary>开发者信息 / 高级详情</summary><p>Canonical Key 供匹配引擎和调试使用。</p><ul>{PROFILE_FIELDS.filter((field) => values[field.key]?.trim()).map((field) => <li key={field.key}><strong>{field.label}</strong><code>{field.key}</code></li>)}</ul></details>
    <footer className="save-bar"><span role="status">{saving ? '正在保存…' : message || (dirty ? '有未保存修改' : '所有修改已保存')}</span><button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存资料'}</button></footer>
  </main>;
}
