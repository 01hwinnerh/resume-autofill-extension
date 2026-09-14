export interface DictionaryField {
  key: string;
  aliases: string[];
  autocompleteAliases: string[];
}

export const FIELD_DICTIONARY: DictionaryField[] = [
  {
    key: 'identity.name',
    aliases: ['姓名', 'name', 'full name'],
    autocompleteAliases: ['name'],
  },
  {
    key: 'contact.phone',
    aliases: ['手机号', '联系电话', '移动电话', 'phone', 'mobile'],
    autocompleteAliases: ['tel'],
  },
  {
    key: 'contact.email',
    aliases: ['邮箱', '电子邮箱', 'email'],
    autocompleteAliases: ['email'],
  },
  {
    key: 'education.school',
    aliases: ['学校', '毕业院校', 'university', 'school'],
    autocompleteAliases: [],
  },
  {
    key: 'education.degree',
    aliases: ['学历', '最高学历', 'degree', 'education'],
    autocompleteAliases: [],
  },
  {
    key: 'education.major',
    aliases: ['专业', '所学专业', 'major', 'field of study'],
    autocompleteAliases: [],
  },
  {
    key: 'experience.company',
    aliases: ['公司', '实习公司', 'company', 'employer'],
    autocompleteAliases: ['organization'],
  },
  {
    key: 'experience.title',
    aliases: ['职位', '岗位名称', 'job title', 'title'],
    autocompleteAliases: ['organization-title'],
  },
  {
    key: 'preference.city',
    aliases: ['意向城市', '工作城市', 'city', 'location'],
    autocompleteAliases: ['address-level2'],
  },
];

export function findDictionaryField(key: string): DictionaryField | undefined {
  return FIELD_DICTIONARY.find((field) => field.key === key);
}
