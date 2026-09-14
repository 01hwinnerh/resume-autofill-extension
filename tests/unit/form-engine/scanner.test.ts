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

  it('converts runtime fields into serializable descriptors without DOM handles', () => {
    document.body.innerHTML = '<input id="phone" name="phone" value="13800138000" />';

    const descriptor = toDescriptor(scanDocument(document, context)[0]);

    expect('elements' in descriptor).toBe(false);
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });
});
