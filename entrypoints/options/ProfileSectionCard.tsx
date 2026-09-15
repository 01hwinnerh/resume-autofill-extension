import type { ProfileFieldDefinition, ProfileSection } from '../../src/ui/profile-fields';
import { PROFILE_SECTION_LABELS } from '../../src/ui/profile-fields';
import { ProfileValueInput } from '../../src/ui/ProfileValueInput';

const INTERNATIONAL_KEYS = new Set(['identity.firstName', 'identity.lastName', 'identity.namePinyin', 'identity.firstNamePinyin', 'identity.lastNamePinyin']);
type RecordAction = 'add' | 'copy' | 'up' | 'down' | 'delete';

function Fields({ fields, values, onChange }: { fields: ProfileFieldDefinition[]; values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return <div className="profile-grid">{fields.map((definition) => { const multiline = ['描述', '评价', '职责', '成果', '工作内容'].some((word) => definition.label.includes(word)); return <label key={definition.key} className={multiline ? 'wide' : ''}><span>{definition.label}{definition.policy === 'review' && <em>需确认</em>}</span><ProfileValueInput type={definition.type} value={values[definition.key] ?? ''} label={definition.label} multiline={multiline} onChange={(value) => onChange(definition.key, value)} /></label>; })}</div>;
}

export function ProfileSectionCard({ section, fields, values, onChange, onRecordAction, recordCount, defaultOpen = false }: {
  section: ProfileSection; fields: ProfileFieldDefinition[]; values: Record<string, string>; onChange: (key: string, value: string) => void;
  onRecordAction: (action: RecordAction, index: number) => void; recordCount?: number; defaultOpen?: boolean;
}) {
  const primary = section === 'basic' ? fields.filter((field) => !INTERNATIONAL_KEYS.has(field.key)) : fields;
  const international = section === 'basic' ? fields.filter((field) => INTERNATIONAL_KEYS.has(field.key)) : [];
  const repeatable = recordCount !== undefined;
  return <details className="profile-section" open={defaultOpen || repeatable}>
    <summary><span>{PROFILE_SECTION_LABELS[section]}</span><small>{repeatable ? `${recordCount} 条记录` : `${fields.filter((field) => values[field.key]?.trim()).length}/${fields.length} 已填写`}</small></summary>
    {repeatable ? <div className="experience-records">{Array.from({ length: recordCount }, (_, index) => { const recordFields = primary.filter((field) => field.key.includes(`.${index}.`)); return <article className="experience-record" key={index}><header><h3>{PROFILE_SECTION_LABELS[section]} {index + 1}</h3><div className="record-actions"><button type="button" aria-label={`复制${PROFILE_SECTION_LABELS[section]} ${index + 1}`} onClick={() => onRecordAction('copy', index)}>复制</button><button type="button" aria-label={`上移${PROFILE_SECTION_LABELS[section]} ${index + 1}`} disabled={index === 0} onClick={() => onRecordAction('up', index)}>↑</button><button type="button" aria-label={`下移${PROFILE_SECTION_LABELS[section]} ${index + 1}`} disabled={index === recordCount - 1} onClick={() => onRecordAction('down', index)}>↓</button><button type="button" className="danger" aria-label={`删除${PROFILE_SECTION_LABELS[section]} ${index + 1}`} onClick={() => onRecordAction('delete', index)}>删除</button></div></header><Fields fields={recordFields} values={values} onChange={onChange} /></article>; })}<button className="add-record" type="button" aria-label={`新增${PROFILE_SECTION_LABELS[section]}`} onClick={() => onRecordAction('add', recordCount)}>＋ 新增{PROFILE_SECTION_LABELS[section]}</button><p className="section-note">仅填写页面已存在的对应区块，不会自动点击招聘网站“新增经历”。</p></div> : <Fields fields={primary} values={values} onChange={onChange} />}
    {international.length > 0 && <details className="international-fields"><summary>国际申请信息</summary><p>姓、名及拼音仅在国际申请场景使用。</p><Fields fields={international} values={values} onChange={onChange} /></details>}
  </details>;
}
