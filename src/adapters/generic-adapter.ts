import type { RuntimePageField } from '../form-engine/runtime-types';
import type { AdapterHint, PageContext, SiteAdapter } from './adapter-types';

export class GenericAdapter implements SiteAdapter {
  readonly id = 'generic';

  matches(_context: PageContext): boolean {
    return true;
  }

  discoverHints(_fields: RuntimePageField[]): AdapterHint[] {
    return [];
  }
}
