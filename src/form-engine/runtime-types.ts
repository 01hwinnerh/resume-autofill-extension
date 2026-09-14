import type { PageFieldDescriptor } from '../shared/form';

export interface RuntimePageField extends PageFieldDescriptor {
  elements: HTMLElement[];
}

export interface ScanContext {
  url: string;
  host: string;
  title: string;
  framePath: number[];
}
