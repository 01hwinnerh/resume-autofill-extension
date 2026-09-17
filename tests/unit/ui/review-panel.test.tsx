import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from '../../../entrypoints/sidepanel/ReviewPanel';
import type { ConfirmedFill } from '../../../src/shared/messages';
import type { ScanResult } from '../../../src/shared/form';

const result: ScanResult = {
  target: { tabId: 7, url: 'https://job.test/apply', title: '申请', scannedAt: '2026-09-15T10:00:00.000Z' },
  page: { url: 'https://job.test/apply', host: 'job.test', title: '申请' },
  fields: [{
    descriptor: { fieldId: 'field-1', kind: 'text', inputType: 'date', label: '可到岗日期', options: [], currentValue: '', framePath: [], fingerprint: 'f1' },
    candidates: [], status: 'unsupported',
  }],
};

function Harness({ onFill, onPreview }: { onFill: (fields: ConfirmedFill[]) => void; onPreview: (fields: ConfirmedFill[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <ReviewPanel result={result} profile={{ schemaVersion: 1, fields: {} }} selected={selected} setSelected={setSelected} onFill={onFill} onPreview={onPreview} onSaveMapping={vi.fn(async () => undefined)} onLocate={vi.fn(async () => undefined)} onRescan={vi.fn(async () => undefined)} />;
}

afterEach(cleanup);

describe('ReviewPanel', () => {
  it('defaults a scanned custom field mapping to all websites', async () => {
    const onSaveMapping = vi.fn(async () => undefined);
    function MappingHarness() { const [selected, setSelected] = useState<string[]>([]); return <ReviewPanel result={result} profile={{ schemaVersion: 1, fields: {} }} selected={selected} setSelected={setSelected} onFill={vi.fn()} onPreview={vi.fn(async () => undefined)} onSaveMapping={onSaveMapping} onLocate={vi.fn(async () => undefined)} onRescan={vi.fn(async () => undefined)} />; }
    render(<MappingHarness />);
    fireEvent.change(screen.getByLabelText('可到岗日期本次填写值'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByLabelText('保存为自定义字段'));
    expect((screen.getByLabelText('映射作用域') as HTMLSelectElement).value).toBe('global');
    fireEvent.click(screen.getByRole('button', { name: '立即保存字段与映射' }));
    await vi.waitFor(() => expect(onSaveMapping).toHaveBeenCalledWith(expect.objectContaining({ scopeKind: 'global' })));
  });

  it('shows a manual-add warning when repeated page slots are insufficient', () => {
    const warningResult: ScanResult = {
      ...result,
      repeatSectionWarnings: [{ category: 'education', profileCount: 2, pageCount: 1, message: '教育经历资料有 2 段，页面只有 1 段，请手动新增后重新扫描。' }],
    };
    function WarningHarness() { const [selected, setSelected] = useState<string[]>([]); return <ReviewPanel result={warningResult} profile={{ schemaVersion: 1, fields: {} }} selected={selected} setSelected={setSelected} onFill={vi.fn()} onPreview={vi.fn(async () => undefined)} onSaveMapping={vi.fn(async () => undefined)} onLocate={vi.fn(async () => undefined)} onRescan={vi.fn(async () => undefined)} />; }

    render(<WarningHarness />);
    expect(screen.getByRole('alert').textContent).toContain('页面只有 1 段，请手动新增后重新扫描');
  });

  it('sends an unmatched safe field to the full-screen preview', async () => {
    const onFill = vi.fn();
    const onPreview = vi.fn(async () => undefined);
    render(<Harness onFill={onFill} onPreview={onPreview} />);
    const input = screen.getByLabelText('可到岗日期本次填写值') as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: /预览并确认 1 项/ }));
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledWith([
      { fieldId: 'field-1', profileKey: 'custom.session.field-1', value: '2026-10-01' },
    ]));
    expect(onFill).not.toHaveBeenCalled();
  });
});
