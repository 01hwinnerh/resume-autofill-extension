import type { FillPolicy, Profile, ProfileField, ProfileFieldType } from '../shared/profile';

export type ProfileSection = 'basic' | 'education' | 'work' | 'project' | 'preference' | 'skills' | 'links';
export type RepeatableProfileSection = 'education' | 'work' | 'project';

export interface ProfileFieldDefinition {
  key: string; label: string; type: ProfileFieldType; policy: FillPolicy; section: ProfileSection; placeholder?: string;
}

export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  basic: '基本信息', education: '教育经历', work: '工作经历', project: '项目经历',
  preference: '求职意向', skills: '能力与评价', links: '链接与作品',
};

const field = (section: ProfileSection, key: string, label: string, type: ProfileFieldType = 'text', policy: FillPolicy = 'auto', placeholder?: string): ProfileFieldDefinition => ({ section, key, label, type, policy, placeholder });
const template = (section: RepeatableProfileSection, suffix: string, label: string, type: ProfileFieldType = 'text', policy: FillPolicy = 'auto', placeholder?: string) => field(section, suffix, label, type, policy, placeholder);

export const EXPERIENCE_PREFIXES: Record<RepeatableProfileSection, string> = {
  education: 'educations', work: 'workExperiences', project: 'projects',
};

export const EXPERIENCE_FIELD_TEMPLATES: Record<RepeatableProfileSection, ProfileFieldDefinition[]> = {
  education: [
    template('education', 'school', '学校'), template('education', 'degree', '学历', 'enum', 'review'), template('education', 'major', '专业'),
    template('education', 'startDate', '入学时间', 'date'), template('education', 'endDate', '毕业时间', 'date'), template('education', 'description', '教育经历描述', 'text', 'review'),
    template('education', 'gpa', 'GPA', 'number'), template('education', 'gpaScale', 'GPA 满分制', 'number'), template('education', 'rank', '专业排名'),
    template('education', 'researchArea', '研究方向'), template('education', 'honors', '荣誉奖项', 'text', 'review'), template('education', 'courses', '主修课程'),
    template('education', 'degreeType', '学历类型', 'enum'), template('education', 'fullTime', '是否统招', 'boolean', 'review'), template('education', 'department', '院系'),
    template('education', 'location', '学校所在地'), template('education', 'campusExperience', '校园经历', 'text', 'review'), template('education', 'minor', '辅修专业'),
    template('education', 'thesis', '论文', 'text', 'review'),
  ],
  work: [
    template('work', 'company', '公司'), template('work', 'title', '职位'), template('work', 'startDate', '开始时间', 'date'), template('work', 'endDate', '结束时间', 'date'),
    template('work', 'description', '工作内容', 'text', 'review'), template('work', 'department', '部门'), template('work', 'location', '工作地点'), template('work', 'industry', '所属行业'),
    template('work', 'companyType', '公司性质'), template('work', 'companySize', '公司规模'), template('work', 'skills', '工作技能'), template('work', 'managementCount', '管理人数', 'number'),
    template('work', 'reportsTo', '汇报对象', 'text', 'review'), template('work', 'leavingReason', '离职原因', 'text', 'review'), template('work', 'currentSalary', '当前薪资', 'text', 'review'),
    template('work', 'referenceName', '证明人', 'text', 'review'), template('work', 'referencePhone', '证明人电话', 'text', 'review'),
  ],
  project: [
    template('project', 'name', '项目名称'), template('project', 'role', '项目角色'), template('project', 'startDate', '开始时间', 'date'), template('project', 'endDate', '结束时间', 'date'),
    template('project', 'description', '项目描述', 'text', 'review'), template('project', 'scale', '项目规模'), template('project', 'company', '关联公司'), template('project', 'status', '项目状态', 'enum'),
    template('project', 'teamSize', '团队人数', 'number'), template('project', 'responsibilities', '项目职责', 'text', 'review'), template('project', 'achievements', '项目成果', 'text', 'review'),
    template('project', 'attachmentReference', '附件引用', 'text', 'review', '仅保存附件名称或链接；暂不支持真实文件上传'),
  ],
};

