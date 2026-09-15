import { useMemo, useReducer, useState } from 'react';
import { browser } from 'wxt/browser';
import { LocalStorage } from '../../src/storage/local-storage';
import { ProfileStore } from '../../src/profile/profile-store';
import { MappingStore } from '../../src/storage/mapping-store';
import type { FillSummary } from '../../src/runtime/application-controller';
import type { RuntimeCommandResponse } from '../../src/shared/messages';
import type { FillPolicy, Profile } from '../../src/shared/profile';
import { emptyProfile } from '../../src/ui/profile-fields';
import { reducePanel } from '../../src/ui/panel-state';
import { FieldMatchView } from '../../src/ui/field-match-view';
import { StatusSummary } from '../../src/ui/status-summary';

const profileStore = new ProfileStore(new LocalStorage());
const mappingStore = new MappingStore(new LocalStorage());

export default function App() {
  const [state, dispatch] = useReducer(reducePanel, { kind: 'idle' });
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [mappingFieldId, setMappingFieldId] = useState('');
  const [mappingProfileKey, setMappingProfileKey] = useState('');
  const [mappingCustomKey, setMappingCustomKey] = useState('');
  const [mappingCustomValue, setMappingCustomValue] = useState('');
  const [mappingPolicy, setMappingPolicy] = useState<FillPolicy>('review');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function scan() {
    setError('');
    setSelected([]);
    dispatch({ type: 'scan_requested' });
    try {
      const loadedProfile = await profileStore.load();
      setProfile(loadedProfile);
      const response = await browser.runtime.sendMessage({ type: 'scan-active-tab' }) as RuntimeCommandResponse;
      if (!response.ok || !('page' in response.data)) throw new Error(response.ok ? '扫描结果格式错误' : response.error.message);
      dispatch({ type: 'scan_succeeded', result: response.data });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '扫描失败';
      setError(message);
      dispatch({ type: 'scan_failed', message });
    }
  }

  async function saveMapping() {
    if (state.kind !== 'review') return;
    const field = state.result.fields.find((match) => match.descriptor.fieldId === mappingFieldId);
    const profileKey = mappingCustomKey.trim() || mappingProfileKey;
    if (!field || !profileKey) {
      setError('请选择待映射字段和目标资料字段');
      return;
    }

    let nextProfile = profile;
    if (mappingCustomKey.trim()) {
      nextProfile = {
        ...profile,
        fields: {
          ...profile.fields,
          [profileKey]: {
            key: profileKey,
            label: field.descriptor.label || profileKey,
            type: 'text',
            value: mappingCustomValue,
            policy: mappingPolicy,
          },
        },
      };
      await profileStore.save(nextProfile);
      setProfile(nextProfile);
    }

    const pageUrl = new URL(state.result.page.url);
    await mappingStore.upsert({
      id: `${state.result.page.host}:${field.descriptor.fingerprint}:${profileKey}`,
      scope: { host: state.result.page.host, path: pageUrl.pathname },
      fingerprint: field.descriptor.fingerprint,
      profileKey,
      createdAt: new Date().toISOString(),
    });
    setError('映射已保存，下次扫描生效；本次扫描不会自动填写');
  }

  async function fill() {
    if (state.kind !== 'review' || selected.length === 0) return;
    dispatch({ type: 'fill_requested', fieldIds: selected });
    try {
      const profile = await profileStore.load();
      const fields = state.result.fields
        .filter((match) => selectedSet.has(match.descriptor.fieldId) && match.selected)
        .flatMap((match) => {
          const value = profile.fields[match.selected!.profileKey]?.value;
          return value === undefined || value === null
            ? []
            : [{ fieldId: match.descriptor.fieldId, profileKey: match.selected!.profileKey, value }];
        });
      const response = await browser.runtime.sendMessage({ type: 'fill-confirmed-fields', fields }) as RuntimeCommandResponse;
      if (!response.ok || !('filled' in response.data)) throw new Error(response.ok ? '填写结果格式错误' : response.error.message);
      dispatch({ type: 'fill_succeeded', summary: response.data as FillSummary });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '填写失败';
      setError(message);
      dispatch({ type: 'scan_failed', message });
    }
  }

  return (
    <main className="sidepanel-page">
      <header>
        <h1>简历填写助手</h1>
        <p className="muted">扫描、确认、填写；最终提交由你完成。</p>
      </header>
      <button type="button" onClick={() => void scan()} disabled={state.kind === 'scanning'}>扫描当前页面</button>
      {state.kind === 'idle' && state.error && <p role="alert">{state.error}</p>}
      {error && <p role="alert">{error}</p>}
      {state.kind === 'review' && (
        <>
          <StatusSummary fields={state.result.fields} />
          <section className="field-list">
            {state.result.fields.map((match) => (
              <FieldMatchView
                key={match.descriptor.fieldId}
                match={match}
                selected={selectedSet.has(match.descriptor.fieldId)}
                disabled={match.status === 'unsupported' || match.status === 'skipped_existing'}
                onToggle={(fieldId, checked) => setSelected((current) => checked
                  ? [...new Set([...current, fieldId])]
                  : current.filter((id) => id !== fieldId))}
              />
            ))}
          </section>
          <section className="mapping-panel">
            <h2>保存字段映射</h2>
            <p className="muted">映射绑定当前平台，下次扫描生效。</p>
            <select aria-label="待映射字段" value={mappingFieldId} onChange={(event) => setMappingFieldId(event.target.value)}>
              <option value="">选择待映射字段</option>
              {state.result.fields
                .filter((match) => match.status === 'needs_confirmation' || match.status === 'unsupported')
                .map((match) => <option key={match.descriptor.fieldId} value={match.descriptor.fieldId}>{match.descriptor.label || match.descriptor.fieldId}</option>)}
            </select>
            <select aria-label="已有资料字段" value={mappingProfileKey} onChange={(event) => setMappingProfileKey(event.target.value)}>
              <option value="">选择已有资料字段</option>
              {Object.values(profile.fields).map((field) => <option key={field.key} value={field.key}>{field.label}（{field.key}）</option>)}
            </select>
            <input aria-label="自定义字段 key" placeholder="或填写 custom.field" value={mappingCustomKey} onChange={(event) => setMappingCustomKey(event.target.value)} />
            {mappingCustomKey.trim() && (
              <>
                <input aria-label="自定义字段值" placeholder="自定义字段默认值" value={mappingCustomValue} onChange={(event) => setMappingCustomValue(event.target.value)} />
                <select aria-label="自定义字段策略" value={mappingPolicy} onChange={(event) => setMappingPolicy(event.target.value as FillPolicy)}>
                  <option value="auto">允许自动填写</option>
                  <option value="review">填写前确认</option>
                  <option value="never">永不自动填写</option>
                </select>
              </>
            )}
            <button type="button" onClick={() => void saveMapping()}>保存映射</button>
          </section>
          <button type="button" onClick={() => void fill()} disabled={selected.length === 0}>填写已确认字段</button>
        </>
      )}
      {state.kind === 'filling' && <p role="status">正在填写 {state.selectedFieldIds.length} 个字段…</p>}
      {state.kind === 'result' && (
        <section className="result-panel" role="status">
          <p>已填写 {state.summary.filled.length} 项，已校验 {state.summary.verified.length} 项。</p>
          <p>已跳过 {state.summary.skippedExisting.length} 项，失败 {state.summary.failed.length} 项。</p>
        </section>
      )}
    </main>
  );
}
