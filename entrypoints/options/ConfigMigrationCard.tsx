import { useRef, useState } from 'react';
import { createPortableConfig, importPortableConfig, parsePortableConfig, summarizePortableConfig, type PortableConfigV1 } from '../../src/config/portable-config';
import type { ProfileStore } from '../../src/profile/profile-store';
import type { Profile } from '../../src/shared/profile';
import type { MappingStore } from '../../src/storage/mapping-store';
import { downloadPortableConfig, readPortableConfigFile } from '../../src/ui/portable-config-file';

export function ConfigMigrationCard({ profile, profileStore, mappingStore, onImported }: {
  profile: Profile;
  profileStore: ProfileStore;
  mappingStore: MappingStore;
  onImported: (profile: Profile) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PortableConfigV1>();
  const [filename, setFilename] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const summary = pending ? summarizePortableConfig(pending) : undefined;

  async function exportConfig() {
    setBusy(true);
    setMessage('');
    try {
      const mappings = await mappingStore.list();
      const config = createPortableConfig(profile, mappings);
      const summary = summarizePortableConfig(config);
      downloadPortableConfig(config);
      setMessage(`已导出 ${summary.profileFieldCount} 个资料字段、${summary.educationCount + summary.workCount + summary.projectCount} 段经历和 ${summary.mappingCount} 条字段映射。`);
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file?: File) {
    setPending(undefined);
    setMessage('');
    if (!file) return;
    try {
      const config = parsePortableConfig(await readPortableConfigFile(file));
      setFilename(file.name);
      setPending(config);
    } catch (error) {
      setFilename('');
      setMessage(`无法导入：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    setMessage('');
    try {
      await importPortableConfig(pending, profileStore, mappingStore);
      const importedSummary = summarizePortableConfig(pending);
      onImported(pending.profile);
      setPending(undefined);
      setFilename('');
      setMessage(`导入成功：${importedSummary.profileFieldCount} 个资料字段、${importedSummary.customFieldCount} 个自定义字段、${importedSummary.mappingCount} 条字段映射。`);
    } catch (error) {
      setMessage(`导入失败，原配置已保留：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setBusy(false);
    }
  }

  return <section className="migration-card" aria-label="配置迁移">
    <div><span className="eyebrow">换电脑快速恢复</span><h2>配置迁移</h2><p>导出个人资料、自定义字段、填写策略和网站映射；不包含投递记录或临时扫描数据。</p></div>
    <div className="migration-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void exportConfig()}>导出配置 JSON</button>
      <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>导入配置 JSON</button>
      <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} />
    </div>
    {message && <p className="migration-message" role="status">{message}</p>}
    {pending && summary && <div className="import-summary" role="alertdialog" aria-label="确认导入配置">
      <div><strong>准备导入：{filename}</strong><p>导入会整体替换当前个人资料、自定义字段和字段映射。投递记录不受影响。</p></div>
      <dl>
        <div><dt>资料字段</dt><dd>{summary.profileFieldCount}</dd></div>
        <div><dt>自定义字段</dt><dd>{summary.customFieldCount}</dd></div>
        <div><dt>教育 / 工作 / 项目</dt><dd>{summary.educationCount} / {summary.workCount} / {summary.projectCount}</dd></div>
        <div><dt>字段映射</dt><dd>{summary.mappingCount}</dd></div>
      </dl>
      <div className="import-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setPending(undefined)}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void confirmImport()}>{busy ? '正在导入…' : '确认替换并导入'}</button></div>
    </div>}
  </section>;
}
