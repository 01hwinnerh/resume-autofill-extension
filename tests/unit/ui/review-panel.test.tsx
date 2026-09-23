import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from '../../../entrypoints/sidepanel/ReviewPanel';
import type { ScanResult } from '../../../src/shared/form';
import type { ConfirmedFill } from '../../../src/shared/messages';
import type { Profile } from '../../../src/shared/profile';

const result: ScanResult = {
  target: { tabId: 7, url: 'https://job.test/apply', title: '申请', scannedAt: '2026-09-15T10:00:00.000Z' }, page: { url: 'https://job.test/apply', host: 'job.test', title: '申请' },
  fields: [{ descriptor: { fieldId: 'field-1', kind: 'text', inputType: 'date', label: '可到岗日期', options: [], currentValue: '', framePath: [], fingerprint: 'f1' }, candidates: [], status: 'unrecognized' }],
};
function Harness({ scan = result, profile = { schemaVersion: 1, fields: {} }, onFill = vi.fn(), onPreview = vi.fn(async () => undefined), onSaveMapping = vi.fn(async () => undefined), targetActive = true }: { scan?: ScanResult; profile?: Profile; onFill?: (fields: ConfirmedFill[]) => void; onPreview?: (fields: ConfirmedFill[]) => Promise<void>; onSaveMapping?: ReturnType<typeof vi.fn>; targetActive?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <ReviewPanel result={scan} profile={profile} selected={selected} setSelected={setSelected} onFill={onFill} onPreview={onPreview} onSaveMapping={onSaveMapping} onLocate={vi.fn(async () => undefined)} onRescan={vi.fn(async () => undefined)} targetActive={targetActive} />;
}
afterEach(cleanup);

describe('ReviewPanel inline persistence', () => {
  it('saves an unrecognized labelled field as an idempotent custom key with global mapping', async () => {
    const onSaveMapping = vi.fn(async () => undefined); render(<Harness onSaveMapping={onSaveMapping} />);
    const input = screen.getByLabelText('可到岗日期本次填写值') as HTMLInputElement; expect(input.type).toBe('date'); fireEvent.change(input, { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: '保存到我的资料' }));
    await vi.waitFor(() => expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ scopeKind: 'global', createMapping: true, profileKey: expect.stringMatching(/^custom\.field_/) })));
    expect(screen.getByText(/自定义字段已保存/)).toBeTruthy();
  });
  it('creates a missing standard profile field without degrading it to a custom key', async () => {
    const onSaveMapping = vi.fn(async () => undefined); const scan: ScanResult = { ...result, fields: [{ ...result.fields[0]!, candidates: [{ profileKey: 'preference.availableDate', score: .9, source: 'generic', reasons: [] }], selected: { profileKey: 'preference.availableDate', score: .9, source: 'generic', reasons: [] }, status: 'missing_profile' }] };
    render(<Harness scan={scan} onSaveMapping={onSaveMapping} />); fireEvent.change(screen.getByLabelText('可到岗日期本次填写值'), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: '保存到我的资料' }));
    await vi.waitFor(() => expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ profileKey: 'preference.availableDate', createMapping: false, type: 'date' })));
  });
  it('requires a name when label and name are absent', async () => {
    const onSaveMapping = vi.fn(async () => undefined); const scan: ScanResult = { ...result, fields: [{ ...result.fields[0]!, descriptor: { ...result.fields[0]!.descriptor, label: '', name: undefined } }] };
    render(<Harness scan={scan} onSaveMapping={onSaveMapping} />); fireEvent.change(screen.getByLabelText('未命名字段本次填写值'), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: '保存到我的资料' }));
    expect(await screen.findByText(/请先填写字段名称/)).toBeTruthy(); expect(onSaveMapping).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('字段名称'), { target: { value: '到岗日期' } }); fireEvent.click(screen.getByRole('button', { name: '保存到我的资料' })); await vi.waitFor(() => expect(onSaveMapping).toHaveBeenCalled());
  });
  it('does not present free text for choice controls without reliable options', () => {
    const scan: ScanResult = { ...result, fields: [{ ...result.fields[0]!, descriptor: { ...result.fields[0]!.descriptor, kind: 'combobox', inputType: undefined, options: [] } }] };
    render(<Harness scan={scan} />); expect(screen.getByText(/未可靠读取到候选项/)).toBeTruthy(); expect(screen.queryByLabelText(/本次填写值/)).toBeNull();
  });
  it('keeps repeated sectionIndex when saving a global mapping', async () => {
    const onSaveMapping = vi.fn(async () => undefined); const scan: ScanResult = { ...result, fields: [{ ...result.fields[0]!, descriptor: { ...result.fields[0]!.descriptor, sectionIndex: 2 } }] };
    render(<Harness scan={scan} onSaveMapping={onSaveMapping} />); fireEvent.change(screen.getByLabelText('可到岗日期本次填写值'), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: '保存到我的资料' }));
    await vi.waitFor(() => expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ scopeKind: 'global' })));
  });
  it('shows warnings and disables target actions while another tab is active', () => {
    const scan = { ...result, repeatSectionWarnings: [{ category: 'education' as const, profileCount: 2, pageCount: 1, message: '教育经历资料有 2 段，页面只有 1 段，请手动新增后重新扫描。' }] };
    render(<Harness scan={scan} targetActive={false} />); expect(screen.getByRole('alert').textContent).toContain('页面只有 1 段'); fireEvent.change(screen.getByLabelText('可到岗日期本次填写值'), { target: { value: '2026-10-01' } }); expect((screen.getByRole('button', { name: /预览并确认 1 项/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('immediately sends a newly saved value to preview without rescanning', async () => {
    const onPreview = vi.fn(async () => undefined); render(<Harness onPreview={onPreview} />); fireEvent.change(screen.getByLabelText('可到岗日期本次填写值'), { target: { value: '2026-10-01' } }); fireEvent.click(screen.getByRole('button', { name: /预览并确认 1 项/ }));
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledWith([expect.objectContaining({ fieldId: 'field-1', value: '2026-10-01', profileKey: expect.stringMatching(/^custom\.field_/) })]));
  });
});
