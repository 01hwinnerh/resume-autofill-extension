export interface MappingScope {
  host: string;
  path?: string;
}

export interface UserFieldMapping {
  id: string;
  scope: MappingScope;
  fingerprint: string;
  profileKey: string;
  createdAt: string;
}
