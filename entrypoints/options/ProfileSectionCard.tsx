import type { ProfileFieldDefinition, ProfileSection } from '../../src/ui/profile-fields';
import { PROFILE_SECTION_LABELS } from '../../src/ui/profile-fields';
import { ProfileValueInput } from '../../src/ui/ProfileValueInput';

const INTERNATIONAL_KEYS = new Set(['identity.firstName', 'identity.lastName', 'identity.namePinyin', 'identity.firstNamePinyin', 'identity.lastNamePinyin']);

function Fields({ fields, values, onChange }: { fields: ProfileFieldDefinition[]; values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return <div className="profile-grid">{fields.map((definition) => {
    const multiline = ['描述', '评价', '职责', '成果', '工作内容'].some((word) => definition.label.includes(word));
    return <label key={definition.key} className={multiline ? 'wide' : ''}><span>{definition.label}{definition.policy === 'review' && <em>需确认</em>}</span><ProfileValueInput type={definition.type} value={values[definition.key] ?? ''} label={definition.label} multiline={multiline} onChange={(value) => onChange(definition.key, value)} /></label>;
  })}</div>;
}

export function ProfileSectionCard({ section, fields, values, onChange, defaultOpen = false }: {
  section: ProfileSection;
  fields: ProfileFieldDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  defaultOpen?: boolean;
}) {
  const primary = section === 'basic' ? fields.filter((field) => !INTERNATIONAL_KEYS.has(field.key)) : fields;
  const international = section === 'basic' ? fields.filter((field) => INTERNATIONAL_KEYS.has(field.key)) : [];
  return <details className="profile-section" open={defaultOpen}>
    <summary><span>{PROFILE_SECTION_LABELS[section]}</span><small>{fields.filter((field) => values[field.key]?.trim()).length}/{fields.length} 已填写</small></summary>
    {(section === 'education' || section === 'work' || section === 'project') && <p className="section-note">当前支持编辑并匹配首条记录；页面上的重复经历仍需手动新增。</p>}
    <Fields fields={primary} values={values} onChange={onChange} />
    {international.length > 0 && <details className="international-fields"><summary>国际申请信息</summary><p>姓、名及拼音仅在国际申请场景使用。</p><Fields fields={international} values={values} onChange={onChange} /></details>}
  </details>;
}
