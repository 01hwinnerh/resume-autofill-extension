import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomFieldsManager } from '../../../entrypoints/sidepanel/CustomFieldsManager';
import type { Profile, ProfileField } from '../../../src/shared/profile';

const profile: Profile = {
  schemaVersion: 1,
  fields: { 'custom.notice': { key: 'custom.notice', label: '补充说明', type: 'text', value: '一段较短的说明', policy: 'review' } },
};

describe('CustomFieldsManager', () => {
  it('shows mapping counts and creates a typed field with an automatic key', async () => {
    const onSave = vi.fn<(field: ProfileField, previousKey?: string) => Promise<void>>(async () => undefined);
    render(<CustomFieldsManager profile={profile} mappings={[{ id: 'm1', scope: { host: 'job.test' }, fingerprint: 'f1', profileKey: 'custom.notice', createdAt: '2026-09-15T00:00:00.000Z' }]} onSave={onSave} onDelete={vi.fn()} />);
    expect(screen.getByText(/1 个网站映射/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('字段名称'), { target: { value: '签证状态' } });
    fireEvent.change(screen.getByLabelText('默认值'), { target: { value: '需要支持' } });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ label: '签证状态', value: '需要支持', policy: 'review' });
    expect(onSave.mock.calls[0]?.[0].key).toMatch(/^custom\.field_/);
  });
});
