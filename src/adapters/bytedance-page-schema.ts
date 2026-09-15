const LABEL_ATTRIBUTE = 'data-resume-autofill-schema-label';
const SECTION_ATTRIBUTE = 'data-resume-autofill-schema-section';
const SECTION_INDEX_ATTRIBUTE = 'data-resume-autofill-section-index';
const SOURCE_ATTRIBUTE = 'data-resume-autofill-semantic-source';

interface SchemaNode {
  attributes?: {
    i18n_name?: string;
    name?: { zh_cn?: string; en_us?: string };
    field_type?: { name?: string; type?: string };
  };
  children?: SchemaNode[];
}

interface WebsiteInfo {
  website_info?: {
    resume_form_schema?: { object_list?: SchemaNode[] };
  };
}

interface SchemaField {
  fieldName: string;
  label: string;
  sectionName?: string;
  sectionLabel?: string;
  type?: string;
}

const GROUP_ALIASES: Record<string, string> = {
  basic_info: 'basic_info',
  education: 'education_list', educations: 'education_list', education_list: 'education_list',
  career: 'career_list', careers: 'career_list', career_list: 'career_list',
  internship: 'internship_list', internships: 'internship_list', internship_list: 'internship_list',
  project: 'project_list', projects: 'project_list', project_list: 'project_list',
  works: 'works_list', works_list: 'works_list',
  award: 'award_list', awards: 'award_list', award_list: 'award_list',
  language: 'language_list', languages: 'language_list', language_list: 'language_list',
  sns: 'sns_list', sns_list: 'sns_list',
  competition: 'competition_list', competitions: 'competition_list', competition_list: 'competition_list',
  certificate: 'certificate_list', certificates: 'certificate_list', certificate_list: 'certificate_list',
  self_evaluation: 'self_evaluation',
};

const FIELD_ALIASES: Record<string, string> = {
  position: 'title',
  major: 'field_of_study',
  time_period: 'start_end_time',
  preferred_cities: 'preferred_city_list',
  resume_attachment: 'attachment_resume',
  description: 'desc',
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function schemaFields(document: Document): SchemaField[] {
  const script = document.getElementById('js-websiteInfo');
  if (!script?.textContent) return [];
  try {
    const websiteInfo = JSON.parse(script.textContent) as WebsiteInfo;
    const result: SchemaField[] = [];
    const visit = (nodes: SchemaNode[], section?: Pick<SchemaField, 'sectionName' | 'sectionLabel'>) => {
      for (const node of nodes) {
        const fieldType = node.attributes?.field_type;
        const label = text(node.attributes?.i18n_name)
          ?? text(node.attributes?.name?.zh_cn)
          ?? text(node.attributes?.name?.en_us);
        const fieldName = text(fieldType?.name);
        if (!fieldName || !label) continue;
        if (fieldType?.type === 'group') {
          visit(node.children ?? [], { sectionName: fieldName, sectionLabel: label });
        } else {
          result.push({ fieldName, label, type: fieldType?.type, ...section });
          visit(node.children ?? [], section);
        }
      }
    };
    visit(websiteInfo.website_info?.resume_form_schema?.object_list ?? []);
    return result;
  } catch {
    return [];
  }
}

function pathTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === 'string' || typeof item === 'number' ? [String(item)] : []);
  }
  if (typeof value !== 'string') return [];
  return value.replace(/\[(?:"|')?([^\]"']+)(?:"|')?\]/g, '.$1').split('.').map((part) => part.trim()).filter(Boolean);
}

