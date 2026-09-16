import { describe, expect, it } from 'vitest';
import { extractApplicationMetadata, inferApplicationIdentity } from '../../../src/runtime/application-identity';

describe('application identity', () => {
  it('prefers JobPosting structured metadata', () => {
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: '前端工程师', hiringOrganization: { name: '示例科技' } })}</script>`;
    document.body.innerHTML = '<h1>职位详情</h1>';
    const metadata = extractApplicationMetadata(document);
    expect(metadata).toMatchObject({ jobTitle: '前端工程师', companyName: '示例科技', heading: '职位详情' });
    expect(inferApplicationIdentity({ url: 'https://jobs.example.com/1', host: 'jobs.example.com', title: '旧标题', metadata })).toEqual({ company: '示例科技', role: '前端工程师' });
  });

  it('does not infer local or generic recruiting hosts as company names', () => {
    expect(inferApplicationIdentity({ url: 'http://127.0.0.1:4173/component-ats.html', host: '127.0.0.1:4173', title: 'Component ATS Fixture' })).toEqual({ company: '', role: 'Component ATS Fixture' });
    expect(inferApplicationIdentity({ url: 'https://jobs.lever.co/apply', host: 'jobs.lever.co', title: 'Frontend Engineer' })).toEqual({ company: '', role: 'Frontend Engineer' });
  });

  it('uses site and heading metadata before host and document title', () => {
    expect(inferApplicationIdentity({
      url: 'https://jobs.example.com/apply', host: 'jobs.example.com', title: '招聘网站',
      metadata: { siteName: '示例公司', heading: '产品经理' },
    })).toEqual({ company: '示例公司', role: '产品经理' });
  });
});
