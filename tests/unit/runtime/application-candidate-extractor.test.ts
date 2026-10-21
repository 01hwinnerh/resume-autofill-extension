import { beforeEach, describe, expect, it } from 'vitest';
import { extractApplicationCandidates } from '../../../src/runtime/application-candidate-extractor';

function meituanFixture(active: string, ended: string) {
  document.title = '我的申请 | 美团招聘';
  document.body.innerHTML = `
    <main>
      <section data-recruitment-state="active"><h2>2027 校园招聘 · 进行中</h2><ul>${active}</ul></section>
      <section data-recruitment-state="ended"><h2>2026 校园招聘 · 已结束</h2><ul>${ended}</ul></section>
    </main>`;
}
const row = (role: string, status: string, href = '') => `<li role="listitem" data-job-id="masked"><a ${href ? `href="${href}"` : ''}><h3>${role}</h3></a><span data-status>${status}</span></li>`;

describe('application candidate extractor', () => {
  beforeEach(() => { document.head.innerHTML = '<meta property="og:site_name" content="美团招聘">'; });

  it('selects only the successful job in the active Meituan batch', () => {
    meituanFixture(row('AI Agent开发工程师', '网申成功', '/jobs/agent'), row('历史后端工程师', '已投递') + row('历史产品经理', '申请成功'));
    expect(extractApplicationCandidates(document, 'https://zhaopin.meituan.com/applications')).toEqual([
      expect.objectContaining({ company: '美团', role: 'AI Agent开发工程师', status: '网申成功', url: 'https://zhaopin.meituan.com/jobs/agent' }),
    ]);
  });

  it('returns every active successful job for explicit selection', () => {
    meituanFixture(row('AI Agent开发工程师', '已投递') + row('前端开发工程师', '投递成功'), '');
    expect(extractApplicationCandidates(document, 'https://zhaopin.meituan.com/applications').map((item) => item.role)).toEqual(['AI Agent开发工程师', '前端开发工程师']);
  });

  it('returns no candidates for drafts, withdrawn and unsuccessful rows', () => {
    meituanFixture(row('算法工程师', '草稿') + row('产品经理', '已撤销') + row('测试工程师', '未提交'), '');
    expect(extractApplicationCandidates(document, 'https://zhaopin.meituan.com/applications')).toEqual([]);
  });
});
