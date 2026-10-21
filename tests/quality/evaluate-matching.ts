import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { ByteDanceJobsAdapter } from '../../src/adapters/bytedance-jobs-adapter';
import { scanDocument, toDescriptor } from '../../src/form-engine/scanner';
import { resolveMatches } from '../../src/matching/resolve-match';
import type { FieldMatch, PageFieldDescriptor } from '../../src/shared/form';
import type { Profile, ProfileField } from '../../src/shared/profile';
import { experienceDefinitions, PROFILE_FIELDS } from '../../src/ui/profile-fields';
import { MATCHING_CORPUS, type ExpectedField } from './matching-corpus';

type EvaluationMode = 'scanner+matcher' | 'matcher-only';
interface EvaluatedField { expected: ExpectedField; actual: FieldMatch }
interface Metrics {
  fixtureVersions: string[];
  annotatedFields: number;
  recognizedFields: number;
  correctProfileKey: number;
  wrongProfileKey: number;
  falsePositives: number;
  unrecognized: number;
  missingProfile: number;
  needsConfirmation: number;
  autoUsable: number;
  profileKeyAccuracy: number;
  autoUsableCoverage: number;
}
interface Thresholds {
  minimums: Pick<Metrics, 'annotatedFields' | 'recognizedFields' | 'correctProfileKey' | 'profileKeyAccuracy' | 'autoUsableCoverage'>;
  maximums: Pick<Metrics, 'wrongProfileKey' | 'falsePositives' | 'unrecognized'>;
}
interface Baseline {
  corpusSchemaVersion: number;
  scannerAndMatcher: Thresholds;
  matcherOnly: Thresholds;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, '../fixtures');
const baselinePath = resolve(here, 'matching-baseline.json');
const omittedProfileKeys = new Set(['links.linkedin', 'links.portfolio']);

function profileValue(field: { type: ProfileField['type'] }): ProfileField['value'] {
  if (field.type === 'boolean') return true;
  if (field.type === 'number') return 1;
  if (field.type === 'multiselect') return ['fixture'];
  return field.type === 'date' ? '2026-01' : 'fixture';
}

function evaluationProfile(): Profile {
  const definitions = [...PROFILE_FIELDS, ...experienceDefinitions('education', 1)];
  return {
    schemaVersion: 1,
    fields: Object.fromEntries(definitions.filter((item) => !omittedProfileKeys.has(item.key)).map((item) => [item.key, {
      key: item.key, label: item.label, type: item.type, policy: item.policy, value: profileValue(item),
    }])),
  };
}

function installDomGlobals(window: JSDOM['window']): () => void {
  const names = ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLLabelElement', 'Document', 'ShadowRoot'] as const;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const name of names) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
  }
  return () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

async function fixtureFields(fixture: string, url: string, expected: ExpectedField[]): Promise<PageFieldDescriptor[]> {
  const html = await readFile(resolve(fixtureRoot, fixture), 'utf8');
  const dom = new JSDOM(html, { url });
  const restore = installDomGlobals(dom.window);
  try {
    const scanned = scanDocument(dom.window.document, { url, host: dom.window.location.host, title: dom.window.document.title, framePath: [] });
    const selected = expected.map((annotation) => {
      const element = dom.window.document.querySelector(annotation.selector!);
      if (!element) throw new Error(`${fixture}: selector not found: ${annotation.selector}`);
      const runtimeField = scanned.find((candidate) => candidate.elements.includes(element as HTMLElement));
      if (!runtimeField) throw new Error(`${fixture}: annotated control was not scanned: ${annotation.selector}`);
      return toDescriptor(runtimeField);
    });
    if (scanned.length !== expected.length) {
      const annotated = new Set(selected.map((item) => item.fieldId));
      const extras = scanned.filter((item) => !annotated.has(item.fieldId)).map((item) => `${item.label} (${item.htmlId ?? item.name ?? item.fieldId})`);
      throw new Error(`${fixture}: expected ${expected.length} annotations for ${scanned.length} scanned fields; unannotated: ${extras.join(', ')}`);
    }
    return selected;
  } finally {
    restore();
    dom.window.close();
  }
}

function compareField(fixtureId: string, expected: ExpectedField, actual: FieldMatch, failures: string[]): void {
  if (actual.selected?.profileKey !== expected.profileKey) failures.push(`${fixtureId} ${expected.selector ?? expected.descriptor?.fieldId}: profileKey expected ${String(expected.profileKey)}, got ${String(actual.selected?.profileKey)}`);
  if (actual.status !== expected.status) failures.push(`${fixtureId} ${expected.selector ?? expected.descriptor?.fieldId}: status expected ${expected.status}, got ${actual.status}`);
  if (actual.descriptor.sectionIndex !== expected.sectionIndex) failures.push(`${fixtureId} ${expected.selector ?? expected.descriptor?.fieldId}: sectionIndex expected ${String(expected.sectionIndex)}, got ${String(actual.descriptor.sectionIndex)}`);
}

