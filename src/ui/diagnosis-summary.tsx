import { useState } from 'react';
import type { FieldMatch, ScanResult } from '../shared/form';

interface DiagnosticSummary {
  version: 1;
  host: string;
  adapterId: string;
  totalFields: number;
  unknownFields: number;
  counts: {
    kind: Record<string, number>;
    semanticSource: Record<string, number>;
    status: Record<string, number>;
    confidence: Record<string, number>;
    section: Record<string, number>;
    frame: Record<string, number>;
  };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function confidenceBucket(field: FieldMatch): string {
  const score = field.selected?.score;
  if (score === undefined) return 'none';
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/** Builds a strict allow-list diagnostic object. Field and candidate values are never copied. */
export function buildDiagnosticSummary(result: ScanResult): DiagnosticSummary {
  const counts: DiagnosticSummary['counts'] = {
    kind: {}, semanticSource: {}, status: {}, confidence: {}, section: {}, frame: {},
  };
  for (const field of result.fields) {
    increment(counts.kind, field.descriptor.kind);
    increment(counts.semanticSource, field.descriptor.semanticSource || 'native-dom');
    increment(counts.status, field.status);
    increment(counts.confidence, confidenceBucket(field));
    increment(counts.section, field.descriptor.sectionLabel?.trim() || 'unsectioned');
    increment(counts.frame, field.descriptor.framePath.length ? `iframe-depth-${field.descriptor.framePath.length}` : 'main');
  }
  return {
    version: 1,
    host: result.page.host,
    adapterId: result.adapterId ?? 'generic',
    totalFields: result.fields.length,
    unknownFields: result.fields.filter((field) => !field.selected).length,
    counts,
  };
}

export function DiagnosisSummary({ result }: { result: ScanResult }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const summary = buildDiagnosticSummary(result);
  const recognized = summary.totalFields - summary.unknownFields;

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  return <details className="diagnosis-card card">
    <summary>
      <span><strong>兼容性诊断</strong><small>仅结构与计数，不含填写值</small></span>
      <b>{recognized}/{summary.totalFields}</b>
    </summary>
    <div className="diagnosis-content">
      <div className="diagnosis-metrics">
        <span><strong>{recognized}</strong><small>已识别</small></span>
        <span><strong>{summary.unknownFields}</strong><small>未知字段</small></span>
        <span><strong>{summary.counts.frame.main ?? 0}</strong><small>主页面字段</small></span>
        <span><strong>{summary.totalFields - (summary.counts.frame.main ?? 0)}</strong><small>iframe 字段</small></span>
      </div>
      <p>适配器：{summary.adapterId} · 语义来源：{Object.keys(summary.counts.semanticSource).length} 类</p>
      <button type="button" onClick={() => void copy()}>复制脱敏诊断</button>
      {copyState !== 'idle' && <span className={copyState === 'copied' ? 'copy-success' : 'copy-failed'} role="status">{copyState === 'copied' ? '已复制，可直接发给开发者排查' : '复制失败，请检查剪贴板权限'}</span>}
    </div>
  </details>;
}