export function experienceDefinitions(section: RepeatableProfileSection, index: number): ProfileFieldDefinition[] {
  const prefix = EXPERIENCE_PREFIXES[section];
  return EXPERIENCE_FIELD_TEMPLATES[section].map((definition) => ({ ...definition, key: `${prefix}.${index}.${definition.key}` }));
}

export function experienceIndexes(profile: Profile, section: RepeatableProfileSection): number[] {
  const prefix = EXPERIENCE_PREFIXES[section];
  const indexes = Object.keys(profile.fields).flatMap((key) => {
    const match = key.match(new RegExp(`^${prefix}\\.(\\d+)\\.`));
    return match ? [Number(match[1])] : [];
  });
  return [...new Set(indexes)].sort((a, b) => a - b);
}

const STATIC_PROFILE_FIELDS: ProfileFieldDefinition[] = [
  field('basic', 'identity.name', '姓名'), field('basic', 'identity.firstName', '名'), field('basic', 'identity.lastName', '姓'),
  field('basic', 'identity.namePinyin', '姓名拼音'), field('basic', 'identity.firstNamePinyin', '名拼音'), field('basic', 'identity.lastNamePinyin', '姓拼音'),
  field('basic', 'contact.phone', '手机号', 'text', 'review'), field('basic', 'contact.email', '邮箱'), field('basic', 'identity.gender', '性别', 'enum', 'review'),
  field('basic', 'identity.birthDate', '出生日期', 'date', 'review'), field('basic', 'location.current', '现居地'), field('basic', 'employment.jobSeekingStatus', '求职身份', 'enum', 'review'),
  field('basic', 'employment.startWorkDate', '参加工作时间', 'date'), field('basic', 'employment.yearsOfExperience', '工作年限', 'number'),
  field('preference', 'preference.role', '期望职位'), field('preference', 'preference.city', '意向城市', 'text', 'review'), field('preference', 'preference.industry', '期望行业'),
  field('preference', 'preference.salary', '期望薪资', 'text', 'review'), field('preference', 'preference.employmentType', '工作类型', 'enum'), field('preference', 'preference.availableDate', '到岗时间', 'date'),
  field('skills', 'skills.summary', '技能'), field('skills', 'skills.english', '英语能力'), field('skills', 'summary.selfEvaluation', '自我评价', 'text', 'review'),
  field('links', 'links.linkedin', 'LinkedIn URL'), field('links', 'links.github', 'GitHub URL'), field('links', 'links.website', '个人网站 URL'), field('links', 'links.portfolio', '作品集 URL'),
];

/** Compatibility catalog contains index 0; use profileFieldDefinitions for all persisted records. */
export const PROFILE_FIELDS = [...STATIC_PROFILE_FIELDS, ...experienceDefinitions('education', 0), ...experienceDefinitions('work', 0), ...experienceDefinitions('project', 0)];
export const P0_PROFILE_FIELDS = PROFILE_FIELDS;

export function profileFieldDefinitions(profile: Profile): ProfileFieldDefinition[] {
  const repeats = (Object.keys(EXPERIENCE_PREFIXES) as RepeatableProfileSection[]).flatMap((section) => {
    const indexes = experienceIndexes(profile, section);
    return (indexes.length ? indexes : [0]).flatMap((index) => experienceDefinitions(section, index));
  });
  return [...STATIC_PROFILE_FIELDS, ...repeats];
}

export function emptyProfile(): Profile { return { schemaVersion: 1, fields: {} }; }
export function isCustomProfileKey(key: string): boolean { return /^custom\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key.trim()); }
export function profileFieldValue(profile: Profile, key: string): ProfileField['value'] { return profile.fields[key]?.value ?? null; }
export function buildProfileField(definition: ProfileFieldDefinition, input: string): ProfileField {
  const { section: _section, placeholder: _placeholder, ...profileField } = definition;
  const value: ProfileField['value'] = definition.type === 'boolean' ? input === 'true' : definition.type === 'number' ? Number(input) : definition.type === 'multiselect' ? input.split(',').map((item) => item.trim()).filter(Boolean) : input;
  return { ...profileField, value };
}
