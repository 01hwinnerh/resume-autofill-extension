import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigMigrationCard } from '../../../entrypoints/options/ConfigMigrationCard';
import { createPortableConfig, stringifyPortableConfig, type PortableConfigV1 } from '../../../src/config/portable-config';
import { ProfileStore } from '../../../src/profile/profile-store';
import { createMappingId, type UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { ApplicationStore } from '../../../src/storage/application-store';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

const importedProfile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '导入用户', policy: 'auto' },
    'custom.notice': { key: 'custom.notice', label: '到岗周期', type: 'text', value: '一周', policy: 'review' },
  },
};
const importedMappings: UserFieldMapping[] = [{ id: createMappingId('text|到岗周期', { kind: 'global' }), scope: { kind: 'global' }, fingerprint: 'text|到岗周期', profileKey: 'custom.notice', createdAt: '2026-09-16T08:00:00.000Z' }];

class MemoryStorage implements StoragePort {
  values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function renderCard(profile: Profile, onImported = vi.fn(), initialValues: Record<string, unknown> = {}) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(initialValues)) storage.values.set(key, value);
  const profileStore = new ProfileStore(storage);
  const mappingStore = new MappingStore(storage);
  const applicationStore = new ApplicationStore(storage);
  render(
    <ConfigMigrationCard
      profile={profile}
      profileStore={profileStore}
      mappingStore={mappingStore}
      applicationStore={applicationStore}
      onImported={onImported}
    />,
  );
  return { storage, onImported };
}

afterEach(() => cleanup());

describe('ConfigMigrationCard', () => {
  it('previews replacement impact and imports all V2 categories only after confirmation', async () => {
    const onImported = vi.fn();
    const empty: Profile = { schemaVersion: 1, fields: {} };
    const { storage } = renderCard(empty, onImported);
    const json = stringifyPortableConfig(createPortableConfig(importedProfile, importedMappings, '2026-09-16T08:21:00.000Z'));
    const file = { name: 'resume-autofill-config.json', size: json.length, text: async () => json } as File;

    fireEvent.change(screen.getByRole('region', { name: '完整备份与恢复' }).querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText('准备导入：resume-autofill-config.json')).toBeTruthy();
    expect(screen.getByText(/V2 完整备份将整体替换当前个人资料、字段映射和全部投递记录/)).toBeTruthy();
    expect(onImported).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认替换并导入' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(importedProfile));
    expect(storage.values.get('resume-autofill.profile.v1')).toEqual({ schemaVersion: 1, revision: 1, profile: importedProfile });
    expect(storage.values.get('resume-autofill.mappings.v1')).toEqual({ schemaVersion: 1, revision: 1, mappings: importedMappings });
    expect(screen.getByText(/导入成功：已替换 2 个资料字段和 1 条映射/)).toBeTruthy();
  });

  it('reports orphaned mappings after a successful import', async () => {
    const orphanedMappings: UserFieldMapping[] = [{ ...importedMappings[0], id: 'orphaned', profileKey: 'custom.deleted' }];
    renderCard({ schemaVersion: 1, fields: {} });
    const json = stringifyPortableConfig(createPortableConfig(importedProfile, orphanedMappings, '2026-09-16T08:21:00.000Z'));
    const file = { name: 'with-orphan.json', size: json.length, text: async () => json } as File;

    fireEvent.change(screen.getByRole('region', { name: '完整备份与恢复' }).querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByText('准备导入：with-orphan.json');
    fireEvent.click(screen.getByRole('button', { name: '确认替换并导入' }));

    expect(await screen.findByText(/其中 1 条映射已失效，请在字段映射管理中处理/)).toBeTruthy();
  });

  it('shows the damaged source, disables normal import, and offers raw storage export', async () => {
    renderCard({ schemaVersion: 1, fields: {} }, vi.fn(), {
      'resume-autofill.mappings.v1': { schemaVersion: 1, revision: 4, mappings: [null] },
    });
    expect(await screen.findByText('检测到本地数据损坏或来自未来版本')).toBeTruthy();
    expect(screen.getAllByText(/resume-autofill\.mappings\.v1/).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: '导入备份 JSON' }) as HTMLButtonElement).disabled).toBe(true);
    const safeExport = screen.getByRole('button', { name: '导出安全备份 JSON' }) as HTMLButtonElement;
    expect(safeExport.disabled).toBe(false);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:safe-backup'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(safeExport);
    expect(await screen.findByText(/已改为导出不丢字段的原始 storage 安全备份/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '下载原始 storage JSON' })).toBeTruthy();
  });

  it('requires second confirmation to keep current data, clears the journal, and records audit', async () => {
    const current = { schemaVersion: 1, revision: 2, profile: { schemaVersion: 1, fields: {} } };
    const previous = { schemaVersion: 1, revision: 1, profile: { schemaVersion: 1, fields: {} } };
    const target = { ...current };
    const { storage } = renderCard({ schemaVersion: 1, fields: {} }, vi.fn(), {
      'resume-autofill.profile.v1': current,
      'resume-autofill.transaction.v1': {
        schemaVersion: 1, transactionId: 'tx-ui', kind: 'profile-mapping-update', phase: 'recovery-required', createdAt: '2026-09-23T05:00:00.000Z',
        previous: { 'resume-autofill.profile.v1': { exists: true, value: previous } },
        targets: [{ key: 'resume-autofill.profile.v1', expectedRevision: 1, value: target }], appliedKeys: ['resume-autofill.profile.v1'], recoveredKeys: [], recoveryError: 'manual',
      },
    });
    expect(await screen.findByText('检测到需要人工处理的恢复日志')).toBeTruthy();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    expect((screen.getByRole('button', { name: '保留当前数据并放弃事务日志' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '下载 journal 与原始快照 JSON' }));
    fireEvent.click(screen.getByRole('button', { name: '保留当前数据并放弃事务日志' }));
    expect(screen.getByRole('alertdialog', { name: '二次确认恢复处理' })).toBeTruthy();
    expect(storage.values.has('resume-autofill.transaction.v1')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '确认执行恢复处理' }));
    await waitFor(() => expect(storage.values.has('resume-autofill.transaction.v1')).toBe(false));
    expect(storage.values.get('resume-autofill.transaction-audit.v1')).toEqual([expect.objectContaining({ transactionId: 'tx-ui', status: 'kept-current' })]);
  });

  it('warns that V1 keeps applications that may belong to another profile', async () => {
    renderCard({ schemaVersion: 1, fields: {} });
    const config: PortableConfigV1 = { format: 'resume-autofill-config', schemaVersion: 1, exportedAt: '2026-09-23T05:00:00.000Z', profile: importedProfile, mappings: importedMappings };
    const json = stringifyPortableConfig(config); const file = { name: 'v1.json', size: json.length, text: async () => json } as File;
    fireEvent.change(screen.getByRole('region', { name: '完整备份与恢复' }).querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText(/现有投递记录会保留，但可能属于不同资料，请确认后继续/)).toBeTruthy();
  });

  it('rejects an invalid file without showing the confirmation action', async () => {
    renderCard({ schemaVersion: 1, fields: {} });
    const file = { name: 'broken.json', size: 1, text: async () => '{' } as File;

    fireEvent.change(screen.getByRole('region', { name: '完整备份与恢复' }).querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText('无法导入：文件不是有效的 JSON。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认替换并导入' })).toBeNull();
  });
});
