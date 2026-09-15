export interface DictionaryField {
  /** Canonical key; `$` represents any indexed record. */
  key: string;
  aliases: string[];
  autocompleteAliases: string[];
  sectionAliases: string[];
}

const BASIC = ['基本信息', '个人信息', 'personal information', 'basic information'];
const EDUCATION = ['教育经历', '教育背景', 'education', 'academic background'];
const WORK = ['工作经历', '实习经历', '职业经历', 'work experience', 'employment', 'experience'];
const PROJECT = ['项目经历', '项目经验', 'projects', 'project experience'];
const PREFERENCE = ['求职意向', '职业意向', 'job preference', 'career preference'];

const d = (
  key: string,
  aliases: string[],
  sectionAliases: string[] = BASIC,
  autocompleteAliases: string[] = [],
): DictionaryField => ({ key, aliases, sectionAliases, autocompleteAliases });

export const FIELD_DICTIONARY: DictionaryField[] = [
  d('identity.name', ['姓名', '全名', 'name', 'full name'], BASIC, ['name']),
  d('identity.firstName', ['名', '名字', 'first name', 'given name'], BASIC, ['given-name']),
  d('identity.lastName', ['姓', '姓氏', 'last name', 'family name', 'surname'], BASIC, ['family-name']),
  d('identity.namePinyin', ['姓名拼音', '姓名（拼音）', 'name pinyin', 'pinyin name']),
  d('identity.firstNamePinyin', ['名拼音', 'first name pinyin', 'given name pinyin']),
  d('identity.lastNamePinyin', ['姓拼音', 'last name pinyin', 'surname pinyin']),
  d('contact.phone', ['手机号', '手机号码', '联系电话', '移动电话', 'phone', 'mobile', 'telephone'], BASIC, ['tel']),
  d('contact.email', ['邮箱', '电子邮箱', 'email', 'e-mail'], BASIC, ['email']),
  d('identity.gender', ['性别', 'gender', 'sex']), d('identity.birthDate', ['出生日期', '生日', 'date of birth', 'birth date', 'birthday'], BASIC, ['bday']),
  d('location.current', ['现居地', '当前城市', '居住地', 'current location', 'current city', 'residence']),
  d('employment.jobSeekingStatus', ['求职身份', '当前状态', '求职状态', 'candidate status', 'job seeking status']),
  d('employment.startWorkDate', ['参加工作时间', '首次工作时间', '开始工作时间', 'career start date']),
  d('employment.yearsOfExperience', ['工作年限', '工作经验年限', 'years of experience', 'experience years']),

  d('educations.$.school', ['学校', '毕业院校', '院校', 'university', 'school', 'college'], EDUCATION),
  d('educations.$.degree', ['学历', '学位', '最高学历', 'degree', 'education level'], EDUCATION),
  d('educations.$.major', ['专业', '所学专业', 'major', 'field of study'], EDUCATION),
  d('educations.$.startDate', ['入学时间', '教育开始时间', 'start date', 'from'], EDUCATION),
  d('educations.$.endDate', ['毕业时间', '教育结束时间', 'graduation date', 'end date', 'to'], EDUCATION),
  d('educations.$.description', ['教育经历描述', '教育描述', 'education description'], EDUCATION),
  d('educations.$.gpa', ['GPA', '绩点', '平均绩点'], EDUCATION),
  d('educations.$.gpaScale', ['GPA满分制', '绩点满分', 'gpa scale', 'maximum gpa'], EDUCATION),
  d('educations.$.rank', ['专业排名', '排名', 'class rank', 'rank'], EDUCATION),
  d('educations.$.researchArea', ['研究方向', '研究领域', 'research area', 'research field'], EDUCATION),
  d('educations.$.honors', ['荣誉', '荣誉奖项', '奖学金', 'honors', 'awards'], EDUCATION),
  d('educations.$.courses', ['课程', '主修课程', '核心课程', 'courses', 'coursework'], EDUCATION),
  d('educations.$.degreeType', ['学历类型', '学位类型', 'degree type'], EDUCATION),
  d('educations.$.fullTime', ['统招', '是否统招', '全日制', 'full time education'], EDUCATION),
  d('educations.$.department', ['院系', '学院', 'department', 'faculty'], EDUCATION),
  d('educations.$.location', ['学校所在地', '院校地点', 'school location', 'campus location'], EDUCATION),
  d('educations.$.campusExperience', ['校园经历', '在校经历', 'campus experience', 'school activities'], EDUCATION),
  d('educations.$.minor', ['辅修', '辅修专业', 'minor'], EDUCATION),
  d('educations.$.thesis', ['论文', '毕业论文', 'thesis', 'dissertation'], EDUCATION),

  d('workExperiences.$.company', ['公司', '公司名称', '实习公司', '单位', 'company', 'employer', 'organization'], WORK, ['organization']),
  d('workExperiences.$.title', ['职位', '岗位', '岗位名称', '职务', 'job title', 'position', 'title'], WORK, ['organization-title']),
  d('workExperiences.$.startDate', ['入职时间', '工作开始时间', '开始时间', 'start date', 'from'], WORK),
  d('workExperiences.$.endDate', ['离职时间', '工作结束时间', '结束时间', 'end date', 'to'], WORK),
  d('workExperiences.$.description', ['工作内容', '工作描述', '工作职责', 'job description', 'work description'], WORK),
  d('workExperiences.$.department', ['部门', '所在部门', 'department'], WORK),
  d('workExperiences.$.location', ['工作地点', '办公地点', 'work location', 'office location'], WORK),
  d('workExperiences.$.industry', ['行业', '所属行业', 'industry'], WORK),
  d('workExperiences.$.companyType', ['公司性质', '企业性质', 'company type', 'ownership'], WORK),
  d('workExperiences.$.companySize', ['公司规模', '企业规模', 'company size'], WORK),
  d('workExperiences.$.skills', ['工作技能', '使用技能', 'skills used', 'technologies'], WORK),
  d('workExperiences.$.managementCount', ['管理人数', '下属人数', 'team managed', 'direct reports'], WORK),
  d('workExperiences.$.reportsTo', ['汇报对象', '上级职位', 'reports to', 'manager'], WORK),
  d('workExperiences.$.leavingReason', ['离职原因', 'reason for leaving'], WORK),
  d('workExperiences.$.currentSalary', ['当前薪资', '目前薪资', 'current salary'], WORK),
  d('workExperiences.$.referenceName', ['证明人', '推荐人', 'reference name'], WORK),
  d('workExperiences.$.referencePhone', ['证明人电话', '推荐人电话', 'reference phone'], WORK),

  d('projects.$.name', ['项目名称', '项目名', 'project name'], PROJECT),
  d('projects.$.role', ['项目角色', '担任角色', 'project role'], PROJECT),
  d('projects.$.startDate', ['项目开始时间', '开始时间', 'start date', 'from'], PROJECT),
  d('projects.$.endDate', ['项目结束时间', '结束时间', 'end date', 'to'], PROJECT),
  d('projects.$.description', ['项目描述', '项目介绍', 'project description'], PROJECT),
  d('projects.$.scale', ['项目规模', 'project scale'], PROJECT),
  d('projects.$.company', ['关联公司', '所属公司', 'related company'], PROJECT),
  d('projects.$.status', ['项目状态', 'project status'], PROJECT),
  d('projects.$.teamSize', ['团队人数', '项目人数', 'team size'], PROJECT),
  d('projects.$.responsibilities', ['项目职责', '职责', 'responsibilities'], PROJECT),
  d('projects.$.achievements', ['项目成果', '项目业绩', 'achievements', 'results'], PROJECT),
  d('projects.$.attachmentReference', ['附件引用', '项目附件', 'attachment', 'project link'], PROJECT),

  d('preference.role', ['期望职位', '意向岗位', '目标职位', 'desired position', 'preferred role'], PREFERENCE),
  d('preference.city', ['意向城市', '期望城市', '工作城市', '城市', 'location', 'preferred city', 'desired location'], PREFERENCE, ['address-level2']),
  d('preference.industry', ['期望行业', '意向行业', 'preferred industry'], PREFERENCE),
  d('preference.salary', ['期望薪资', '薪资要求', 'expected salary'], PREFERENCE),
  d('preference.employmentType', ['工作类型', '求职类型', 'employment type', 'job type'], PREFERENCE),
  d('preference.availableDate', ['到岗时间', '可入职时间', 'available date', 'start availability'], PREFERENCE),
  d('skills.summary', ['技能', '专业技能', '技能特长', 'skills', 'technical skills'], ['技能', '能力', 'skills']),
  d('skills.english', ['英语', '英语能力', '外语水平', 'english proficiency'], ['技能', '语言能力', 'skills', 'languages']),
  d('summary.selfEvaluation', ['自我评价', '个人总结', '个人优势', 'self evaluation', 'summary'], ['自我评价', '个人总结', 'summary']),
  d('links.linkedin', ['LinkedIn', 'LinkedIn URL', '领英']), d('links.github', ['GitHub', 'GitHub URL']),
  d('links.website', ['个人网站', '网站', 'website', 'personal website']), d('links.portfolio', ['作品集', '作品集链接', 'portfolio', 'portfolio url']),

  // Legacy non-indexed keys remain matchable for existing saved profiles.
  d('education.school', ['学校', '毕业院校', 'university', 'school'], EDUCATION),
  d('education.degree', ['学历', '最高学历', 'degree'], EDUCATION),
  d('education.major', ['专业', '所学专业', 'major'], EDUCATION),
  d('experience.company', ['公司', '实习公司', 'company', 'employer'], WORK),
  d('experience.title', ['职位', '岗位名称', 'job title', 'title'], WORK),
];

export function normalizeDictionaryKey(key: string): string {
  return key.replace(/\.(\d+)\./g, '.$.');
}

export function findDictionaryField(key: string): DictionaryField | undefined {
  const normalized = normalizeDictionaryKey(key);
  return FIELD_DICTIONARY.find((item) => item.key === normalized);
}
