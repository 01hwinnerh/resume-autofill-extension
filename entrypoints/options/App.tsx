import { useEffect, useState } from 'react';
import { LocalStorage } from '../../src/storage/local-storage';
import { ProfileStore } from '../../src/profile/profile-store';
import {
  P0_PROFILE_FIELDS,
  buildProfileField,
  emptyProfile,
  isCustomProfileKey,
} from '../../src/ui/profile-fields';

const profileStore = new ProfileStore(new LocalStorage());

export default function App() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void profileStore.load().then((profile) => {
      const loaded = Object.fromEntries(
        Object.entries(profile.fields).map(([key, field]) => [key, typeof field.value === 'string' ? field.value : '']),
      );
      setValues(loaded);
    });
  }, []);

  async function save() {
    if (customKey.trim() && !isCustomProfileKey(customKey)) {
      setMessage('自定义字段 key 必须以 custom. 开头');
      return;
    }
    const profile = emptyProfile();
    for (const definition of P0_PROFILE_FIELDS) {
      const value = values[definition.key]?.trim();
      if (value) profile.fields[definition.key] = buildProfileField(definition, value);
    }
    if (customKey.trim() && customLabel.trim() && customValue.trim()) {
      profile.fields[customKey.trim()] = {
        key: customKey.trim(),
        label: customLabel.trim(),
        type: 'text',
        value: customValue.trim(),
        policy: 'review',
      };
    }
    await profileStore.save(profile);
    setMessage('已保存到本机');
  }

  return (
    <main className="options-page">
      <h1>简历资料</h1>
      <p className="muted">资料仅保存于当前浏览器，不会自动提交申请。</p>
      <section className="profile-form">
        {P0_PROFILE_FIELDS.map((definition) => (
          <label key={definition.key}>
            <span>{definition.label}</span>
            <input
              value={values[definition.key] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [definition.key]: event.target.value }))}
            />
          </label>
        ))}
      </section>
      <section className="custom-field-form">
        <h2>自定义字段</h2>
        <input aria-label="字段 key" placeholder="custom.field" value={customKey} onChange={(event) => setCustomKey(event.target.value)} />
        <input aria-label="字段名称" placeholder="字段名称" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
        <input aria-label="字段值" placeholder="字段值" value={customValue} onChange={(event) => setCustomValue(event.target.value)} />
      </section>
      <button type="button" onClick={() => void save()}>保存资料</button>
      {message && <p role="status">{message}</p>}
    </main>
  );
}
