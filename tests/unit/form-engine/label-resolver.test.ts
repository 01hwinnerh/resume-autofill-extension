import { describe, expect, it } from 'vitest';

import {
  resolveLabel,
  resolveSectionLabel,
} from '../../../src/form-engine/label-resolver';

describe('label resolver', () => {
  it('uses the first available semantic label source in the documented order', () => {
    document.body.innerHTML = `
      <label for="name">  Full   Name </label>
      <label>Outer label <input id="name" aria-label="Aria name" placeholder="Placeholder name" /></label>
      <input id="placeholder" placeholder="  Personal   Site " />
      <input id="fallback-id" name="Preferred_Name" />
      <input id="only-id" />
    `;

    expect(resolveLabel(document.querySelector('#name')!)).toBe('full name');
    expect(resolveLabel(document.querySelector('#placeholder')!)).toBe('personal site');
    expect(resolveLabel(document.querySelector('#fallback-id')!)).toBe('preferred_name');
    expect(resolveLabel(document.querySelector('#only-id')!)).toBe('only-id');
  });

  it('resolves aria-labelledby and component-library form labels', () => {
    document.body.innerHTML = `
      <span id="email-title">电子邮箱：</span><input id="aria-field" aria-labelledby="email-title" />
      <div class="semi-form-field">
        <div class="semi-form-field-label"><span class="semi-form-field-label-text">* 毕业院校：</span></div>
        <div class="semi-form-field-main"><input id="semi-field" /></div>
      </div>
      <div class="custom-form-item"><div class="custom-form-item-label">手机号码</div><input id="component-field" /></div>
      <div class="atsx-form-item">
        <div class="atsx-form-item-label"><label>学校名称：</label></div>
        <div class="atsx-form-item-control-wrapper"><div class="atsx-form-item-control"><span class="atsx-form-item-children"><input id="atsx-field" /></span></div></div>
      </div>
      <input id="schema-field" data-resume-autofill-schema-label="专业" />
    `;

    expect(resolveLabel(document.querySelector('#aria-field')!)).toBe('电子邮箱');
    expect(resolveLabel(document.querySelector('#semi-field')!)).toBe('毕业院校');
    expect(resolveLabel(document.querySelector('#component-field')!)).toBe('手机号码');
    expect(resolveLabel(document.querySelector('#atsx-field')!)).toBe('学校名称');
    expect(resolveLabel(document.querySelector('#schema-field')!)).toBe('专业');
  });

  it('preserves education semantics when splitting Formily date ranges', () => {
    document.body.innerHTML = `
      <div id="formily-item-education_list">
        <div data-form-field-name="start_end_time" data-form-field-i18n-name="起止时间">
          <input id="education-start" /><input id="education-end" />
        </div>
      </div>
      <div id="formily-item-career_list">
        <div data-form-field-name="start_end_time" data-form-field-i18n-name="起止时间">
          <input id="work-start" /><input id="work-end" />
        </div>
      </div>
    `;

    expect(resolveLabel(document.querySelector('#education-start')!)).toBe('入学时间');
    expect(resolveLabel(document.querySelector('#education-end')!)).toBe('毕业时间');
    expect(resolveLabel(document.querySelector('#work-start')!)).toBe('开始时间');
    expect(resolveLabel(document.querySelector('#work-end')!)).toBe('结束时间');
  });

  it('uses only explicit semantic section context', () => {
    document.body.innerHTML = `
      <fieldset><legend>  基本   信息 </legend><input id="legend-field" /></fieldset>
      <div role="group" title=" Contact   Details "><input id="group-field" /></div>
      <section><h2>  Work   History </h2><input id="section-field" /></section>
      <div>Unrelated parent copy <input id="plain-field" /></div>
      <div class="education-section"><div><h3>教育经历</h3></div><div class="semi-form-field"><input id="component-section-field" /></div></div>
    `;

    expect(resolveSectionLabel(document.querySelector('#legend-field')!)).toBe('基本 信息');
    expect(resolveSectionLabel(document.querySelector('#group-field')!)).toBe('contact details');
    expect(resolveSectionLabel(document.querySelector('#section-field')!)).toBe('work history');
    expect(resolveSectionLabel(document.querySelector('#plain-field')!)).toBeUndefined();
    expect(resolveSectionLabel(document.querySelector('#component-section-field')!)).toBe('教育经历');
  });
});
