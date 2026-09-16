import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigMigrationCard } from '../../../entrypoints/options/ConfigMigrationCard';
import { createPortableConfig, stringifyPortableConfig } from '../../../src/config/portable-config';
import { ProfileStore } from '../../../src/profile/profile-store';
import type { UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

const importedProfile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '导入用户', policy: 'auto' },
    'custom.notice': { key: 'custom.notice', label: '到岗周期', type: 'text', value: '一周', policy: 'review' },
  },
};
const importedMappings: UserFieldMapping[] = [{ id: 'mapping-1', scope: { kind: 'global' }, fingerprint: 'text|到岗周期', profileKey: 'custom.notice', createdAt: '2026-09-16T08:00:00.000Z' }];

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

function renderCard(profile: Profile, onImported = vi.fn()) {
  const storage = new MemoryStorage();
  const profileStore = new ProfileStore(storage);
  const mappingStore = new MappingStore(storage);
  render(
    <ConfigMigrationCard
      profile={profile}
      profileStore={profileStore}
      mappingStore={mappingStore}
      onImported={onImported}
    />,
  );
  return { storage, onImported };
}

afterEach(() => cleanup());

describe('ConfigMigrationCard', () => {
  it('previews a valid export and replaces profile plus mappings only after confirmation', async () => {
    const onImported = vi.fn();
    const empty: Profile = { schemaVersion: 1, fields: {} };
    const { storage } = renderCard(empty, onImported);
    const json = stringifyPortableConfig(createPortableConfig(importedProfile, importedMappings, '2026-09-16T08:21:00.000Z'));
    const file = { name: 'resume-autofill-config.json', size: json.length, text: async () => json } as File;

    fireEvent.change(screen.getByRole('region', { name: '配置迁移' }).querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText('准备导入：resume-autofill-config.json')).toBeTruthy();
    expect(screen.getByText('导入会整体替换当前个人资料、自定义字段和字段映射。投递记录不受影响。')).toBeTruthy();
    expect(onImported).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认替换并导入' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(importedProfile));
    expect(storage.values.get('resume-autofill.profile.v1')).toEqual(importedProfile);
    expect(storage.values.get('resume-autofill.mappings.v1')).toEqual({ schemaVersion: 1, mappings: importedMappings });
    expect(screen.getByText(/导入成功：2 个资料字段、1 个自定义字段、1 条字段映射/)).toBeTruthy();
  });

  it('rejects an invalid file without showing the confirmation action', async () => {
    renderCard({ schemaVersion: 1, fields: {} });
    const file = { name: 'broken.json', size: 1, text: async () => '{' } as File;

    fireEvent.change(screen.getByRole('region', { name: '配置迁移' }).querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText('无法导入：文件不是有效的 JSON。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认替换并导入' })).toBeNull();
  });
});
