import { useRef, useState } from 'react';
import { createPortableConfig, importPortableConfig, parsePortableConfig, summarizePortableConfig, type PortableConfig } from '../../src/config/portable-config';
import type { ProfileStore } from '../../src/profile/profile-store';
import { normalizeMappingScope } from '../../src/shared/mapping';
import type { Profile } from '../../src/shared/profile';
import type { ApplicationStore } from '../../src/storage/application-store';
import type { MappingStore } from '../../src/storage/mapping-store';
import { orphanedMappings } from '../../src/ui/mapping-management';
import { downloadPortableConfig, readPortableConfigFile } from '../../src/ui/portable-config-file';

export function ConfigMigrationCard({ profile, profileStore, mappingStore, applicationStore, onImported }: {
  profile: Profile;
  profileStore: ProfileStore;
  mappingStore: MappingStore;
  applicationStore: ApplicationStore;
  onImported: (profile: Profile) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PortableConfig>();
  const [filename, setFilename] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentCounts, setCurrentCounts] = useState({ profile: 0, mappings: 0, applications: 0, events: 0 });
  const summary = pending ? summarizePortableConfig(pending) : undefined;

  async function exportConfig() {
    setBusy(true); setMessage('');
    try {
      const [mappings, applications] = await Promise.all([mappingStore.list(), applicationStore.list()]);
      const config = createPortableConfig(profile, mappings, applications);
      const exported = summarizePortableConfig(config);
      downloadPortableConfig(config);
      setMessage(`完整备份已导出：${exported.profileFieldCount} 个资料字段、${exported.mappingCount} 条字段映射、${exported.applicationCount} 条投递记录（${exported.applicationEventCount} 个节点）。`);
    } catch (error) { setMessage(`导出失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setBusy(false); }
  }

  async function selectFile(file?: File) {
    setPending(undefined); setMessage('');
    if (!file) return;
    try {
      const config = parsePortableConfig(await readPortableConfigFile(file));
      const [currentProfile, currentMappings, currentApplications] = await Promise.all([profileStore.load(), mappingStore.list(), applicationStore.list()]);
      setCurrentCounts({ profile: Object.keys(currentProfile.fields).length, mappings: currentMappings.length, applications: currentApplications.length, events: currentApplications.reduce((count, record) => count + record.events.length, 0) });
      setFilename(file.name); setPending(config);
    }
    catch (error) { setFilename(''); setMessage(`无法导入：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true); setMessage('');
    try {
      await importPortableConfig(pending, profileStore, mappingStore, applicationStore);
      const imported = summarizePortableConfig(pending);
      const orphanedCount = orphanedMappings(pending.mappings.map((mapping) => ({ ...mapping, scope: normalizeMappingScope(mapping.scope) })), pending.profile).length;
      onImported(pending.profile); setPending(undefined); setFilename('');
      setMessage(`导入成功：已替换 ${imported.profileFieldCount} 个资料字段和 ${imported.mappingCount} 条映射；${imported.preservesApplications ? '这是 V1 备份，现有投递记录已保留。' : `已完全替换为 ${imported.applicationCount} 条投递记录（${imported.applicationEventCount} 个节点）。`}${orphanedCount ? `其中 ${orphanedCount} 条映射已失效，请在字段映射管理中处理。` : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败；请检查本地数据是否完整回滚。'); }
    finally { setBusy(false); }
  }

  return <section className="migration-card" aria-label="完整备份与恢复">
    <div><span className="eyebrow">换电脑快速恢复</span><h2>完整备份与恢复</h2><p>导出个人资料、自定义字段、填写策略、网站映射和完整投递时间线。文件为普通 JSON，请妥善保管。</p></div>
    <div className="migration-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void exportConfig()}>导出完整备份 JSON</button>
      <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>导入备份 JSON</button>
      <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} />
    </div>
    {message && <p className="migration-message" role="status">{message}</p>}
    {pending && summary && <div className="import-summary" role="alertdialog" aria-label="确认导入备份">
      <div><strong>准备导入：{filename}</strong><p>{summary.preservesApplications ? 'V1 旧备份将整体替换个人资料和字段映射，但保留当前全部投递记录。' : 'V2 完整备份将整体替换当前个人资料、字段映射和全部投递记录。'} 导入前已读取三类当前数据用于失败回滚。</p></div>
      <dl>
        <div><dt>资料字段</dt><dd>{currentCounts.profile} → {summary.profileFieldCount}</dd></div><div><dt>自定义字段（导入后）</dt><dd>{summary.customFieldCount}</dd></div>
        <div><dt>教育 / 工作 / 项目（导入后）</dt><dd>{summary.educationCount} / {summary.workCount} / {summary.projectCount}</dd></div>
        <div><dt>字段映射</dt><dd>{currentCounts.mappings} → {summary.mappingCount}</dd></div><div><dt>投递记录</dt><dd>{summary.preservesApplications ? `${currentCounts.applications}（保留）` : `${currentCounts.applications} → ${summary.applicationCount}`}</dd></div><div><dt>时间线节点</dt><dd>{summary.preservesApplications ? `${currentCounts.events}（保留）` : `${currentCounts.events} → ${summary.applicationEventCount}`}</dd></div>
      </dl>
      <div className="import-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setPending(undefined)}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void confirmImport()}>{busy ? '正在导入…' : '确认替换并导入'}</button></div>
    </div>}
  </section>;
}
