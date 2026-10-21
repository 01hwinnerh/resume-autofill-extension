import { stringifyPortableConfig, type PortableConfig } from '../config/portable-config';

export function portableConfigFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `resume-autofill-full-backup-${stamp}.json`;
}

export function downloadPortableConfig(config: PortableConfig, documentRef: Document = document): void {
  const blob = new Blob([stringifyPortableConfig(config)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = portableConfigFilename(new Date(config.exportedAt));
  link.hidden = true;
  documentRef.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadRawStorageBackup(entries: Array<{ key: string; state: string; raw?: unknown }>, documentRef: Document = document): void {
  const exportedAt = new Date().toISOString();
  const blob = new Blob([`${JSON.stringify({ format: 'resume-autofill-raw-storage-recovery', schemaVersion: 1, exportedAt, entries }, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = `resume-autofill-raw-recovery-${exportedAt.slice(0, 10)}.json`;
  link.hidden = true;
  documentRef.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readPortableConfigFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('配置文件不能超过 5 MB。');
  return file.text();
}
