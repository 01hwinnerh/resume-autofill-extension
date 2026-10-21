import { describe, expect, it } from 'vitest';
import { selectApplicationAfterStorageChange } from '../../../entrypoints/applications/App';
import type { ApplicationRecord } from '../../../src/shared/application-record';

function record(id: string, company: string): ApplicationRecord {
  const occurredAt = '2026-09-23T08:00:00.000Z';
  return {
    id,
    company,
    role: '工程师',
    url: 'https://jobs.example/apply',
    sourceHost: 'jobs.example',
    appliedAt: occurredAt,
    updatedAt: occurredAt,
    currentStage: 'applied',
    currentStageLabel: '已投递',
    events: [{ id: `event-${id}`, stage: 'applied', label: '已投递', occurredAt }],
  };
}

describe('applications storage subscription selection', () => {
  it('selects a newly observed record while preserving query-id selection', () => {
    const oldRecord = record('old', '旧公司');
    const newRecord = record('new', '新公司');
    expect(selectApplicationAfterStorageChange([oldRecord], [newRecord, oldRecord], 'old')).toBe('new');
    expect(selectApplicationAfterStorageChange([], [newRecord, oldRecord], '', 'old')).toBe('old');
  });
});
