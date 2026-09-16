import { stringifyPortableConfig, type PortableConfigV1 } from '../config/portable-config';

export function portableConfigFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `resume-autofill-config-${stamp}.json`;
}

export function downloadPortableConfig(config: PortableConfigV1, documentRef: Document = document): void {
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

export async function readPortableConfigFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('配置文件不能超过 5 MB。');
  return file.text();
}
