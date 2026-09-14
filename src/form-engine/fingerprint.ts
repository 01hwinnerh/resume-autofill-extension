import type { PageFieldKind } from '../shared/form';

import { normalizeLabel } from './normalize-label';

export interface FingerprintInput {
  kind: PageFieldKind;
  label: string;
  name?: string;
  htmlId?: string;
  sectionLabel?: string;
  framePath: number[];
}

export function createFingerprint({
  kind,
  label,
  name,
  htmlId,
  sectionLabel,
  framePath,
}: FingerprintInput): string {
  return [
    kind,
    normalizeLabel(label),
    name ?? htmlId ?? '',
    normalizeLabel(sectionLabel),
    framePath.join('.'),
  ].join('|');
}
