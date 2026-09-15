import { useState } from 'react';
import type { ScanResult } from '../../src/shared/form';
import type { FillPolicy, Profile } from '../../src/shared/profile';
import { isCustomProfileKey } from '../../src/ui/profile-fields';

export function MappingPanel({ result, profile, onSave }: {
  result: ScanResult;
  profile: Profile;
  onSave: (input: { fieldId: string; profileKey: string; customValue: string; policy: FillPolicy }) => Promise<void>;
}) {
  const [fieldId, setFieldId] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [policy, setPolicy] = useState<FillPolicy>('review');
  const [message, setMessage] = useState('');

  async function save() {
    const targetKey = customKey.trim() || profileKey;
    if (!fieldId || !targetKey) { setMessage('请选择页面字段和资料字段'); return; }
    if (customKey.trim() && !isCustomProfileKey(customKey)) { setMessage('自定义 key 必须以 custom. 开头'); return; }
    await onSave({ fieldId, profileKey: targetKey, customValue, policy });
    setMessage('映射已保存，下次扫描生效');
  }

  return (
    <details className="mapping-panel card">
      <summary><span>高级：保存字段映射</span><small>绑定当前平台</small></summary>
      <div className="mapping-fields">
        <p className="muted">用于平台特殊字段。本次扫描不重新匹配。</p>
        <select aria-label="待映射字段" value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
          <option value="">选择页面字段</option>
          {result.fields.map((match) => <option key={match.descriptor.fieldId} value={match.descriptor.fieldId}>{match.descriptor.label || match.descriptor.fieldId}</option>)}
        </select>
        <select aria-label="已有资料字段" value={profileKey} onChange={(event) => setProfileKey(event.target.value)}>
          <option value="">选择已有资料字段</option>
          {Object.values(profile.fields).map((field) => <option key={field.key} value={field.key}>{field.label}（{field.key}）</option>)}
        </select>
        <input aria-label="自定义字段 key" placeholder="或填写 custom.field" value={customKey} onChange={(event) => setCustomKey(event.target.value)} />
        {customKey.trim() && <>
          <input aria-label="自定义字段值" placeholder="自定义字段默认值" value={customValue} onChange={(event) => setCustomValue(event.target.value)} />
          <select aria-label="自定义字段策略" value={policy} onChange={(event) => setPolicy(event.target.value as FillPolicy)}>
            <option value="auto">允许自动填写</option><option value="review">填写前确认</option><option value="never">永不填写</option>
          </select>
        </>}
        <button type="button" onClick={() => void save()}>保存映射</button>
        {message && <p role="status">{message}</p>}
      </div>
    </details>
  );
}
