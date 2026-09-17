import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MappingManager } from '../../../entrypoints/options/MappingManager';
import { createMappingId, type MappingScope, type UserFieldMapping } from '../../../src/shared/mapping';
import type { Profile } from '../../../src/shared/profile';
import { MappingStore } from '../../../src/storage/mapping-store';
import type { StoragePort } from '../../../src/storage/storage-port';

class MemoryStorage implements StoragePort {
  readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
}

const profile: Profile = {
  schemaVersion: 1,
  fields: {
    'identity.name': { key: 'identity.name', label: '姓名', type: 'text', value: '测试用户', policy: 'auto' },
    'custom.notice': { key: 'custom.notice', label: '到岗周期', type: 'text', value: '两周', policy: 'review' },
    'educations.0.school': { key: 'educations.0.school', label: '学校 1', type: 'text', value: 'A', policy: 'auto' },
    'educations.1.school': { key: 'educations.1.school', label: '学校 2', type: 'text', value: 'B', policy: 'auto' },
  },
};

function mapping(fingerprint: string, profileKey: string, scope: MappingScope, sectionIndex?: number): UserFieldMapping {
  return { id: createMappingId(fingerprint, scope, sectionIndex), fingerprint, profileKey, scope, sectionIndex, createdAt: '2026-09-16T08:00:00.000Z' };
}

async function renderManager(items: UserFieldMapping[]) {
  const store = new MappingStore(new MemoryStorage());
  await store.replace(items);
  render(<MappingManager profile={profile} mappingStore={store} />);
  await screen.findByText(items[0].fingerprint);
  return store;
}

afterEach(() => cleanup());

describe('MappingManager', () => {
  it('filters mappings and marks targets missing from the profile', async () => {
    await renderManager([
      mapping('姓名输入框', 'identity.name', { kind: 'host', host: 'jobs.example.com' }),
      mapping('旧字段', 'custom.deleted', { kind: 'path', host: 'legacy.example.com', path: '/apply' }),
    ]);

    expect(screen.getByText('1 条失效')).toBeTruthy();
    expect(screen.getByText('资料字段已失效')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: 'legacy' } });
    expect(screen.queryByText('姓名输入框')).toBeNull();
    expect(screen.getByText('旧字段')).toBeTruthy();
  });

  it('relinks an orphaned mapping and changes its scope', async () => {
    const original = mapping('旧字段', 'custom.deleted', { kind: 'host', host: 'jobs.example.com' }, 1);
    const store = await renderManager([original]);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('本地资料字段'), { target: { value: 'custom.notice' } });
    fireEvent.change(screen.getByLabelText('生效范围'), { target: { value: 'global' } });
    fireEvent.click(screen.getByRole('button', { name: '保存映射' }));

    await screen.findByText('字段映射已更新。');
    const saved = await store.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ profileKey: 'custom.notice', scope: { kind: 'global' } });
    expect(saved[0].sectionIndex).toBeUndefined();
    expect(saved[0].id).not.toBe(original.id);
    expect(screen.queryByText('资料字段已失效')).toBeNull();
  });

  it('recomputes sectionIndex and identity when relinking between repeated records', async () => {
    const scope: MappingScope = { kind: 'host', host: 'jobs.example.com' };
    const original = mapping('学校字段', 'educations.0.school', scope, 0);
    const store = await renderManager([original]);
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('本地资料字段'), { target: { value: 'educations.1.school' } });
    fireEvent.click(screen.getByRole('button', { name: '保存映射' }));

    await screen.findByText('字段映射已更新。');
    expect(await store.list()).toEqual([{
      ...original,
      id: createMappingId(original.fingerprint, scope, 1),
      profileKey: 'educations.1.school',
      sectionIndex: 1,
    }]);
  });

  it('selects the filtered result and deletes it only after confirmation', async () => {
    const keep = mapping('姓名输入框', 'identity.name', { kind: 'host', host: 'jobs.example.com' });
    const remove = mapping('到岗周期', 'custom.notice', { kind: 'global' });
    const store = await renderManager([keep, remove]);
    fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '到岗周期' } });
    fireEvent.click(screen.getByLabelText('选择当前结果'));
    fireEvent.click(screen.getByRole('button', { name: '删除所选' }));

    const dialog = screen.getByRole('alertdialog', { name: '确认删除字段映射' });
    expect(within(dialog).getByText('确认删除 1 条字段映射？')).toBeTruthy();
    expect(await store.list()).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

    await waitFor(async () => expect(await store.list()).toEqual([keep]));
    expect(screen.getByText('已删除 1 条字段映射。')).toBeTruthy();
  });
});
