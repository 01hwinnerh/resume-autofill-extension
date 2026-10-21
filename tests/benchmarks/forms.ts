import { performance } from 'node:perf_hooks';
import { JSDOM } from 'jsdom';
import { scanDocument, toDescriptor } from '../../src/form-engine/scanner';
import { resolveMatches } from '../../src/matching/resolve-match';
import type { Profile } from '../../src/shared/profile';
import { PROFILE_FIELDS } from '../../src/ui/profile-fields';

const sizes = [100, 300, 1000];
const roundsBySize = new Map([[100, 20], [300, 20], [1000, 20]]);
const warmupsBySize = new Map([[100, 3], [300, 3], [1000, 3]]);

function evaluationProfile(): Profile {
  return { schemaVersion: 1, fields: Object.fromEntries(PROFILE_FIELDS.map((item) => [item.key, {
    key: item.key, label: item.label, type: item.type, policy: item.policy,
    value: item.type === 'boolean' ? true : item.type === 'number' ? 1 : item.type === 'multiselect' ? ['fixture'] : 'fixture',
  }])) };
}

function markup(size: number): string {
  const aliases = [
    ['姓名', 'full_name'], ['电子邮箱', 'email'], ['手机号码', 'phone'], ['现居地', 'current_location'], ['期望职位', 'preferred_role'],
  ];
  const controls = Array.from({ length: size }, (_, index) => {
    const [label, name] = aliases[index % aliases.length];
    if (index % 5 === 0) return `<div><span>${label}</span><input id="f-${index}" name="${name}_${index}" aria-label="${label}" /></div>`;
    return `<label for="f-${index}">${label}<input id="f-${index}" name="${name}_${index}" /></label>`;
  }).join('');
  return `<!doctype html><html><body><form>${controls}</form></body></html>`;
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

function summary(values: number[]): { p50Ms: number; p95Ms: number; minMs: number; maxMs: number } {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (quantile: number) => sorted[Math.ceil(sorted.length * quantile) - 1];
  return {
    p50Ms: Number(percentile(0.5).toFixed(2)), p95Ms: Number(percentile(0.95).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)), maxMs: Number(sorted.at(-1)!.toFixed(2)),
  };
}

const profile = evaluationProfile();
for (const size of sizes) {
  // Fixture creation and global installation are one-time setup for this scale and are deliberately untimed.
  const dom = new JSDOM(markup(size), { url: 'https://benchmark.fixture.test/apply' });
  const restore = installDomGlobals(dom.window);
  const scanSamples: number[] = [];
  const matchingSamples: number[] = [];
  const totalSamples: number[] = [];
  const rounds = roundsBySize.get(size)!;
  const warmups = warmupsBySize.get(size)!;
  const scanContext = { url: dom.window.location.href, host: dom.window.location.host, title: dom.window.document.title, framePath: [] };
  const pageContext = { host: dom.window.location.host, path: dom.window.location.pathname };

  try {
    for (let round = 0; round < warmups + rounds; round += 1) {
      const scanStarted = performance.now();
      const fields = scanDocument(dom.window.document, scanContext).map(toDescriptor);
      const scanFinished = performance.now();
      resolveMatches(fields, profile, { mappings: [], pageContext });
      const matchingFinished = performance.now();
      if (round >= warmups) {
        scanSamples.push(scanFinished - scanStarted);
        matchingSamples.push(matchingFinished - scanFinished);
        totalSamples.push(matchingFinished - scanStarted);
      }
    }
  } finally {
    restore();
    dom.window.close();
  }

  console.log(JSON.stringify({ controls: size, rounds, scan: summary(scanSamples), matching: summary(matchingSamples), total: summary(totalSamples) }));
}
