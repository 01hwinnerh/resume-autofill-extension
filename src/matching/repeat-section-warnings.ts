import type { PageFieldDescriptor } from '../shared/form';
import type { Profile } from '../shared/profile';

type RepeatCategory = 'education' | 'work' | 'project';

export interface RepeatSectionWarning {
  category: RepeatCategory;
  profileCount: number;
  pageCount: number;
  message: string;
}

const CONFIG: Record<RepeatCategory, { prefix: string; label: string; pattern: RegExp }> = {
  education: { prefix: 'educations', label: '教育经历', pattern: /教育|学历|education|academic/i },
  work: { prefix: 'workExperiences', label: '工作经历', pattern: /工作|实习|职业|work|employment|experience/i },
  project: { prefix: 'projects', label: '项目经历', pattern: /项目|project/i },
};

function populatedRecordIndexes(profile: Profile, prefix: string): Set<number> {
  const indexes = new Set<number>();
  for (const field of Object.values(profile.fields)) {
    const match = field.key.match(new RegExp(`^${prefix}\\.(\\d+)\\.`));
    const populated = Array.isArray(field.value) ? field.value.length > 0 : field.value !== null && field.value !== undefined && String(field.value).trim() !== '';
    if (match && populated) indexes.add(Number(match[1]));
  }
  return indexes;
}

function descriptorCategory(field: PageFieldDescriptor): RepeatCategory | undefined {
  const value = `${field.sectionLabel ?? ''} ${field.semanticSource ?? ''}`;
  if (CONFIG.education.pattern.test(value)) return 'education';
  if (CONFIG.project.pattern.test(value)) return 'project';
  if (CONFIG.work.pattern.test(value)) return 'work';
  return undefined;
}

export function repeatSectionWarnings(fields: PageFieldDescriptor[], profile: Profile): RepeatSectionWarning[] {
  return (Object.keys(CONFIG) as RepeatCategory[]).flatMap((category) => {
    const config = CONFIG[category];
    const pageIndexes = new Set(fields.flatMap((field) => field.sectionIndex !== undefined && descriptorCategory(field) === category ? [field.sectionIndex] : []));
    if (pageIndexes.size === 0) return [];
    const profileCount = populatedRecordIndexes(profile, config.prefix).size;
    if (profileCount <= pageIndexes.size) return [];
    return [{
      category,
      profileCount,
      pageCount: pageIndexes.size,
      message: `${config.label}资料有 ${profileCount} 段，页面只有 ${pageIndexes.size} 段，请手动新增后重新扫描。`,
    }];
  });
}
