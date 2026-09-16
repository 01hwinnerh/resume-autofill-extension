import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRecordPrompt } from '../../../entrypoints/sidepanel/ApplicationRecordPrompt';

afterEach(cleanup);

describe('ApplicationRecordPrompt', () => {
  it('keeps the confirmation form concise', () => {
    render(<ApplicationRecordPrompt
      draft={{ company: '示例公司', role: '工程师', url: 'https://job.test/apply', sourceHost: 'job.test' }}
      onRecord={vi.fn()}
      onOpenManager={vi.fn()}
    />);

    expect(screen.getByRole('heading', { name: '确认投递信息' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '已完成投递，记录本次申请' })).toBeTruthy();
    expect(screen.queryByText(/扩展不会自动判断/)).toBeNull();
    expect(screen.queryByText('手动确认')).toBeNull();
  });
});
