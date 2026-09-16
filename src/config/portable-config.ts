import type { Profile } from '../shared/profile';
import type { UserFieldMapping } from '../shared/mapping';
import { isProfile } from '../profile/profile-store';
import type { ProfileStore } from '../profile/profile-store';
import { isUserFieldMapping, type MappingStore } from '../storage/mapping-store';

export const PORTABLE_CONFIG_FORMAT = 'resume-autofill-config' as const;
export const PORTABLE_CONFIG_SCHEMA_VERSION = 1 as const;

export interface PortableConfigV1 {
  format: typeof PORTABLE_CONFIG_FORMAT;
  schemaVersion: typeof PORTABLE_CONFIG_SCHEMA_VERSION;
  exportedAt: string;
  profile: Profile;
  mappings: UserFieldMapping[];
}

export interface PortableConfigSummary {
  profileFieldCount: number;
  customFieldCount: number;
  educationCount: number;
  workCount: number;
  projectCount: number;
  mappingCount: number;
}

export class PortableConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortableConfigError';
  }
}

function isPortableConfig(value: unknown): value is PortableConfigV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PortableConfigV1>;
  return candidate.format === PORTABLE_CONFIG_FORMAT
    && candidate.schemaVersion === PORTABLE_CONFIG_SCHEMA_VERSION
    && typeof candidate.exportedAt === 'string'
    && Number.isFinite(Date.parse(candidate.exportedAt))
    && isProfile(candidate.profile)
    && Array.isArray(candidate.mappings)
    && candidate.mappings.every(isUserFieldMapping);
}

export function createPortableConfig(
  profile: Profile,
  mappings: UserFieldMapping[],
  exportedAt = new Date().toISOString(),
): PortableConfigV1 {
  return {
    format: PORTABLE_CONFIG_FORMAT,
    schemaVersion: PORTABLE_CONFIG_SCHEMA_VERSION,
    exportedAt,
    profile: structuredClone(profile),
    mappings: structuredClone(mappings),
  };
}

export function stringifyPortableConfig(config: PortableConfigV1): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function parsePortableConfig(json: string): PortableConfigV1 {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new PortableConfigError('文件不是有效的 JSON。');
  }
  if (!value || typeof value !== 'object') throw new PortableConfigError('配置文件结构无效。');
  const candidate = value as { format?: unknown; schemaVersion?: unknown };
  if (candidate.format !== PORTABLE_CONFIG_FORMAT) throw new PortableConfigError('这不是简历填写助手的配置文件。');
  if (candidate.schemaVersion !== PORTABLE_CONFIG_SCHEMA_VERSION) {
    throw new PortableConfigError(`暂不支持配置版本 ${String(candidate.schemaVersion)}。`);
  }
  if (!isPortableConfig(value)) throw new PortableConfigError('配置内容不完整或字段类型无效。');
  return value;
}

function experienceCount(profile: Profile, prefix: string): number {
  const indexes = new Set<number>();
  for (const key of Object.keys(profile.fields)) {
    const match = new RegExp(`^${prefix}\\.(\\d+)\\.`).exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  return indexes.size;
}

export function summarizePortableConfig(config: PortableConfigV1): PortableConfigSummary {
  const keys = Object.keys(config.profile.fields);
  return {
    profileFieldCount: keys.length,
    customFieldCount: keys.filter((key) => key.startsWith('custom.')).length,
    educationCount: experienceCount(config.profile, 'educations'),
    workCount: experienceCount(config.profile, 'workExperiences'),
    projectCount: experienceCount(config.profile, 'projects'),
    mappingCount: config.mappings.length,
  };
}

export async function importPortableConfig(
  config: PortableConfigV1,
  profileStore: ProfileStore,
  mappingStore: MappingStore,
): Promise<void> {
  const previousProfile = await profileStore.load();
  const previousMappings = await mappingStore.list();
  await profileStore.save(config.profile);
  try {
    await mappingStore.replace(config.mappings);
  } catch (cause) {
    try {
      await profileStore.save(previousProfile);
      await mappingStore.replace(previousMappings);
    } catch {
      // Preserve the original import failure; rollback is best effort.
    }
    throw cause;
  }
}
