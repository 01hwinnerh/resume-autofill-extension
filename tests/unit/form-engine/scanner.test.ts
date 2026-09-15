import { describe, expect, it } from 'vitest';

import { scanDocument, toDescriptor } from '../../../src/form-engine/scanner';

const context = {
  url: 'http://localhost/form',
  host: 'localhost',
  title: 'Fixture',
  framePath: [0, 2],
};

describe('scanDocument', () => {
  it('scans supported controls, normalizes labels, and excludes unsafe input types', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>基本信息</legend>
        <label for="phone">联系电话</label>
        <input id="phone" name="phone" value="13800138000" autocomplete="tel" />
        <label> 邮箱地址 <input id="email" name="email" type="email" value="me@example.com" /></label>
        <input id="nickname" name="ignored" aria-label="昵称" value="小明" />
        <input id="portfolio" name="portfolio" placeholder="个人主页" />
        <textarea name="strengths" aria-label="个人优势">沟通能力</textarea>
        <label for="degree">学历</label>
        <select id="degree" name="degree"><option value="bachelor">本科</option><option value="master" selected>硕士</option><option value="senior">  Senior   Engineer  </option></select>
        <label><input id="terms" name="terms" type="checkbox" checked />同意条款</label>
        <label for="gender-male">男</label><input id="gender-male" name="gender" type="radio" value="male" aria-label="性别" />
        <label for="gender-female">女</label><input id="gender-female" name="gender" type="radio" value="female" aria-label="性别" checked />
        <input type="hidden" name="csrf" value="not-profile-data" />
        <input name="disabled" disabled value="skip" />
        <input type="password" name="secret" value="skip" />
        <input type="button" name="action" value="skip" />
      </fieldset>
    `;

    const fields = scanDocument(document, context);

    expect(fields).toHaveLength(8);
    expect(fields.map((field) => field.label)).toEqual([
      '联系电话',
      '邮箱地址',
      '昵称',
      '个人主页',
      '个人优势',
      '学历',
      '同意条款',
      '男',
    ]);
    expect(fields.map((field) => field.kind)).toEqual([
      'text', 'text', 'text', 'text', 'textarea', 'select', 'checkbox', 'radio',
    ]);
    expect(fields.map((field) => field.currentValue)).toEqual([
      '13800138000', 'me@example.com', '小明', '', '沟通能力', 'master', true, 'female',
    ]);
    expect(fields.every((field) => field.sectionLabel === '基本信息')).toBe(true);
    expect(fields.map((field) => field.fieldId)).toEqual([
      'field-1', 'field-2', 'field-3', 'field-4', 'field-5', 'field-6', 'field-7', 'field-8',
    ]);
    expect(fields[5].options).toEqual([
      { label: '本科', value: 'bachelor' },
      { label: '硕士', value: 'master' },
      { label: 'senior engineer', value: 'senior' },
    ]);
    expect(fields[7].options).toEqual([
      { label: '男', value: 'male' },
      { label: '女', value: 'female' },
    ]);
    expect(fields.slice(0, 7).every((field) => field.elements.length === 1)).toBe(true);
    expect(fields[7].elements.map((element) => element.id)).toEqual(['gender-male', 'gender-female']);
    expect(fields[0].fingerprint).toBe('text|联系电话|phone|基本信息|0.2');
  });

  it('represents an unchecked radio group with a null value', () => {
    document.body.innerHTML = `
      <input name="work-mode" type="radio" value="remote" aria-label="工作方式" />
      <input name="work-mode" type="radio" value="office" aria-label="工作方式" />
    `;

    const [field] = scanDocument(document, context);

    expect(field.currentValue).toBeNull();
    expect(field.elements).toHaveLength(2);
  });

  it('assigns one stable sectionIndex to every field in each repeated container without changing fingerprints', () => {
    document.body.innerHTML = `
      <fieldset><legend>教育经历</legend><label>学校<input name="school" /></label><label>专业<input name="major" /></label></fieldset>
      <fieldset><legend>教育经历</legend><label>学校<input name="school" /></label><label>专业<input name="major" /></label></fieldset>`;
    const fields = scanDocument(document, context);
    expect(fields.map((field) => field.sectionIndex)).toEqual([0, 0, 1, 1]);
    expect(fields[0].fingerprint).toBe(fields[2].fingerprint);
  });

  it('reads Formily field metadata, repeated cards, and date-range endpoints', () => {
    document.body.innerHTML = `
      <div id="formily-item-education_list">
        <div class="apply-form-array-card__fixture">
          <div data-form-field-id="school" data-form-field-name="school" data-form-field-i18n-name="学校名称" id="formily-item-school">
            <div class="ud-formily-item-control"><input class="ud__native-input" value="学校 A" /></div>
          </div>
          <div data-form-field-id="start_end_time" data-form-field-name="start_end_time" data-form-field-i18n-name="起止时间" id="formily-item-start_end_time">
            <input class="ud__native-input" value="2020-09" />
            <input class="ud__native-input" value="2024-06" />
          </div>
          <div data-form-field-id="degree" data-form-field-name="degree" data-form-field-i18n-name="学历" id="formily-item-degree">
            <input type="search" role="combobox" class="ud__select__selector__search__input ud__native-input" />
          </div>
        </div>
        <div class="apply-form-array-card__fixture">
          <div data-form-field-id="school" data-form-field-name="school" data-form-field-i18n-name="学校名称" id="formily-item-school">
            <input class="ud__native-input" value="学校 B" />
          </div>
        </div>
      </div>`;

    const fields = scanDocument(document, context);

    expect(fields.map((field) => ({
      kind: field.kind,
      label: field.label,
      name: field.name,
      sectionLabel: field.sectionLabel,
      sectionIndex: field.sectionIndex,
      semanticSource: field.semanticSource,
    }))).toEqual([
      { kind: 'text', label: '学校名称', name: 'school', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' },
      { kind: 'text', label: '开始时间', name: 'start_end_time', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' },
      { kind: 'text', label: '结束时间', name: 'start_end_time', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' },
      { kind: 'combobox', label: '学历', name: 'degree', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'formily-dom' },
      { kind: 'text', label: '学校名称', name: 'school', sectionLabel: '教育经历', sectionIndex: 1, semanticSource: 'formily-dom' },
    ]);
    expect(fields[0].htmlId).toBe('formily-item-school');
    expect(fields[1].fingerprint).not.toBe(fields[2].fingerprint);
  });

  it('resolves Formily work and project module labels', () => {
    document.body.innerHTML = `
      <div id="formily-item-career_list"><div class="apply-form-array-card__work"><div data-form-field-name="company" data-form-field-i18n-name="公司名称"><input /></div></div></div>
      <div id="formily-item-project_list"><div class="apply-form-array-card__project"><div data-form-field-name="name" data-form-field-i18n-name="项目名称"><input /></div></div></div>`;

    const fields = scanDocument(document, context);
    expect(fields.map((field) => [field.label, field.sectionLabel, field.sectionIndex])).toEqual([
      ['公司名称', '工作经历', 0],
      ['项目名称', '项目经历', 0],
    ]);
  });

  it('ignores controls inside inactive hidden steps', () => {
    document.body.innerHTML = `
      <label>姓名<input name="name" /></label>
      <section hidden><label>期望职位<input name="role" /></label></section>`;

    expect(scanDocument(document, context).map((field) => field.label)).toEqual(['姓名']);
  });

  it('converts runtime fields into serializable descriptors without DOM handles', () => {
    document.body.innerHTML = '<input id="phone" name="phone" value="13800138000" />';

    const descriptor = toDescriptor(scanDocument(document, context)[0]);

    expect('elements' in descriptor).toBe(false);
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });
});
