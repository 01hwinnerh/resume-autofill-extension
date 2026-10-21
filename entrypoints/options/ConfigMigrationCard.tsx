import { useEffect, useRef, useState } from 'react';
import { createPortableConfig, importPortableConfig, parsePortableConfig, summarizePortableConfig, type PortableConfig } from '../../src/config/portable-config';
import type { ProfileStore } from '../../src/profile/profile-store';
import { normalizeMappingScope } from '../../src/shared/mapping';
import type { Profile } from '../../src/shared/profile';
import type { ApplicationStore } from '../../src/storage/application-store';
import type { MappingStore } from '../../src/storage/mapping-store';
import type { StorageRecoveryState, TransactionResolution } from '../../src/storage/coordinated-transaction';
import type { StorageInspection } from '../../src/storage/storage-codec';
import { orphanedMappings } from '../../src/ui/mapping-management';
import { downloadPortableConfig, downloadRawStorageBackup, readPortableConfigFile } from '../../src/ui/portable-config-file';

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
  const [inspections, setInspections] = useState<StorageInspection[]>([]);
  const [recoveryState, setRecoveryState] = useState<StorageRecoveryState>();
  const [recoveryChoice, setRecoveryChoice] = useState<TransactionResolution>();
  const [recoveryExported, setRecoveryExported] = useState(false);
  const [currentCounts, setCurrentCounts] = useState({ profile: 0, mappings: 0, applications: 0, events: 0 });
  const summary = pending ? summarizePortableConfig(pending) : undefined;
  const damaged = inspections.filter((item) => item.state === 'corrupt' || item.state === 'future');
  const blocked = damaged.length > 0 || recoveryState !== undefined;

  async function refreshSafetyState() {
    const [profileInspection, mappingInspection, applicationInspection, recovery] = await Promise.all([profileStore.inspect(), mappingStore.inspect(), applicationStore.inspect(), profileStore.recoveryState()]);
    setInspections([profileInspection, mappingInspection, applicationInspection]); setRecoveryState(recovery);
  }

  useEffect(() => {
    void refreshSafetyState().catch((error) => setMessage(`无法检查本地数据：${error instanceof Error ? error.message : '未知错误'}`));
  }, [profileStore, mappingStore, applicationStore]);

  async function exportConfig() {
    setBusy(true); setMessage('');
    try {
      if (damaged.length > 0) {
        exportRecoveryData();
        setMessage(`检测到 ${damaged.length} 组异常数据，已改为导出不丢字段的原始 storage 安全备份。修复前请勿删除该文件。`);
        return;
      }
      const [mappings, applications] = await Promise.all([mappingStore.list(), applicationStore.list()]);
      const config = createPortableConfig(profile, mappings, applications);
      const exported = summarizePortableConfig(config);
      downloadPortableConfig(config);
      setMessage(`完整备份已导出：${exported.profileFieldCount} 个资料字段、${exported.mappingCount} 条字段映射、${exported.applicationCount} 条投递记录（${exported.applicationEventCount} 个节点）。`);
    } catch (error) {
      exportRecoveryData();
      setMessage(`标准备份无法读取全部数据，已自动导出原始 storage 安全备份：${error instanceof Error ? error.message : '未知错误'}`);
    }
    finally { setBusy(false); }
  }

  async function selectFile(file?: File) {
    setPending(undefined); setMessage('');
    if (!file) return;
    if (blocked) { setMessage('本地数据损坏、版本过新或存在未完成恢复，普通导入已禁用。请先下载原始 storage JSON 并完成人工恢复。'); return; }
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

  function exportRecoveryData() {
    downloadRawStorageBackup([...damaged, ...(recoveryState ? [{ key: 'resume-autofill.transaction.v1', state: recoveryState.canRestore ? recoveryState.journal.phase : 'corrupt', raw: recoveryState }] : [])]);
    if (recoveryState) setRecoveryExported(true);
  }

  async function confirmRecoveryResolution() {
    if (!recoveryState || !recoveryChoice) return;
    setBusy(true); setMessage('');
    try {
      const result = await profileStore.resolveTransaction({ transactionId: recoveryState.canRestore ? recoveryState.journal.transactionId : 'unknown', action: recoveryChoice, expected: recoveryState.current, expectedJournal: recoveryState.rawJournal });
      setMessage(result.message ?? (result.ok ? '恢复事务已处理。' : '恢复事务处理失败。'));
      setRecoveryChoice(undefined);
      await refreshSafetyState();
    } catch (error) { setMessage(`恢复处理失败：${error instanceof Error ? error.message : '未知错误'}`); }
    finally { setBusy(false); }
  }

  return <section className="migration-card" aria-label="完整备份与恢复">
    <div><span className="eyebrow">换电脑快速恢复</span><h2>完整备份与恢复</h2><p>导出个人资料、自定义字段、填写策略、网站映射和完整投递时间线。文件为普通 JSON，请妥善保管。</p></div>
    <div className="migration-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => void exportConfig()}>{damaged.length > 0 ? '导出安全备份 JSON' : '导出完整备份 JSON'}</button>
      <button type="button" disabled={busy || blocked} onClick={() => fileInput.current?.click()}>导入备份 JSON</button>
      <input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void selectFile(event.target.files?.[0])} />
    </div>
    {blocked && <div className="import-summary" role="alert">
      <strong>{recoveryState ? '检测到需要人工处理的恢复日志' : '检测到本地数据损坏或来自未来版本'}</strong>
      <p>普通导入和保存覆盖已暂停，不会自动删除数据。你仍可点击“{damaged.length > 0 ? '导出安全备份 JSON' : '导出完整备份 JSON'}”；异常时会自动保留原始 storage，避免无法导出。</p>
      <ul>{damaged.map((item) => <li key={item.key}><code>{item.key}</code>：{item.state === 'future' ? `未来 schema ${String(item.schemaVersion)}` : '数据损坏'}。{item.message}</li>)}{recoveryState && <li><code>resume-autofill.transaction.v1</code>：{recoveryState.canRestore ? `事务 ${recoveryState.journal.transactionId}，阶段 ${recoveryState.journal.phase}，已恢复 ${recoveryState.journal.recoveredKeys.length} 个集合。` : '日志格式损坏，只能导出后选择保留当前数据。'}</li>}</ul>
      <button type="button" className="secondary" onClick={exportRecoveryData}>下载{recoveryState ? ' journal 与原始快照' : '原始 storage'} JSON</button>
      {recoveryState && <><p>{recoveryExported ? '恢复材料已导出，现在可以选择处理方式。' : '请先下载恢复材料，随后才能选择处理方式。'}</p><div className="import-actions"><button type="button" disabled={busy || !recoveryExported} onClick={() => setRecoveryChoice('keep-current')}>保留当前数据并放弃事务日志</button>{recoveryState.canRestore && <button type="button" className="danger" disabled={busy || !recoveryExported} onClick={() => setRecoveryChoice('restore-previous')}>按事务旧快照恢复</button>}</div></>}
    </div>}
    {recoveryState && recoveryChoice && <div className="import-summary" role="alertdialog" aria-label="二次确认恢复处理">
      <strong>请二次确认</strong>
      <p>{recoveryChoice === 'keep-current' ? '将保留现在三个集合中的数据，清除阻塞事务，并写入“保留当前数据”的审计记录。' : '将按 journal 中的旧快照恢复事务涉及的集合；若确认后 revision 或内容发生变化，将立即停止且不会覆盖并发数据。'}</p>
      <div className="import-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setRecoveryChoice(undefined)}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void confirmRecoveryResolution()}>{busy ? '正在处理…' : '确认执行恢复处理'}</button></div>
    </div>}
    {message && <p className="migration-message" role="status">{message}</p>}
    {pending && summary && <div className="import-summary" role="alertdialog" aria-label="确认导入备份">
      <div><strong>准备导入：{filename}</strong><p>{summary.preservesApplications ? 'V1 旧备份会替换个人资料和字段映射；现有投递记录会保留，但可能属于不同资料，请确认后继续。' : 'V2 完整备份将整体替换当前个人资料、字段映射和全部投递记录。'} 后台将使用带 revision 条件的恢复日志原子协调写入。</p></div>
      <dl>
        <div><dt>资料字段</dt><dd>{currentCounts.profile} → {summary.profileFieldCount}</dd></div><div><dt>自定义字段（导入后）</dt><dd>{summary.customFieldCount}</dd></div>
        <div><dt>教育 / 工作 / 项目（导入后）</dt><dd>{summary.educationCount} / {summary.workCount} / {summary.projectCount}</dd></div>
        <div><dt>字段映射</dt><dd>{currentCounts.mappings} → {summary.mappingCount}</dd></div><div><dt>投递记录</dt><dd>{summary.preservesApplications ? `${currentCounts.applications}（保留）` : `${currentCounts.applications} → ${summary.applicationCount}`}</dd></div><div><dt>时间线节点</dt><dd>{summary.preservesApplications ? `${currentCounts.events}（保留）` : `${currentCounts.events} → ${summary.applicationEventCount}`}</dd></div>
      </dl>
      <div className="import-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setPending(undefined)}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void confirmImport()}>{busy ? '正在导入…' : '确认替换并导入'}</button></div>
    </div>}
  </section>;
}
