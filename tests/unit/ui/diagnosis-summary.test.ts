import { describe, expect, it } from 'vitest';
import { buildDiagnosticSummary } from '../../../src/ui/diagnosis-summary';
import type { ScanResult } from '../../../src/shared/form';

describe('compatibility diagnostic summary', () => {
  it('reports only allow-listed structure and counts without field or candidate values', () => {
    const sensitivePageValue = 'alice@example.com';
    const sensitiveProfileKey = 'contact.email';
    const result: ScanResult = {
      page: { url: 'https://job.test/apply', host: 'job.test', title: '申请' },
      adapterId: 'generic-ats',
      fields: [
        {
          descriptor: {
            fieldId: 'field-1', kind: 'text', label: '邮箱', options: [], currentValue: sensitivePageValue,
            semanticSource: 'native-dom', sectionLabel: '基本信息', framePath: [], fingerprint: 'f1',
          },
          candidates: [{ profileKey: sensitiveProfileKey, score: 0.92, source: 'generic', reasons: ['email'] }],
          selected: { profileKey: sensitiveProfileKey, score: 0.92, source: 'generic', reasons: ['email'] },
          status: 'matched',
        },
        {
          descriptor: {
            fieldId: 'field-2', kind: 'textarea', label: '补充说明', options: [], currentValue: '',
            framePath: [0], fingerprint: 'f2',
          },
          candidates: [], status: 'unsupported',
        },
      ],
    };

    const summary = buildDiagnosticSummary(result);
    expect(summary).toMatchObject({
      host: 'job.test', adapterId: 'generic-ats', totalFields: 2, unknownFields: 1,
      counts: {
        kind: { text: 1, textarea: 1 },
        status: { matched: 1, unsupported: 1 },
        confidence: { high: 1, none: 1 },
        frame: { main: 1, 'iframe-depth-1': 1 },
      },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(sensitivePageValue);
    expect(serialized).not.toContain(sensitiveProfileKey);
    expect(serialized).not.toContain('邮箱');
  });
});
