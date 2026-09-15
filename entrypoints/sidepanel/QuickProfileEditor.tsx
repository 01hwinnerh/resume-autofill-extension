import { useEffect, useState } from 'react';
import type { Profile } from '../../src/shared/profile';
import { PROFILE_FIELDS, buildProfileField } from '../../src/ui/profile-fields';
import { ProfileValueInput } from '../../src/ui/ProfileValueInput';
import { QUICK_PROFILE_GROUPS, experienceRecordCount, stringifyFieldValue } from '../../src/ui/profile-management';

export function QuickProfileEditor({ profile, onSave, onOpenFull }: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
  onOpenFull: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setValues(Object.fromEntries(Object.entries(profile.fields).map(([key, field]) => [key, stringifyFieldValue(field.value)])));
    setDirty(false);
  }, [profile]);

  async function save() {
    setSaving(true); setMessage('');
    try {
      const next: Profile = { ...profile, fields: { ...profile.fields } };
      for (const group of QUICK_PROFILE_GROUPS) for (const key of group.keys) {
        const definition = PROFILE_FIELDS.find((item) => item.key === key);
        if (!definition) continue;
        const value = values[key]?.trim() ?? '';
        if (value) next.fields[key] = buildProfileField(definition, value);
        else delete next.fields[key];
      }
      await onSave(next);
      setDirty(false); setMessage('资料已保存到本机');
    } catch (error) {
      setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试');
    } finally { setSaving(false); }
  }

  return (
    <section className="panel-stack" aria-label="我的资料">
      <div className="section-intro"><h2>我的资料</h2><p>常用资料可直接编辑；姓名以中文完整姓名为主。</p></div>
      {QUICK_PROFILE_GROUPS.map((group, index) => (
        <details className="card profile-group" key={group.id} open={index < 2}>
          <summary>{group.label}<small>{group.keys.filter((key) => values[key]?.trim()).length}/{group.keys.length}</small></summary>
          <div className="profile-fields">{group.keys.map((key) => {
            const definition = PROFILE_FIELDS.find((item) => item.key === key);
            if (!definition) return null;
            return <label key={key}><span>{definition.label}</span><ProfileValueInput type={definition.type} value={values[key] ?? ''} label={definition.label} onChange={(value) => { setValues((current) => ({ ...current, [key]: value })); setDirty(true); setMessage(''); }} /></label>;
          })}</div>
        </details>
      ))}
      <div className="experience-summary card" aria-label="多段经历摘要">
        {(['education', 'work', 'project'] as const).map((section) => { const count = experienceRecordCount(profile, section); const prefix = section === 'education' ? 'educations' : section === 'work' ? 'workExperiences' : 'projects'; const title = section === 'education' ? '教育' : section === 'work' ? '工作' : '项目'; const summaryKey = section === 'education' ? 'school' : section === 'work' ? 'company' : 'name'; return <div key={section}><strong>{title}经历</strong><span>{count} 条{count ? ` · ${stringifyFieldValue(profile.fields[`${prefix}.0.${summaryKey}`]?.value) || '首条待完善'}` : ''}</span></div>; })}
        <button className="secondary-button" type="button" onClick={onOpenFull}>管理全部经历</button>
      </div>
      <button className="secondary-button" type="button" onClick={onOpenFull}>打开完整资料中心</button>
      <div className="inline-save"><span role="status">{saving ? '正在保存…' : message || (dirty ? '有未保存修改' : '所有修改已保存')}</span><button type="button" disabled={!dirty || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存资料'}</button></div>
    </section>
  );
}
