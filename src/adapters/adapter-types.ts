import type { PageFieldDescriptor } from '../shared/form';

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
  discoverHints(fields: PageFieldDescriptor[]): AdapterHint[];
}
