import type { RuntimePageField } from '../form-engine/runtime-types';

export interface PageContext {
  url: string;
  host: string;
  title: string;
}

export interface AdapterHint {
  fieldId: string;
  profileKey: string;
  score: number;
  reason: string;
}

export interface SiteAdapter {
  readonly id: string;
  matches(context: PageContext): boolean;
  discoverHints(fields: RuntimePageField[]): AdapterHint[];
}
