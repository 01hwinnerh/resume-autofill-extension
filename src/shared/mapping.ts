export type MappingScope =
  | { kind: 'global' }
  | { kind: 'host'; host: string }
  | { kind: 'path'; host: string; path: string };

/** Persisted by releases before explicit scope kinds were introduced. */
export interface LegacyMappingScope {
  host: string;
  path?: string;
  kind?: undefined;
}

export interface UserFieldMapping {
  id: string;
  scope: MappingScope | LegacyMappingScope;
  fingerprint: string;
  profileKey: string;
  createdAt: string;
}

export interface NormalizedUserFieldMapping extends Omit<UserFieldMapping, 'scope'> {
  scope: MappingScope;
}

export function normalizeMappingScope(scope: MappingScope | LegacyMappingScope): MappingScope {
  if ('kind' in scope && scope.kind === 'global') return { kind: 'global' };
  if ('kind' in scope && scope.kind === 'path') return { kind: 'path', host: scope.host, path: scope.path };
  if ('kind' in scope && scope.kind === 'host') return { kind: 'host', host: scope.host };
  return scope.path
    ? { kind: 'path', host: scope.host, path: scope.path }
    : { kind: 'host', host: scope.host };
}

export function mappingScopeTarget(scope: MappingScope | LegacyMappingScope): string {
  const normalized = normalizeMappingScope(scope);
  if (normalized.kind === 'global') return '所有网站';
  if (normalized.kind === 'host') return normalized.host;
  return `${normalized.host}${normalized.path}`;
}

export function createMappingId(fingerprint: string, profileKey: string, scope: MappingScope | LegacyMappingScope): string {
  const normalized = normalizeMappingScope(scope);
  const target = normalized.kind === 'global' ? '*' : normalized.kind === 'host' ? normalized.host : `${normalized.host}${normalized.path}`;
  return `${normalized.kind}:${encodeURIComponent(target)}:${encodeURIComponent(fingerprint)}:${encodeURIComponent(profileKey)}`;
}
