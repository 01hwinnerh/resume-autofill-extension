import type { ApplicationPageMetadata, ScanPageInfo } from '../shared/form';

export interface ApplicationIdentity {
  company: string;
  role: string;
}

function clean(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

const GENERIC_PLATFORM_NAMES = new Set([
  'jobs', 'job', 'careers', 'career', 'recruit', 'campus', 'apply',
  'greenhouse', 'lever', 'workday', 'myworkdayjobs', 'smartrecruiters', 'ashbyhq',
  'workable', 'taleo', 'icims', 'indeed', 'linkedin', 'boss', 'zhipin',
]);

function companyCandidate(value?: string): string {
  const candidate = clean(value);
  return GENERIC_PLATFORM_NAMES.has(candidate.toLowerCase()) ? '' : candidate;
}

function hostCompany(url: string): string {
  const hostname = new URL(url).hostname.replace(/^www\./i, '');
  if (hostname === 'localhost' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return '';
  const parts = hostname.split('.');
  const domainParts = parts.at(-1)?.length === 2 && ['co', 'com', 'org', 'net'].includes(parts.at(-2) ?? '')
    ? parts.slice(0, -2)
    : parts.slice(0, -1);
  return domainParts.find((part) => !GENERIC_PLATFORM_NAMES.has(part.toLowerCase())) ?? '';
}

const GENERIC_ROLE_NAMES = new Set([
  '职位详情', '职位申请', '加入我们', '招聘', '个人中心', '用户中心', '投递中心', '投递记录',
  '我的申请', '我的投递', '申请记录', '职位列表', '岗位列表', 'applications', 'application',
  'job details', 'jobs', 'careers', 'apply',
]);

export function isSpecificApplicationRole(value?: string): boolean {
  const candidate = clean(value);
  if (!candidate || candidate.length < 2 || GENERIC_ROLE_NAMES.has(candidate.toLowerCase())) return false;
  return !/^(?:个人中心|投递记录|我的申请|我的投递|职位详情|职位列表|岗位列表)(?:[\s｜|\-—].*)?$/i.test(candidate);
}

export function isSpecificApplicationCompany(value?: string): boolean {
  const candidate = companyCandidate(value);
  return Boolean(candidate) && !/^(?:招聘网站|招聘平台|公司|企业)$/.test(candidate);
}

function roleCandidate(value?: string): string {
  const candidate = clean(value);
  return isSpecificApplicationRole(candidate) ? candidate : '';
}

function cleanTitle(value: string): string {
  return clean(value)
    .replace(/\s*[-|｜]\s*(招聘|职位|校园招聘|社会招聘|Careers?|Jobs?).*$/i, '')
    .replace(/\s*[-|｜]\s*[^-|｜]+$/i, '')
    .trim();
}

export function inferApplicationIdentity(page: ScanPageInfo): ApplicationIdentity {
  const metadata = page.metadata;
  const company = companyCandidate(metadata?.companyName) || companyCandidate(metadata?.siteName) || hostCompany(page.url);
  const role = roleCandidate(metadata?.jobTitle) || roleCandidate(metadata?.heading) || roleCandidate(cleanTitle(page.title));
  return { company, role };
}

function jobPosting(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = jobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (types.some((type) => String(type).toLowerCase() === 'jobposting')) return record;
  return jobPosting(record['@graph']);
}

export function extractApplicationMetadata(document: Document): ApplicationPageMetadata | undefined {
  let structured: Record<string, unknown> | undefined;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      structured = jobPosting(JSON.parse(script.textContent || 'null'));
      if (structured) break;
    } catch {
      // Ignore malformed third-party metadata.
    }
  }
  const organization = structured?.hiringOrganization;
  const companyName = organization && typeof organization === 'object'
    ? clean(String((organization as Record<string, unknown>).name ?? ''))
    : '';
  const metadata: ApplicationPageMetadata = {
    jobTitle: clean(typeof structured?.title === 'string' ? structured.title : ''),
    companyName,
    siteName: clean(document.querySelector<HTMLMetaElement>('meta[property="og:site_name"],meta[name="application-name"]')?.content),
    heading: clean(document.querySelector('h1')?.textContent ?? ''),
  };
  return Object.values(metadata).some(Boolean) ? metadata : undefined;
}
