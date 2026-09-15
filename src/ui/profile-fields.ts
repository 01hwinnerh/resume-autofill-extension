import type { FillPolicy, Profile, ProfileField, ProfileFieldType } from '../shared/profile';

export type ProfileSection = 'basic' | 'education' | 'work' | 'project' | 'preference' | 'skills' | 'links';

export interface ProfileFieldDefinition {
  key: string;
  label: string;
  type: ProfileFieldType;
  policy: FillPolicy;
  section: ProfileSection;
  placeholder?: string;
}

export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  basic: '基本信息', education: '教育经历', work: '工作经历', project: '项目经历',
  preference: '求职意向', skills: '能力与评价', links: '链接与作品',
};

const field = (
  section: ProfileSection,
  key: string,
  label: string,
  type: ProfileFieldType = 'text',
  policy: FillPolicy = 'auto',
  placeholder?: string,
): ProfileFieldDefinition => ({ section, key, label, type, policy, placeholder });

/** 当前编辑器支持每类经历的首条 indexed 记录；不会伪装成可自动创建页面重复容器。 */
export const PROFILE_FIELDS: ProfileFieldDefinition[] = [
  field('basic', 'identity.name', '姓名'), field('basic', 'identity.firstName', '名'),
  field('basic', 'identity.lastName', '姓'), field('basic', 'identity.namePinyin', '姓名拼音'),
  field('basic', 'identity.firstNamePinyin', '名拼音'), field('basic', 'identity.lastNamePinyin', '姓拼音'),
  field('basic', 'contact.phone', '手机号', 'text', 'review'), field('basic', 'contact.email', '邮箱'),
  field('basic', 'identity.gender', '性别', 'enum', 'review'), field('basic', 'identity.birthDate', '出生日期', 'date', 'review'),
  field('basic', 'location.current', '现居地'), field('basic', 'employment.jobSeekingStatus', '求职身份', 'enum', 'review'),
  field('basic', 'employment.startWorkDate', '参加工作时间', 'date'), field('basic', 'employment.yearsOfExperience', '工作年限', 'number'),

  field('education', 'educations.0.school', '学校'), field('education', 'educations.0.degree', '学历', 'enum', 'review'),
  field('education', 'educations.0.major', '专业'), field('education', 'educations.0.startDate', '入学时间', 'date'),
  field('education', 'educations.0.endDate', '毕业时间', 'date'), field('education', 'educations.0.description', '教育经历描述', 'text', 'review'),
  field('education', 'educations.0.gpa', 'GPA', 'number'), field('education', 'educations.0.gpaScale', 'GPA 满分制', 'number'),
  field('education', 'educations.0.rank', '专业排名'), field('education', 'educations.0.researchArea', '研究方向'),
  field('education', 'educations.0.honors', '荣誉奖项', 'text', 'review'), field('education', 'educations.0.courses', '主修课程'),
  field('education', 'educations.0.degreeType', '学历类型', 'enum'), field('education', 'educations.0.fullTime', '是否统招', 'boolean', 'review'),
  field('education', 'educations.0.department', '院系'), field('education', 'educations.0.location', '学校所在地'),
  field('education', 'educations.0.campusExperience', '校园经历', 'text', 'review'), field('education', 'educations.0.minor', '辅修专业'),
  field('education', 'educations.0.thesis', '论文', 'text', 'review'),

  field('work', 'workExperiences.0.company', '公司'), field('work', 'workExperiences.0.title', '职位'),
  field('work', 'workExperiences.0.startDate', '开始时间', 'date'), field('work', 'workExperiences.0.endDate', '结束时间', 'date'),
  field('work', 'workExperiences.0.description', '工作内容', 'text', 'review'), field('work', 'workExperiences.0.department', '部门'),
  field('work', 'workExperiences.0.location', '工作地点'), field('work', 'workExperiences.0.industry', '所属行业'),
  field('work', 'workExperiences.0.companyType', '公司性质'), field('work', 'workExperiences.0.companySize', '公司规模'),
  field('work', 'workExperiences.0.skills', '工作技能'), field('work', 'workExperiences.0.managementCount', '管理人数', 'number'),
  field('work', 'workExperiences.0.reportsTo', '汇报对象', 'text', 'review'), field('work', 'workExperiences.0.leavingReason', '离职原因', 'text', 'review'),
  field('work', 'workExperiences.0.currentSalary', '当前薪资', 'text', 'review'), field('work', 'workExperiences.0.referenceName', '证明人', 'text', 'review'),
  field('work', 'workExperiences.0.referencePhone', '证明人电话', 'text', 'review'),

  field('project', 'projects.0.name', '项目名称'), field('project', 'projects.0.role', '项目角色'),
  field('project', 'projects.0.startDate', '开始时间', 'date'), field('project', 'projects.0.endDate', '结束时间', 'date'),
  field('project', 'projects.0.description', '项目描述', 'text', 'review'), field('project', 'projects.0.scale', '项目规模'),
  field('project', 'projects.0.company', '关联公司'), field('project', 'projects.0.status', '项目状态', 'enum'),
  field('project', 'projects.0.teamSize', '团队人数', 'number'), field('project', 'projects.0.responsibilities', '项目职责', 'text', 'review'),
  field('project', 'projects.0.achievements', '项目成果', 'text', 'review'),
  field('project', 'projects.0.attachmentReference', '附件引用', 'text', 'review', '仅保存附件名称或链接；暂不支持真实文件上传'),

  field('preference', 'preference.role', '期望职位'), field('preference', 'preference.city', '意向城市', 'text', 'review'),
  field('preference', 'preference.industry', '期望行业'), field('preference', 'preference.salary', '期望薪资', 'text', 'review'),
  field('preference', 'preference.employmentType', '工作类型', 'enum'), field('preference', 'preference.availableDate', '到岗时间', 'date'),
  field('skills', 'skills.summary', '技能'), field('skills', 'skills.english', '英语能力'),
  field('skills', 'summary.selfEvaluation', '自我评价', 'text', 'review'),
  field('links', 'links.linkedin', 'LinkedIn URL'), field('links', 'links.github', 'GitHub URL'),
  field('links', 'links.website', '个人网站 URL'), field('links', 'links.portfolio', '作品集 URL'),
];

// Compatibility export retained for existing callers.
export const P0_PROFILE_FIELDS = PROFILE_FIELDS;

export function emptyProfile(): Profile { return { schemaVersion: 1, fields: {} }; }
export function isCustomProfileKey(key: string): boolean { return /^custom\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key.trim()); }
export function profileFieldValue(profile: Profile, key: string): ProfileField['value'] { return profile.fields[key]?.value ?? null; }
export function buildProfileField(definition: ProfileFieldDefinition, input: string): ProfileField {
  const { section: _section, placeholder: _placeholder, ...profileField } = definition;
  const value: ProfileField['value'] = definition.type === 'boolean'
    ? input === 'true'
    : definition.type === 'number'
      ? Number(input)
      : definition.type === 'multiselect'
        ? input.split(',').map((item) => item.trim()).filter(Boolean)
        : input;
  return { ...profileField, value };
}
