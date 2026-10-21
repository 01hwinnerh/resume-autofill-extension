export interface FrameIdentityInput {
  url: string;
  top: boolean;
  name?: string;
  ancestorOrigins?: string[];
}

/**
 * Builds a navigation-stable semantic frame identity. Query/hash and document title are
 * intentionally excluded: SPA state changes are guarded by the scan target/fingerprint.
 */
export function createFrameIdentity(input: FrameIdentityInput): string {
  const url = new URL(input.url);
  const location = `${url.origin}${url.pathname}`;
  if (input.top) return location;
  const ancestors = (input.ancestorOrigins ?? []).join('>');
  const name = input.name?.trim() ?? '';
  return `${location}|ancestors:${ancestors}|name:${name}`;
}

/** Converts identities emitted before P1-C review into their stable comparison parts. */
export function legacyFrameIdentityParts(identity: string): { location: string; name: string } | undefined {
  const match = /^(.*?)\|name:([^|]*)\|title:/.exec(identity);
  return match ? { location: match[1]!, name: match[2]! } : undefined;
}

export function frameIdentityParts(identity: string): { location: string; name?: string } {
  const current = /^(.*?)\|ancestors:.*\|name:([^|]*)$/.exec(identity);
  if (current) return { location: current[1]!, name: current[2]! };
  return { location: identity };
}
