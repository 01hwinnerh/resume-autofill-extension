import type { ApplicationRecord } from '../shared/application-record';
import type { Profile } from '../shared/profile';
import type { UserFieldMapping } from '../shared/mapping';
import { isProfile, profileEnvelope, PROFILE_KEY, type ProfileStore } from '../profile/profile-store';
import { isUserFieldMapping, mappingEnvelope, MAPPINGS_KEY, type MappingStore } from '../storage/mapping-store';
import { applicationEnvelope, APPLICATIONS_KEY, isApplicationRecord, type ApplicationStore } from '../storage/application-store';
import { createTransactionId, StorageTransactionError, type StorageTransactionTarget } from '../storage/coordinated-transaction';

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
  readonly transactionId: string;
  readonly recovery: 'recovered' | 'manual-required';
  constructor(error: StorageTransactionError) {
    super(error.outcome === 'failed-recovered'
      ? `导入失败，但已恢复导入前数据（事务 ${error.transactionId}）：${error.message}`
      : `导入失败，需要人工恢复（事务 ${error.transactionId}）：${error.message}`);
    this.name = 'PortableConfigImportError';
    this.transactionId = error.transactionId;
    this.recovery = error.outcome === 'failed-recovered' ? 'recovered' : 'manual-required';
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
  const [profile, mappings, applications] = await Promise.all([
    profileStore.snapshot(),
    mappingStore.snapshot(),
    config.schemaVersion === 2 ? applicationStore.snapshot() : Promise.resolve(undefined),
  ]);
  const targets: StorageTransactionTarget[] = [
    { key: PROFILE_KEY, expectedRevision: profile.revision, value: profileEnvelope(config.profile, profile.revision + 1) },
    { key: MAPPINGS_KEY, expectedRevision: mappings.revision, value: mappingEnvelope(config.mappings, mappings.revision + 1) },
  ];
  if (config.schemaVersion === 2 && applications) targets.push({
    key: APPLICATIONS_KEY,
    expectedRevision: applications.revision,
    value: applicationEnvelope(config.applications, applications.revision + 1),
  });
  const result = await profileStore.transaction({
    transactionId: createTransactionId(),
    kind: config.schemaVersion === 1 ? 'portable-import-v1' : 'portable-import-v2',
    targets,
  });
  if (!result.ok) throw new PortableConfigImportError(new StorageTransactionError(result));
  await profileStore.load();
}