function reactFieldPath(element: HTMLElement): string[] {
  const propertyNames = Object.getOwnPropertyNames(element);
  const propKeys = propertyNames.filter((key) => key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$'));
  const fiberKey = propertyNames.find((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
  const candidates: unknown[] = [];
  for (const key of propKeys) {
    const props = (element as unknown as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
    const field = props?.['data-__field'] as { name?: unknown } | undefined;
    const meta = props?.['data-__meta'] as { name?: unknown } | undefined;
    candidates.push(field?.name, meta?.name, props?.name);
  }
  let fiber = fiberKey
    ? (element as unknown as Record<string, unknown>)[fiberKey] as { memoizedProps?: Record<string, unknown>; return?: unknown } | undefined
    : undefined;
  for (let depth = 0; fiber && depth < 12; depth += 1) {
    const props = fiber.memoizedProps;
    const field = props?.['data-__field'] as { name?: unknown } | undefined;
    const meta = props?.['data-__meta'] as { name?: unknown } | undefined;
    candidates.push(field?.name, meta?.name, props?.name);
    fiber = fiber.return as typeof fiber;
  }
  return candidates.map(pathTokens).find((tokens) => tokens.length > 0) ?? [];
}

function schemaMatch(fields: SchemaField[], tokens: string[]): SchemaField | undefined {
  const normalized = tokens.map((token) => token.toLowerCase());
  const sectionName = normalized.map((token) => GROUP_ALIASES[token]).find(Boolean);
  const fieldNames = normalized.map((token) => FIELD_ALIASES[token] ?? token);
  const scoped = sectionName ? fields.filter((field) => field.sectionName === sectionName) : fields;
  const matches = scoped.filter((field) => fieldNames.includes(field.fieldName));
  if (matches.length === 1) return matches[0];
  if (!sectionName) {
    const globalMatches = fields.filter((field) => fieldNames.includes(field.fieldName));
    if (globalMatches.length === 1) return globalMatches[0];
  }
  return undefined;
}

function dateRangeLabel(match: SchemaField, tokens: string[]): string {
  if (match.type !== 'date_range') return match.label;
  const normalized = tokens.map((token) => token.toLowerCase());
  const fieldPosition = normalized.findIndex((token) => (FIELD_ALIASES[token] ?? token) === match.fieldName);
  const endpointTokens = fieldPosition >= 0 ? normalized.slice(fieldPosition + 1) : [];
  if (endpointTokens.some((token) => /^(start|start_time|start_date|begin|from|0)$/.test(token))) return '开始时间';
  if (endpointTokens.some((token) => /^(end|end_time|end_date|finish|to|1)$/.test(token))) return '结束时间';
  return match.label;
}

function repeatedIndex(tokens: string[]): number | undefined {
  const groupPosition = tokens.findIndex((token) => GROUP_ALIASES[token.toLowerCase()] !== undefined);
  if (groupPosition < 0) return undefined;
  const value = tokens.slice(groupPosition + 1).find((token) => /^\d+$/.test(token));
  return value === undefined ? undefined : Number(value);
}

export function annotateByteDancePage(document: Document, pageUrl = document.defaultView?.location.href): number {
  if (!pageUrl) return 0;
  const location = new URL(pageUrl);
  if (location.host !== 'jobs.bytedance.com' || !/\/resume\/[^/]+\/apply(?:\/|$)/.test(location.pathname)) return 0;
  const fields = schemaFields(document);
  if (!fields.length) return 0;
  let annotated = 0;
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select'))) {
    try {
      const tokens = reactFieldPath(element);
      if (!tokens.length) continue;
      const match = schemaMatch(fields, tokens);
      if (!match) continue;
      element.setAttribute(LABEL_ATTRIBUTE, dateRangeLabel(match, tokens));
      if (match.sectionLabel) element.setAttribute(SECTION_ATTRIBUTE, match.sectionLabel);
      const index = repeatedIndex(tokens);
      if (index !== undefined) element.setAttribute(SECTION_INDEX_ATTRIBUTE, String(index));
      element.setAttribute(SOURCE_ATTRIBUTE, 'bytedance-schema');
      annotated += 1;
    } catch {
      // A single framework-owned element must not prevent the rest of the form from being enriched.
    }
  }
  return annotated;
}
