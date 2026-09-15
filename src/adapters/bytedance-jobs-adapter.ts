import { normalizeLabel } from '../form-engine/normalize-label';
import type { PageFieldDescriptor } from '../shared/form';
import type { AdapterHint, PageContext, SiteAdapter } from './adapter-types';

type RepeatedSection = 'educations' | 'workExperiences' | 'projects';

const BASIC_LABELS: Record<string, string> = {
  姓名: 'identity.name',
  中文姓名: 'identity.name',
  性别: 'identity.gender',
  出生日期: 'identity.birthDate',
  手机号: 'contact.phone',
  手机号码: 'contact.phone',
  联系电话: 'contact.phone',
  邮箱: 'contact.email',
  电子邮箱: 'contact.email',
  所在城市: 'location.current',
  当前城市: 'location.current',
  现居地: 'location.current',
  期望工作城市: 'preference.city',
  期望城市: 'preference.city',
  意向城市: 'preference.city',
  期望职位: 'preference.role',
  期望薪资: 'preference.salary',
  个人网站: 'links.website',
  github: 'links.github',
  个人评价: 'summary.selfEvaluation',
  自我评价: 'summary.selfEvaluation',
};

const REPEATED_LABELS: Record<RepeatedSection, Record<string, string>> = {
  educations: {
    学校: 'school', 学校名称: 'school', 毕业院校: 'school', 学历: 'degree', 学位: 'degree',
    专业: 'major', 专业名称: 'major', 入学时间: 'startDate', 开始时间: 'startDate',
    毕业时间: 'endDate', 结束时间: 'endDate', gpa: 'gpa', 成绩排名: 'rank',
    学院: 'department', 院系: 'department', 教育经历描述: 'description',
  },
  workExperiences: {
    公司: 'company', 公司名称: 'company', 单位名称: 'company', 部门: 'department',
    职位: 'title', 职位名称: 'title', 岗位: 'title', 开始时间: 'startDate',
    结束时间: 'endDate', 工作内容: 'description', 工作描述: 'description',
  },
  projects: {
    项目名称: 'name', 项目角色: 'role', 担任角色: 'role', 开始时间: 'startDate',
    结束时间: 'endDate', 项目描述: 'description', 项目成果: 'achievements', 项目链接: 'attachmentReference',
  },
};

function compact(value: string | undefined): string {
  return normalizeLabel(value).replace(/[：:*＊\s]/g, '');
}

function repeatedSection(sectionLabel: string | undefined): RepeatedSection | undefined {
  const section = compact(sectionLabel);
  if (/(教育|学历|学校)/.test(section)) return 'educations';
  if (/(工作|实习|职业)/.test(section)) return 'workExperiences';
  if (/项目/.test(section)) return 'projects';
  return undefined;
}

function repeatedProfileKey(field: PageFieldDescriptor): string | undefined {
  const label = compact(field.label);
  const explicitSection = repeatedSection(field.sectionLabel);
  const inferredSections = (Object.keys(REPEATED_LABELS) as RepeatedSection[])
    .filter((section) => REPEATED_LABELS[section][label] !== undefined);
  const section = explicitSection ?? (inferredSections.length === 1 ? inferredSections[0] : undefined);
  if (!section) return undefined;
  const suffix = REPEATED_LABELS[section][label];
  if (!suffix) return undefined;
  return `${section}.${field.sectionIndex ?? 0}.${suffix}`;
}

export class ByteDanceJobsAdapter implements SiteAdapter {
  readonly id = 'bytedance-jobs';

  matches(context: PageContext): boolean {
    return context.host === 'jobs.bytedance.com' && /\/resume\/[^/]+\/apply(?:\/|$)/.test(new URL(context.url).pathname);
  }

  discoverHints(fields: PageFieldDescriptor[]): AdapterHint[] {
    return fields.flatMap((field) => {
      const repeated = repeatedProfileKey(field);
      const profileKey = repeated ?? BASIC_LABELS[compact(field.label)];
      return profileKey ? [{
        fieldId: field.fieldId,
        profileKey,
        score: 0.96,
        reason: `字节招聘页面字段“${field.label}”适配`,
      }] : [];
    });
  }
}
