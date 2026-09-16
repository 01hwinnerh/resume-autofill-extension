import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FillResultPanel } from '../../../entrypoints/sidepanel/FillResultPanel';
import type { ScanResult } from '../../../src/shared/form';

const result: ScanResult = {
  page: { url: 'https://job.test/apply', host: 'job.test', title: '职位申请' },
  fields: [{
    descriptor: { fieldId: 'company', kind: 'text', label: '公司名称', options: [], currentValue: '', framePath: [], fingerprint: 'f1' },
    candidates: [{ profileKey: 'workExperiences.0.company', score: 0.9, source: 'generic', reasons: [] }],
    selected: { profileKey: 'workExperiences.0.company', score: 0.9, source: 'generic', reasons: [] },
    status: 'matched',
  }],
};

afterEach(cleanup);

describe('FillResultPanel', () => {
  it('shows failure details and retries only failed fields with explicit overwrite', () => {
    const onRetry = vi.fn();
    const onLocate = vi.fn();
    render(<FillResultPanel
      result={result}
      fields={[
        { fieldId: 'company', profileKey: 'workExperiences.0.company', value: '示例公司' },
        { fieldId: 'role', profileKey: 'workExperiences.0.role', value: '工程师' },
      ]}
      summary={{ filled: ['role'], verified: ['role'], skippedExisting: [], failed: [{ fieldId: 'company', reason: 'verification failed' }] }}
      onRetry={onRetry}
      onLocate={onLocate}
      onRescan={vi.fn()}
    />);

    expect(screen.getByText('公司名称')).toBeTruthy();
    expect(screen.getByText('verification failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '定位' }));
    expect(onLocate).toHaveBeenCalledWith('company');
    fireEvent.click(screen.getByRole('button', { name: '仅重试失败项' }));
    expect(onRetry).toHaveBeenCalledWith([{ fieldId: 'company', profileKey: 'workExperiences.0.company', value: '示例公司', overwrite: true }]);
  });
});
