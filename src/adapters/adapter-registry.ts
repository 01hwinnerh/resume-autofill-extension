import type { PageContext, SiteAdapter } from './adapter-types';

export class AdapterRegistry {
  private readonly adapters: SiteAdapter[] = [];

  register(adapter: SiteAdapter): void {
    this.adapters.push(adapter);
  }

  resolve(context: PageContext): SiteAdapter | undefined {
    return this.adapters.find((adapter) => adapter.matches(context));
  }
}
