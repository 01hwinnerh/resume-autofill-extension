import { inferApplicationIdentity, isSpecificApplicationRole } from './application-identity';

export interface ApplicationCandidate {
  id: string;
  company: string;
  role: string;
  url: string;
  status: string;
}

const POSITIVE_STATUS = /(?:网申成功|已投递|投递成功|申请成功)/i;
const NEGATIVE_STATUS = /(?:已结束|已撤销|未提交|草稿)/i;
const ACTIVE_BATCH = /(?:进行中|正在进行)/i;
const ENDED_BATCH = /(?:已结束|已关闭|历史批次)/i;
const ITEM_SELECTOR = [
  '[role="listitem"]', 'li', 'article', '[data-job-id]', '[data-position-id]', '[data-recruitment-id]',
  '[data-testid*="job"]', '[data-testid*="position"]', '[class~="card"]', '[class*="-card"]',
].join(',');
const TITLE_SELECTOR = [
  '[data-job-title]', '[data-position-title]', '[itemprop="title"]',
  'h1', 'h2', 'h3', 'h4', '[role="heading"]', 'a[href]',
].join(',');

function clean(value?: string | null): string { return value?.replace(/\s+/g, ' ').trim() ?? ''; }
function stableId(candidate: Pick<ApplicationCandidate, 'role' | 'url'>, index: number): string {
  return `${candidate.url || candidate.role}\u0000${index}`;
}
function closestBatchText(element: Element): string {
  let current: Element | null = element.parentElement;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
    const ownHeading = current.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > [role="heading"], :scope > header');
    const text = clean(ownHeading?.textContent);
    if (ACTIVE_BATCH.test(text) || ENDED_BATCH.test(text)) return text;
  }
  return '';
}
function titleFromItem(item: Element): string {
  const explicit = clean(item.getAttribute('data-job-title') || item.getAttribute('data-position-title'));
  if (isSpecificApplicationRole(explicit)) return explicit;
  for (const element of item.querySelectorAll<HTMLElement>(TITLE_SELECTOR)) {
    const text = clean(element.getAttribute('data-job-title') || element.getAttribute('data-position-title') || element.textContent);
    if (text.length <= 100 && !POSITIVE_STATUS.test(text) && !NEGATIVE_STATUS.test(text) && isSpecificApplicationRole(text)) return text;
  }
  const chunks = clean(item.textContent).split(/(?=网申成功|已投递|投递成功|申请成功)/)[0]!.split(/[\n|｜·]/).map(clean);
  return chunks.find((text) => text.length <= 100 && isSpecificApplicationRole(text)) ?? '';
}
function linkFromItem(item: Element, baseUrl: string): string {
  const links = [...item.querySelectorAll<HTMLAnchorElement>('a[href]')];
  for (const link of links) {
    try {
      const url = new URL(link.getAttribute('href') ?? '', baseUrl);
      if (/^https?:$/.test(url.protocol) && !/(personal|center|application|delivery|record)/i.test(url.pathname)) return url.href;
    } catch { /* Ignore malformed links. */ }
  }
  return '';
}
function companyFor(document: Document, url: string): string {
  const hostname = new URL(url).hostname;
  if (/(?:^|\.)meituan\.com$|(?:^|\.)dianping\.com$/i.test(hostname)) return '美团';
  return inferApplicationIdentity({ url, host: new URL(url).host, title: document.title, metadata: {
    siteName: document.querySelector<HTMLMetaElement>('meta[property="og:site_name"],meta[name="application-name"]')?.content,
  } }).company;
}

/** Extracts successful application rows without invoking or depending on the form-field scanner. */
export function extractApplicationCandidates(document: Document, pageUrl = document.location?.href ?? ''): ApplicationCandidate[] {
  if (!/^https?:/i.test(pageUrl)) return [];
  const company = companyFor(document, pageUrl);
  const seen = new Set<string>();
  const ranked: Array<ApplicationCandidate & { rank: number }> = [];
  for (const item of document.querySelectorAll(ITEM_SELECTOR)) {
    const text = clean(item.textContent);
    if (!POSITIVE_STATUS.test(text) || NEGATIVE_STATUS.test(text)) continue;
    const batch = closestBatchText(item);
    if (ENDED_BATCH.test(batch) && !ACTIVE_BATCH.test(batch)) continue;
    const role = titleFromItem(item);
    if (!role || !isSpecificApplicationRole(role)) continue;
    const url = linkFromItem(item, pageUrl);
    const key = `${role.toLocaleLowerCase()}\u0000${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const status = clean(text.match(POSITIVE_STATUS)?.[0]);
    ranked.push({ id: stableId({ role, url }, ranked.length), company, role, url, status, rank: ACTIVE_BATCH.test(batch) ? 2 : 1 });
  }
  return ranked.sort((left, right) => right.rank - left.rank).map(({ rank: _rank, ...candidate }) => candidate);
}
