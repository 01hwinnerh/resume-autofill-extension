import type { ApplicationRecord } from '../shared/application-record';
import type { Profile } from '../shared/profile';
import type { UserFieldMapping } from '../shared/mapping';
import { isProfile, type ProfileStore } from '../profile/profile-store';
import { isUserFieldMapping, type MappingStore } from '../storage/mapping-store';
import { isApplicationRecord, type ApplicationStore } from '../storage/application-store';

export const PORTABLE_CONFIG_FORMAT = 'resume-autofill-config' as const;
export const PORTABLE_CONFIG_SCHEMA_VERSION = 2 as const;

export interface PortableConfigV1 {
  format: typeof PORTABLE_CONFIG_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  profile: Profile;
  mappings: UserFieldMapping[];
}

export interface PortableConfigV2 {
  format: typeof PORTABLE_CONFIG_FORMAT;
  schemaVersion: 2;
  exportedAt: string;
  profile: Profile;
  mappings: UserFieldMapping[];
  applications: ApplicationRecord[];
}

export type PortableConfig = PortableConfigV1 | PortableConfigV2;

export interface PortableConfigSummary {
  profileFieldCount: number;
  customFieldCount: number;
  educationCount: number;
  workCount: number;
  projectCount: number;
  mappingCount: number;
  applicationCount: number;
  applicationEventCount: number;
  preservesApplications: boolean;
}

export class PortableConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'PortableConfigError'; }
}

export class PortableConfigImportError extends Error {
  readonly rollbackFailures: string[];
  constructor(cause: unknown, rollbackFailures: string[]) {
    const reason = cause instanceof Error ? cause.message : '未知错误';
    super(rollbackFailures.length
      ? `导入失败：${reason}；回滚未完全成功：${rollbackFailures.join('、')}`
      : `导入失败：${reason}；已恢复导入前的资料、映射和投递记录。`);
    this.name = 'PortableConfigImportError';
    this.rollbackFailures = rollbackFailures;
  }
}

type PortableCandidate = { format?: unknown; schemaVersion?: unknown; exportedAt?: unknown; profile?: unknown; mappings?: unknown; applications?: unknown };

function commonValid(candidate: PortableCandidate): boolean {
  return candidate.format === PORTABLE_CONFIG_FORMAT
    && typeof candidate.exportedAt === 'string' && Number.isFinite(Date.parse(candidate.exportedAt))
    && isProfile(candidate.profile)
    && Array.isArray(candidate.mappings) && candidate.mappings.every(isUserFieldMapping);
}

function isPortableConfig(value: unknown): value is PortableConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PortableCandidate;
  if (!commonValid(candidate)) return false;
  if (candidate.schemaVersion === 1) return true;
  return candidate.schemaVersion === 2 && Array.isArray(candidate.applications) && candidate.applications.every(isApplicationRecord);
}

export function createPortableConfig(profile: Profile, mappings: UserFieldMapping[], applications: ApplicationRecord[], exportedAt?: string): PortableConfigV2;
/** @deprecated Pass applications as the third argument. */
export function createPortableConfig(profile: Profile, mappings: UserFieldMapping[], exportedAt?: string): PortableConfigV2;
export function createPortableConfig(profile: Profile, mappings: UserFieldMapping[], applicationsOrExportedAt: ApplicationRecord[] | string = [], exportedAt = new Date().toISOString()): PortableConfigV2 {
  const applications = Array.isArray(applicationsOrExportedAt) ? applicationsOrExportedAt : [];
  const timestamp = typeof applicationsOrExportedAt === 'string' ? applicationsOrExportedAt : exportedAt;
  return { format: PORTABLE_CONFIG_FORMAT, schemaVersion: 2, exportedAt: timestamp, profile: structuredClone(profile), mappings: structuredClone(mappings), applications: structuredClone(applications) };
}

export function stringifyPortableConfig(config: PortableConfig): string { return `${JSON.stringify(config, null, 2)}\n`; }

export function parsePortableConfig(json: string): PortableConfig {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new PortableConfigError('文件不是有效的 JSON。'); }
  if (!value || typeof value !== 'object') throw new PortableConfigError('备份文件结构无效。');
  const candidate = value as { format?: unknown; schemaVersion?: unknown };
  if (candidate.format !== PORTABLE_CONFIG_FORMAT) throw new PortableConfigError('这不是简历填写助手的备份文件。');
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) throw new PortableConfigError(`暂不支持备份版本 ${String(candidate.schemaVersion)}。`);
  if (!isPortableConfig(value)) throw new PortableConfigError('备份内容不完整或字段类型无效。');
  return value;
}

function experienceCount(profile: Profile, prefix: string): number {
  const indexes = new Set<number>();
  for (const key of Object.keys(profile.fields)) { const match = new RegExp(`^${prefix}\\.(\\d+)\\.`).exec(key); if (match) indexes.add(Number(match[1])); }
  return indexes.size;
}

export function summarizePortableConfig(config: PortableConfig): PortableConfigSummary {
  const keys = Object.keys(config.profile.fields);
  const applications = config.schemaVersion === 2 ? config.applications : [];
  return {
    profileFieldCount: keys.length,
    customFieldCount: keys.filter((key) => key.startsWith('custom.')).length,
    educationCount: experienceCount(config.profile, 'educations'),
    workCount: experienceCount(config.profile, 'workExperiences'),
    projectCount: experienceCount(config.profile, 'projects'),
    mappingCount: config.mappings.length,
    applicationCount: applications.length,
    applicationEventCount: applications.reduce((count, record) => count + record.events.length, 0),
    preservesApplications: config.schemaVersion === 1,
  };
}

export async function importPortableConfig(config: PortableConfig, profileStore: ProfileStore, mappingStore: MappingStore, applicationStore: ApplicationStore): Promise<void> {
  const [previousProfile, previousMappings, previousApplications] = await Promise.all([profileStore.load(), mappingStore.list(), applicationStore.list()]);
  try {
    await profileStore.save(config.profile);
    await mappingStore.replace(config.mappings);
    if (config.schemaVersion === 2) await applicationStore.replaceAll(config.applications);
  } catch (cause) {
    const rollback = await Promise.allSettled([
      profileStore.save(previousProfile),
      mappingStore.replace(previousMappings),
      applicationStore.replaceAll(previousApplications),
    ]);
    const labels = ['个人资料', '字段映射', '投递记录'];
    const failures = rollback.flatMap((result, index) => result.status === 'rejected' ? [labels[index]!] : []);
    throw new PortableConfigImportError(cause, failures);
  }
}