function metricsFor(fixtureVersions: string[], fields: EvaluatedField[]): Metrics {
  const expectedMapped = fields.filter(({ expected }) => expected.profileKey !== undefined);
  const correct = expectedMapped.filter(({ expected, actual }) => expected.profileKey === actual.selected?.profileKey).length;
  const autoUsable = fields.filter(({ actual }) => actual.status === 'matched').length;
  return {
    fixtureVersions,
    annotatedFields: fields.length,
    recognizedFields: fields.filter(({ actual }) => actual.selected !== undefined).length,
    correctProfileKey: correct,
    wrongProfileKey: expectedMapped.length - correct,
    falsePositives: fields.filter(({ expected, actual }) => expected.profileKey === undefined && actual.selected !== undefined).length,
    unrecognized: fields.filter(({ actual }) => actual.status === 'unrecognized').length,
    missingProfile: fields.filter(({ actual }) => actual.status === 'missing_profile').length,
    needsConfirmation: fields.filter(({ actual }) => actual.status === 'needs_confirmation').length,
    autoUsable,
    profileKeyAccuracy: expectedMapped.length ? correct / expectedMapped.length : 1,
    autoUsableCoverage: fields.length ? autoUsable / fields.length : 1,
  };
}

function validate(mode: EvaluationMode, metrics: Metrics, thresholds: Thresholds, failures: string[]): void {
  for (const [key, minimum] of Object.entries(thresholds.minimums) as Array<[keyof Thresholds['minimums'], number]>) {
    if (metrics[key] < minimum) failures.push(`${mode} baseline minimum ${key}=${minimum}, got ${metrics[key]}`);
  }
  for (const [key, maximum] of Object.entries(thresholds.maximums) as Array<[keyof Thresholds['maximums'], number]>) {
    if (metrics[key] > maximum) failures.push(`${mode} baseline maximum ${key}=${maximum}, got ${metrics[key]}`);
  }
}

function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function printMetrics(label: string, metrics: Metrics): void {
  console.log(`\n${label}: ${metrics.fixtureVersions.join(', ')}`);
  console.table({
    annotated_fields: metrics.annotatedFields, recognized_fields: metrics.recognizedFields, correct_profile_key: metrics.correctProfileKey,
    wrong_profile_key: metrics.wrongProfileKey, false_positives: metrics.falsePositives, unrecognized: metrics.unrecognized,
    missing_profile: metrics.missingProfile, needs_confirmation: metrics.needsConfirmation, auto_usable: metrics.autoUsable,
    profile_key_accuracy: percent(metrics.profileKeyAccuracy), auto_usable_coverage: percent(metrics.autoUsableCoverage),
  });
}

async function main(): Promise<void> {
  const profile = evaluationProfile();
  const failures: string[] = [];
  const results: Record<EvaluationMode, EvaluatedField[]> = { 'scanner+matcher': [], 'matcher-only': [] };
  const versions: Record<EvaluationMode, string[]> = { 'scanner+matcher': [], 'matcher-only': [] };

  for (const fixture of MATCHING_CORPUS) {
    const mode = fixture.evaluationMode ?? 'scanner+matcher';
    if (mode === 'scanner+matcher' && !fixture.fixture) throw new Error(`${fixture.id}: scanner+matcher corpus entry requires an HTML fixture`);
    if (mode === 'matcher-only' && fixture.fixture) throw new Error(`${fixture.id}: matcher-only corpus entry must not claim HTML scanner coverage`);
    const url = fixture.pageContext.url ?? `https://${fixture.pageContext.host}${fixture.pageContext.path}`;
    const fields = fixture.fixture ? await fixtureFields(fixture.fixture, url, fixture.fields) : fixture.fields.map((item) => item.descriptor!);
    const adapterHints = fixture.adapter === 'bytedance-jobs' ? new ByteDanceJobsAdapter().discoverHints(fields) : undefined;
    const matches = resolveMatches(fields, profile, { mappings: [], pageContext: fixture.pageContext, adapterHints });
    fixture.fields.forEach((expected, index) => {
      compareField(`${fixture.id}@${fixture.version}`, expected, matches[index], failures);
      results[mode].push({ expected, actual: matches[index] });
    });
    versions[mode].push(`${fixture.id}@${fixture.version}`);
  }

  const scannerAndMatcher = metricsFor(versions['scanner+matcher'], results['scanner+matcher']);
  const matcherOnly = metricsFor(versions['matcher-only'], results['matcher-only']);
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline;
  validate('scanner+matcher', scannerAndMatcher, baseline.scannerAndMatcher, failures);
  validate('matcher-only', matcherOnly, baseline.matcherOnly, failures);

  console.log('Matching fixture regression (synthetic fixtures; not production accuracy)');
  printMetrics('Scanner + matcher HTML fixtures', scannerAndMatcher);
  printMetrics('Matcher-only descriptor fixtures (descriptor-only; no scanner coverage)', matcherOnly);
  if (failures.length) throw new Error(`Matching regression failed:\n- ${failures.join('\n- ')}`);
}

await main();
