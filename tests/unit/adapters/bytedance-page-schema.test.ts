import { beforeEach, describe, expect, it } from 'vitest';

import { annotateByteDancePage } from '../../../src/adapters/bytedance-page-schema';
import { scanDocument } from '../../../src/form-engine/scanner';

const pageUrl = 'https://jobs.bytedance.com/campus/resume/123/apply';
const context = { url: pageUrl, host: 'jobs.bytedance.com', title: '申请', framePath: [] };

function schemaScript(): string {
  return JSON.stringify({
    website_info: {
      resume_form_schema: {
        object_list: [
          {
            attributes: { i18n_name: '基本信息', field_type: { name: 'basic_info', type: 'group' } },
            children: [
              { attributes: { i18n_name: '姓名', field_type: { name: 'name', type: 'text' } }, children: [] },
            ],
          },
          {
            attributes: { i18n_name: '教育经历', field_type: { name: 'education_list', type: 'group' } },
            children: [
              { attributes: { i18n_name: '学校名称', field_type: { name: 'school', type: 'text' } }, children: [] },
              { attributes: { i18n_name: '起止时间', field_type: { name: 'start_end_time', type: 'date_range' } }, children: [] },
            ],
          },
          {
            attributes: { i18n_name: '项目经历', field_type: { name: 'project_list', type: 'group' } },
            children: [
              { attributes: { i18n_name: '项目名称', field_type: { name: 'name', type: 'text' } }, children: [] },
            ],
          },
        ],
      },
    },
  });
}

function attachReactField(element: HTMLElement, name: string | Array<string | number>): void {
  Object.defineProperty(element, '__reactEventHandlers$fixture', {
    configurable: true,
    value: { 'data-__field': { name } },
  });
}

describe('ByteDance page schema enrichment', () => {
  beforeEach(() => {
    document.head.innerHTML = `<script id="js-websiteInfo" type="text/json">${schemaScript()}</script>`;
    document.body.innerHTML = `
      <input id="name-field" />
      <input id="school-0" />
      <input id="start-0" />
      <input id="end-0" />
      <input id="school-1" />
    `;
  });

  it('uses React field paths to attach schema labels, sections, and repeated indexes', () => {
    attachReactField(document.querySelector('#name-field')!, 'basic_info.name');
    attachReactField(document.querySelector('#school-0')!, ['education', 0, 'school']);
    attachReactField(document.querySelector('#start-0')!, ['education', 0, 'time_period', 'start']);
    attachReactField(document.querySelector('#end-0')!, ['education', 0, 'time_period', 'end']);
    attachReactField(document.querySelector('#school-1')!, ['education', 1, 'school']);

    expect(annotateByteDancePage(document, pageUrl)).toBe(5);

    const fields = scanDocument(document, context);
    expect(fields.map((field) => ({
      label: field.label,
      sectionLabel: field.sectionLabel,
      sectionIndex: field.sectionIndex,
      semanticSource: field.semanticSource,
    }))).toEqual([
      { label: '姓名', sectionLabel: '基本信息', sectionIndex: undefined, semanticSource: 'bytedance-schema' },
      { label: '学校名称', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'bytedance-schema' },
      { label: '开始时间', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'bytedance-schema' },
      { label: '结束时间', sectionLabel: '教育经历', sectionIndex: 0, semanticSource: 'bytedance-schema' },
      { label: '学校名称', sectionLabel: '教育经历', sectionIndex: 1, semanticSource: 'bytedance-schema' },
    ]);
  });

  it('leaves the generic scanner untouched for invalid schema and other sites', () => {
    document.querySelector('#js-websiteInfo')!.textContent = '{invalid';
    attachReactField(document.querySelector('#name-field')!, 'basic_info.name');
    expect(annotateByteDancePage(document, pageUrl)).toBe(0);
    expect(annotateByteDancePage(document, 'https://example.com/apply')).toBe(0);
    expect(document.querySelector('#name-field')!.hasAttribute('data-resume-autofill-schema-label')).toBe(false);
  });

  it('does not guess when a field name is ambiguous without a section path', () => {
    attachReactField(document.querySelector('#school-0')!, 'school');
    expect(annotateByteDancePage(document, pageUrl)).toBe(1);
    expect(document.querySelector('#school-0')!.getAttribute('data-resume-autofill-schema-label')).toBe('学校名称');

    attachReactField(document.querySelector('#name-field')!, 'name');
    expect(annotateByteDancePage(document, pageUrl)).toBe(1);
    expect(document.querySelector('#name-field')!.hasAttribute('data-resume-autofill-schema-label')).toBe(false);
  });
});
