import { describe, expect, it } from 'vitest';

import { AdapterRegistry } from '../../../src/adapters/adapter-registry';
import type { PageContext, SiteAdapter } from '../../../src/adapters/adapter-types';
import { GenericAdapter } from '../../../src/adapters/generic-adapter';

function pageContext(url: string): PageContext {
  const parsed = new URL(url);
  return { url, host: parsed.host, title: 'Fixture' };
}

function adapter(overrides: Partial<SiteAdapter>): SiteAdapter {
  return {
    id: 'fixture',
    matches: () => false,
    discoverHints: () => [],
    ...overrides,
  };
}

describe('AdapterRegistry', () => {
  it('resolves the first matching adapter in registration order', () => {
    const registry = new AdapterRegistry();
    const first = adapter({ id: 'first', matches: () => true });
    const second = adapter({ id: 'second', matches: () => true });

    registry.register(first);
    registry.register(second);

    expect(registry.resolve(pageContext('https://fixture.test'))?.id).toBe('first');
  });

  it('returns undefined when no platform adapter matches', () => {
    const registry = new AdapterRegistry();
    registry.register(adapter({ matches: () => false }));

    expect(registry.resolve(pageContext('https://fixture.test'))).toBeUndefined();
  });
});

describe('GenericAdapter', () => {
  it('provides the generic fallback identity without platform hints', () => {
    const adapter = new GenericAdapter();

    expect(adapter.id).toBe('generic');
    expect(adapter.discoverHints([])).toEqual([]);
  });
});
