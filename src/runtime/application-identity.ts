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

function roleCandidate(value?: string): string {
  const candidate = clean(value);
  const generic = new Set(['职位详情', '职位申请', '加入我们', '招聘', 'job details', 'apply']);
  return generic.has(candidate.toLowerCase()) ? '' : candidate;
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
  const role = roleCandidate(metadata?.jobTitle) || roleCandidate(metadata?.heading) || cleanTitle(page.title);
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
