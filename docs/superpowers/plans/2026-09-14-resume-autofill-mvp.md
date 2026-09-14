# 通用半自动简历投递扩展 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Chrome/Edge Manifest V3 extension that scans a recruitment form, proposes mappings to a user profile, fills only user-confirmed fields, and verifies the result without submitting the application.

**Architecture:** WXT provides the extension build and entrypoint lifecycle. React is used only for the options page and side panel; the scan, match, fill, verification, storage, and adapter contracts remain framework-independent TypeScript. The P0 runtime uses a generic form engine, an empty adapter registry with a stable contract, and local profile/mapping storage; real recruitment-platform adapters are a later, separately testable increment.

**Tech Stack:** WXT, React, TypeScript, Chrome Manifest V3, Vitest, Playwright, browser local storage, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-14-resume-autofill-extension-design.md`

## Global Constraints

- Target Chrome/Edge desktop browsers first and build a Manifest V3 extension.
- Use WXT for extension build and entrypoints, React + TypeScript for extension UI, pure TypeScript for the form engine, Vitest for unit tests, and Playwright for browser tests.
- P0 stores profile and mapping data locally and does not introduce a Node service, database, Redis, Python service, remote API, or AI dependency.
- Scanning must not mutate the page; filling requires an explicit user confirmation step.
- Fill only blank fields by default and never click the final application-submit action.
- Do not bypass CAPTCHA, SMS verification, login, OAuth, anti-automation controls, or file-picker security.
- User mappings have higher precedence than adapter rules, which have higher precedence than generic matching; unresolved ambiguity remains manual.
- React must not be imported into the content-script form engine.
- A failed field produces a field-level failure and must not discard successful fields.
- Do not put real personal values in fixtures, source code, tests, screenshots, or logs.
- AI is outside this plan and has no delivery date or dependency relationship with MVP.
- Every task ends with its own focused test run and Conventional Commit.

---

## File Map

The repository already contains the confirmed design document. P0 adds the following files without changing that document's confirmed boundaries:

```text
resume-autofill-extension/
├── entrypoints/
│   ├── background.ts
│   ├── form-runtime.ts
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── sidepanel/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
├── src/
│   ├── adapters/
│   ├── filling/
│   ├── form-engine/
│   ├── matching/
│   ├── profile/
│   ├── runtime/
│   ├── storage/
│   └── shared/
├── tests/
│   ├── e2e/
│   ├── fixtures/
│   └── unit/
├── docs/
│   ├── superpowers/plans/
│   └── superpowers/specs/
├── .gitignore
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vitest.config.ts
└── wxt.config.ts
```

Responsibility boundaries:

- `entrypoints/background.ts`: service-worker message routing, active-tab injection, and permission/error translation.
- `entrypoints/form-runtime.ts`: page-local scan/fill command handling; it is dynamically injected and must not run a scan or change fields before receiving an explicit command.
- `entrypoints/sidepanel/`: review, confirmation, result display, and current-tab actions.
- `entrypoints/options/`: profile editing and explicit mapping management.
- `src/shared/`: serializable contracts shared by extension contexts.
- `src/form-engine/`: DOM scanning, label normalization, fingerprints, and runtime field handles.
- `src/matching/`: generic dictionary matching, scoring, confidence, and status assignment.
- `src/filling/`: control-specific write operations and post-fill verification.
- `src/adapters/`: adapter interface, registry, generic fallback, and future platform modules.
- `src/storage/`: local storage ports and profile/mapping repositories.
- `src/runtime/`: message contracts and orchestration across background, side panel, and content script.
- `tests/fixtures/`: local recruitment-like pages only; no production submission flow.

### Task 1: Bootstrap the WXT extension shell

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `wxt.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `entrypoints/background.ts`
- Create: `entrypoints/form-runtime.ts`
- Create: `entrypoints/options/index.html`
- Create: `entrypoints/options/main.tsx`
- Create: `entrypoints/options/App.tsx`
- Create: `entrypoints/sidepanel/index.html`
- Create: `entrypoints/sidepanel/main.tsx`
- Create: `entrypoints/sidepanel/App.tsx`
- Test: `tests/unit/bootstrap/config.test.ts`

**Interfaces:**
- Produces the build commands `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm e2e` used by every later task.
- Produces a Chrome MV3 manifest containing `activeTab`, `scripting`, `storage`, and `sidePanel` permissions; no `<all_urls>` permission is added in P0.

- [ ] **Step 1: Create the implementation branch from the confirmed design history.**

Run:

```bash
git switch -c feat/resume-autofill-mvp
git status --short --branch
```

Expected: the new branch is based on the existing design commits; only previously observed environment `.DS_Store` files remain untracked.

- [ ] **Step 2: Initialize the package manifest and install only P0 dependencies.**

Run:

```bash
pnpm init
pnpm add react react-dom
pnpm add -D wxt @wxt-dev/module-react typescript @types/node @types/react @types/react-dom vitest jsdom @playwright/test @testing-library/react tsx
```

Expected: `package.json` and `pnpm-lock.yaml` are created; no backend or AI package is installed.

- [ ] **Step 3: Configure WXT and the React module.**

`wxt.config.ts` must contain the equivalent configuration:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Resume Autofill Assistant',
    description: 'Review-first form filling for job applications',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
  },
});
```

The manifest configuration must not include automatic form submission or broad permanent host access.

- [ ] **Step 4: Add scripts and ignore generated output.**

`package.json` must expose:

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "build:test": "WXT_ENV=test wxt build",
    "zip": "wxt zip",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "fixtures:serve": "tsx tests/fixtures/fixture-server.ts",
    "e2e": "playwright test"
  }
}
```

`.gitignore` must ignore `node_modules/`, `.output/`, `.wxt/`, `coverage/`, `playwright-report/`, `test-results/`, and `.DS_Store`.

- [ ] **Step 5: Add minimal buildable entrypoints.**

The two React entrypoints must mount a root element and render a plain text shell. `background.ts` and `form-runtime.ts` must register no page mutation at load time. The runtime file uses WXT's unlisted-script naming so it can be dynamically injected without a permanent `matches` or broad host permission.

- [ ] **Step 6: Add a test configuration that uses JSDOM only for unit tests.**

`vitest.config.ts` must set the test environment to `jsdom` and include `tests/unit/**/*.test.ts` and `tests/unit/**/*.test.tsx`. `playwright.config.ts` must reserve browser tests for `tests/e2e/**/*.spec.ts` and not start a production server.

- [ ] **Step 7: Run the shell checks before committing.**

Run:

```bash
pnpm typecheck
pnpm build
pnpm test -- tests/unit/bootstrap/config.test.ts
```

Expected: type checking, WXT build, and the bootstrap test pass; `.output/` and `.wxt/` are not staged.

- [ ] **Step 8: Commit the shell.**

```bash
git add .gitignore README.md wxt.config.ts vitest.config.ts playwright.config.ts package.json pnpm-lock.yaml entrypoints tests/unit/bootstrap
git diff --cached --check
git commit -m "chore(resume-autofill): bootstrap extension shell"
```

### Task 2: Define serializable domain contracts

**Files:**
- Create: `src/shared/profile.ts`
- Create: `src/shared/form.ts`
- Create: `src/shared/mapping.ts`
- Create: `src/shared/messages.ts`
- Test: `tests/unit/shared/profile.test.ts`
- Test: `tests/unit/shared/form.test.ts`
- Test: `tests/unit/shared/messages.test.ts`

**Interfaces:**
- Produces `Profile`, `ProfileField`, `FieldValue`, `PageFieldDescriptor`, `FieldMatch`, `ScanResult`, `UserFieldMapping`, and message discriminated unions used by later tasks.

The initial contracts must be equivalent to:

```ts
export type FieldValue = string | number | boolean | string[] | null;

export type ProfileFieldType =
  | 'text'
  | 'date'
  | 'number'
  | 'enum'
  | 'boolean'
  | 'multiselect';

export type FillPolicy = 'auto' | 'review' | 'never';

export interface ProfileField {
  key: string;
  label: string;
  type: ProfileFieldType;
  value: FieldValue;
  policy: FillPolicy;
}

export interface Profile {
  schemaVersion: 1;
  fields: Record<string, ProfileField>;
}
```

`PageFieldDescriptor` must contain a deterministic `fieldId`, `kind`, visible label, optional HTML metadata, options, current value, section label, frame path, and fingerprint. It must not contain an `HTMLElement`, because it is sent between extension contexts.

The descriptor and match shape must be equivalent to:

```ts
export interface PageFieldDescriptor {
  fieldId: string;
  kind: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';
  label: string;
  name?: string;
  htmlId?: string;
  placeholder?: string;
  ariaLabel?: string;
  autocomplete?: string;
  options: Array<{ label: string; value: string }>;
  currentValue: FieldValue;
  sectionLabel?: string;
  framePath: number[];
  fingerprint: string;
}

export interface MatchCandidate {
  profileKey: string;
  score: number;
  source: 'user' | 'adapter' | 'generic';
  reasons: string[];
}

export interface FieldMatch {
  descriptor: PageFieldDescriptor;
  candidates: MatchCandidate[];
  selected?: MatchCandidate;
  status:
    | 'matched'
    | 'needs_confirmation'
    | 'skipped_existing'
    | 'filled'
    | 'verified'
    | 'failed'
    | 'unsupported';
}
```

`FieldMatch` must contain the descriptor, ordered candidates, optional selected candidate, and one of the field statuses from the spec. `ScanResult` must contain page URL/host/title, optional adapter ID, and all field matches.

`UserFieldMapping` must contain a stable ID, host/path scope, fingerprint, profile key, and creation timestamp. Mapping scope must be explicit so a website-specific rule cannot silently become a global rule.

Messages must be discriminated unions. The minimum page commands are:

```ts
export type PageMessage =
  | { type: 'scan-page'; requestId: string }
  | { type: 'fill-fields'; requestId: string; fields: ConfirmedFill[] };

export interface ConfirmedFill {
  fieldId: string;
  profileKey: string;
  value: FieldValue;
}
```

- [ ] **Step 1: Write serialization and status tests before implementation.**

```ts
it('keeps profile values serializable and preserves custom keys', () => {
  const profile: Profile = {
    schemaVersion: 1,
    fields: {
      'contact.email': {
        key: 'contact.email',
        label: '邮箱',
        type: 'text',
        value: 'candidate@example.test',
        policy: 'auto',
      },
      'custom.acceptAdjustment': {
        key: 'custom.acceptAdjustment',
        label: '是否接受调剂',
        type: 'boolean',
        value: true,
        policy: 'review',
      },
    },
  };

  expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
});
```

- [ ] **Step 2: Run the focused tests and verify the new contracts are missing.**

```bash
pnpm exec vitest run tests/unit/shared/profile.test.ts tests/unit/shared/form.test.ts tests/unit/shared/messages.test.ts
```

Expected: FAIL because the domain modules have not been created.

- [ ] **Step 3: Implement the four shared contract modules.**

Keep the contracts free of browser APIs and React imports. Use literal unions for all status, field-kind, policy, source, and message values.

- [ ] **Step 4: Run focused tests and type checking.**

```bash
pnpm exec vitest run tests/unit/shared/profile.test.ts tests/unit/shared/form.test.ts tests/unit/shared/messages.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the contracts.**

```bash
git add src/shared tests/unit/shared
git diff --cached --check
git commit -m "feat(resume-autofill): define form and profile contracts"
```

### Task 3: Add local profile and mapping storage

**Files:**
- Create: `src/storage/storage-port.ts`
- Create: `src/storage/local-storage.ts`
- Create: `src/profile/profile-store.ts`
- Create: `src/storage/mapping-store.ts`
- Test: `tests/unit/storage/profile-store.test.ts`
- Test: `tests/unit/storage/mapping-store.test.ts`

**Interfaces:**
- Consumes: `Profile`, `UserFieldMapping` from `src/shared/`.
- Produces:

```ts
export interface StoragePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export class ProfileStore {
  load(): Promise<Profile>;
  save(profile: Profile): Promise<void>;
}

export class MappingStore {
  list(): Promise<UserFieldMapping[]>;
  upsert(mapping: UserFieldMapping): Promise<void>;
}
```

- [ ] **Step 1: Write repository tests using an in-memory storage port.**

The tests must cover an empty store returning a valid empty profile, save/load round-trip, mapping upsert by ID, and preservation of unrelated mappings.

```ts
it('returns a schema-valid empty profile when nothing is stored', async () => {
  const store = new ProfileStore(new MemoryStorage());
  await expect(store.load()).resolves.toEqual({ schemaVersion: 1, fields: {} });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

```bash
pnpm exec vitest run tests/unit/storage/profile-store.test.ts tests/unit/storage/mapping-store.test.ts
```

Expected: FAIL because the repositories do not exist.

- [ ] **Step 3: Implement the storage port and repositories.**

Use two stable keys, `resume-autofill.profile.v1` and `resume-autofill.mappings.v1`. `LocalStorage` must delegate to `browser.storage.local`; it must never use `browser.storage.sync`. Repositories must validate `schemaVersion` and fall back to empty data for malformed or missing values instead of throwing during panel startup.

- [ ] **Step 4: Add storage error translation.**

Repository methods must preserve the original cause for developer diagnostics while returning a typed `StorageError` to callers. Error messages must not include field values.

- [ ] **Step 5: Run tests and type checking.**

```bash
pnpm exec vitest run tests/unit/storage/profile-store.test.ts tests/unit/storage/mapping-store.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit local storage.**

```bash
git add src/storage src/profile tests/unit/storage
git diff --cached --check
git commit -m "feat(resume-autofill): add local profile storage"
```

### Task 4: Implement DOM scanning and field normalization

**Files:**
- Create: `src/form-engine/runtime-types.ts`
- Create: `src/form-engine/label-resolver.ts`
- Create: `src/form-engine/normalize-label.ts`
- Create: `src/form-engine/fingerprint.ts`
- Create: `src/form-engine/scanner.ts`
- Test: `tests/unit/form-engine/scanner.test.ts`
- Test: `tests/unit/form-engine/label-resolver.test.ts`

**Interfaces:**
- Consumes: a `Document` and page context.
- Produces:

```ts
export interface RuntimePageField extends PageFieldDescriptor {
  element: HTMLElement;
}

export interface ScanContext {
  url: string;
  host: string;
  title: string;
  framePath: number[];
}

export function scanDocument(
  document: Document,
  context: ScanContext,
): RuntimePageField[];

export function toDescriptor(field: RuntimePageField): PageFieldDescriptor;
```

- [ ] **Step 1: Create fixtures inside unit tests for common controls.**

The first fixture must include one associated `<label>`, one ancestor `<label>`, an `aria-label`, a placeholder-only input, a text area, a select with options, a checkbox, a radio group, a hidden input, and a disabled input.

- [ ] **Step 2: Write failing scanner tests.**

```ts
it('scans visible controls and resolves their labels without scanning hidden fields', () => {
  document.body.innerHTML = `
    <label for="phone">联系电话</label>
    <input id="phone" name="phone" />
    <textarea aria-label="个人优势"></textarea>
    <input type="hidden" name="csrf" value="not-profile-data" />
  `;

  const fields = scanDocument(document, {
    url: 'http://localhost/form',
    host: 'localhost',
    title: 'Fixture',
    framePath: [],
  });

  expect(fields).toHaveLength(2);
  expect(fields.map((field) => field.label)).toEqual(['联系电话', '个人优势']);
});
```

- [ ] **Step 3: Run the scanner tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/form-engine/scanner.test.ts tests/unit/form-engine/label-resolver.test.ts
```

Expected: FAIL because scanner functions are not implemented.

- [ ] **Step 4: Implement label resolution in a deterministic order.**

Use this order: associated `<label for>`, wrapping `<label>`, `aria-label`, visible placeholder, `name`, `id`. Trim whitespace, collapse repeated whitespace, preserve Chinese characters, and normalize English labels to lowercase. Do not read arbitrary surrounding page prose as the label.

- [ ] **Step 5: Implement control extraction.**

Scan `input` except hidden/disabled types, `textarea`, and `select`. Capture current values without changing them. For a checkbox use its checked state; for a radio group use the checked option; for a select capture option labels and values plus the selected value. Generate a deterministic field ID based on scan order and a fingerprint based on normalized label, kind, name/id, section label, and frame path.

- [ ] **Step 6: Implement descriptor conversion without DOM handles.**

`toDescriptor` must remove the `element` property and return data safe for `runtime.sendMessage`. No descriptor may contain the current value of a hidden input because hidden inputs are excluded.

- [ ] **Step 7: Run tests, type checking, and commit.**

```bash
pnpm exec vitest run tests/unit/form-engine/scanner.test.ts tests/unit/form-engine/label-resolver.test.ts
pnpm typecheck
git add src/form-engine tests/unit/form-engine
git diff --cached --check
git commit -m "feat(resume-autofill): scan standard form controls"
```

### Task 5: Implement generic matching and confidence states

**Files:**
- Create: `src/matching/field-dictionary.ts`
- Create: `src/matching/score-field.ts`
- Create: `src/matching/generic-matcher.ts`
- Create: `src/matching/confidence.ts`
- Test: `tests/unit/matching/generic-matcher.test.ts`
- Test: `tests/unit/matching/confidence.test.ts`

**Interfaces:**
- Consumes: `PageFieldDescriptor`, `Profile`, and optional user mappings.
- Produces:

```ts
export interface MatchOptions {
  mappings: UserFieldMapping[];
}

export function matchFields(
  fields: PageFieldDescriptor[],
  profile: Profile,
  options: MatchOptions,
): FieldMatch[];
```

- [ ] **Step 1: Define the initial canonical dictionary.**

Include only fields needed for the P0 sample profile, with Chinese and English aliases:

```text
identity.name       姓名 / name / full name
contact.phone       手机号 / 联系电话 / phone / mobile
contact.email       邮箱 / 电子邮箱 / email
education.school    学校 / 毕业院校 / university / school
education.degree    学历 / 最高学历 / degree / education
education.major     专业 / 所学专业 / major / field of study
experience.company  公司 / 实习公司 / company / employer
experience.title    职位 / 岗位名称 / job title / title
preference.city     意向城市 / 工作城市 / city / location
```

Do not add sensitive fields to the automatic dictionary without a review policy. Custom fields remain available through explicit user mappings.

- [ ] **Step 2: Write failing matching tests.**

```ts
it('matches Chinese and English aliases to the same canonical field', () => {
  const matches = matchFields(
    [descriptor({ fieldId: 'f1', label: '移动电话', kind: 'text' })],
    profileWith('contact.phone', 'phone-test-value'),
    { mappings: [] },
  );

  expect(matches[0].selected?.profileKey).toBe('contact.phone');
  expect(matches[0].status).toBe('matched');
});
```

Add tests for an ambiguous location label, a type-incompatible candidate, a `never` policy field, and an explicit user mapping overriding the generic result.

- [ ] **Step 3: Run focused tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/matching/generic-matcher.test.ts tests/unit/matching/confidence.test.ts
```

Expected: FAIL because the dictionary and matcher do not exist.

- [ ] **Step 4: Implement deterministic scoring.**

Use these initial weights: normalized label alias `0.55`, autocomplete `0.20`, name/id alias `0.15`, section label `0.05`, and page/profile type compatibility `0.05`. Clamp the result to `[0, 1]`. Record human-readable reasons for every candidate.

- [ ] **Step 5: Implement status assignment.**

Use the following initial policy:

```text
score >= 0.85 and policy=auto and no close tie → matched
score >= 0.55 or close tie                 → needs_confirmation
policy=never                               → unsupported
otherwise                                  → unsupported
```

Two candidates within `0.05` of each other are a close tie and must not be auto-filled. An explicit user mapping bypasses the score threshold but still respects `policy=never`.

- [ ] **Step 6: Run tests, inspect reasons, and commit.**

```bash
pnpm exec vitest run tests/unit/matching/generic-matcher.test.ts tests/unit/matching/confidence.test.ts
pnpm typecheck
git add src/matching tests/unit/matching
git diff --cached --check
git commit -m "feat(resume-autofill): match fields with confidence"
```

### Task 6: Implement control filling and post-fill verification

**Files:**
- Create: `src/filling/fill-types.ts`
- Create: `src/filling/native-value.ts`
- Create: `src/filling/control-filler.ts`
- Create: `src/filling/verify-field.ts`
- Test: `tests/unit/filling/control-filler.test.ts`
- Test: `tests/unit/filling/verify-field.test.ts`

**Interfaces:**
- Consumes: `RuntimePageField`, `FieldValue`, and explicit `FillOptions`.
- Produces:

```ts
export interface FillOptions {
  overwrite: boolean;
  confirmed: boolean;
}

export type FillOutcome =
  | { status: 'filled'; fieldId: string }
  | { status: 'skipped_existing'; fieldId: string }
  | { status: 'failed'; fieldId: string; reason: string };

export interface VerificationOutcome {
  fieldId: string;
  verified: boolean;
  reason?: string;
}

export function fillField(
  field: RuntimePageField,
  value: FieldValue,
  options: FillOptions,
): Promise<FillOutcome>;

export function verifyField(
  field: RuntimePageField,
  expected: FieldValue,
): VerificationOutcome;
```

- [ ] **Step 1: Write failing tests for safe ordinary controls.**

Cover text input, textarea, select by option value, select by normalized visible label, radio, checkbox, an already-filled field, and unsupported file input. Every test must assert that an `input` or `change` event is emitted where applicable.

```ts
it('does not overwrite an existing value by default', async () => {
  const field = runtimeField('<input value="existing">', 'text');
  await expect(fillField(field, 'new', {
    overwrite: false,
    confirmed: true,
  })).resolves.toMatchObject({ status: 'skipped_existing' });
  expect((field.element as HTMLInputElement).value).toBe('existing');
});
```

- [ ] **Step 2: Run focused tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/filling/control-filler.test.ts tests/unit/filling/verify-field.test.ts
```

Expected: FAIL because the filler is not implemented.

- [ ] **Step 3: Implement native value writes and events.**

For text-like controls, set the value through the element's native setter and dispatch bubbling `input` and `change` events. For select, choose a matching value first and otherwise a normalized visible label. For radio and checkbox, change only the requested control and dispatch `change`. Do not attempt to assign a file input value.

- [ ] **Step 4: Implement default safety behavior.**

If `confirmed` is false, return `failed` with a non-sensitive reason. The runtime controller must pass `confirmed: true` only for fields explicitly selected by the user. If `overwrite` is false and the current value is non-empty, return `skipped_existing`. Never clear a field as part of a failed attempt.

- [ ] **Step 5: Implement verification.**

Re-read the control after the events have run. Compare booleans and normalized strings according to control type. A verification failure must be reported independently from other fields.

- [ ] **Step 6: Run tests, type checking, and commit.**

```bash
pnpm exec vitest run tests/unit/filling/control-filler.test.ts tests/unit/filling/verify-field.test.ts
pnpm typecheck
git add src/filling tests/unit/filling
git diff --cached --check
git commit -m "feat(resume-autofill): fill and verify standard controls"
```

### Task 7: Add the adapter contract and precedence registry

**Files:**
- Create: `src/adapters/adapter-types.ts`
- Create: `src/adapters/adapter-registry.ts`
- Create: `src/adapters/generic-adapter.ts`
- Create: `src/matching/resolve-match.ts`
- Test: `tests/unit/adapters/adapter-registry.test.ts`
- Test: `tests/unit/matching/resolve-match.test.ts`

**Interfaces:**
- Produces:

```ts
export interface PageContext {
  url: string;
  host: string;
  title: string;
}

export interface AdapterHint {
  fieldId: string;
  profileKey: string;
  score: number;
  reason: string;
}

export interface SiteAdapter {
  readonly id: string;
  matches(context: PageContext): boolean;
  discoverHints(fields: RuntimePageField[]): AdapterHint[];
}

export class AdapterRegistry {
  register(adapter: SiteAdapter): void;
  resolve(context: PageContext): SiteAdapter | undefined;
}
```

- [ ] **Step 1: Write failing tests for registry behavior.**

Test that the first matching adapter is returned, no adapter produces the generic fallback path, and an adapter can provide a direct high-confidence hint without changing the generic matcher.

```ts
it('resolves the first matching adapter in registration order', () => {
  const registry = new AdapterRegistry();
  const first = adapter({ id: 'first', matches: () => true });
  const second = adapter({ id: 'second', matches: () => true });

  registry.register(first);
  registry.register(second);

  expect(registry.resolve(pageContext('https://fixture.test'))?.id).toBe('first');
});
```

- [ ] **Step 2: Run focused tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/adapters/adapter-registry.test.ts tests/unit/matching/resolve-match.test.ts
```

Expected: FAIL because the registry and resolution function are not implemented.

- [ ] **Step 3: Implement the registry and generic adapter.**

`GenericAdapter` must have ID `generic` and return no hints. The registry must preserve registration order, return the first adapter whose `matches` method is true, and never throw when no platform adapter matches.

- [ ] **Step 4: Implement precedence resolution.**

Merge candidates in this order: explicit user mapping, adapter hint, generic matcher. Preserve source and reason in the result. An adapter hint may raise confidence but cannot override a `policy=never` profile field. No P0 real-site adapter is registered.

- [ ] **Step 5: Run tests and commit.**

```bash
pnpm exec vitest run tests/unit/adapters/adapter-registry.test.ts tests/unit/matching/resolve-match.test.ts
pnpm typecheck
git add src/adapters src/matching/resolve-match.ts tests/unit/adapters tests/unit/matching/resolve-match.test.ts
git diff --cached --check
git commit -m "feat(resume-autofill): add adapter registry contract"
```

### Task 8: Connect background, content script, and side panel messages

**Files:**
- Create: `src/runtime/runtime-errors.ts`
- Create: `src/runtime/application-controller.ts`
- Modify: `src/shared/messages.ts`
- Modify: `entrypoints/background.ts`
- Modify: `entrypoints/form-runtime.ts`
- Test: `tests/unit/runtime/application-controller.test.ts`
- Test: `tests/unit/runtime/message-errors.test.ts`

**Interfaces:**
- Consumes: scanner, matcher, filler, adapter registry, profile store, mapping store.
- Produces:

```ts
export interface ApplicationController {
  scanActiveTab(): Promise<ScanResult>;
  fillConfirmed(fields: ConfirmedFill[]): Promise<FillSummary>;
}

export interface FillSummary {
  filled: string[];
  verified: string[];
  skippedExisting: string[];
  failed: Array<{ fieldId: string; reason: string }>;
}
```

- [ ] **Step 1: Write controller tests with fake tab and fake page ports.**

Test the scan path, successful multi-field fill, one-field failure with other fields retained, permission failure, and content-script response timeout. The tests must assert that profile values are not included in the scan request.

- [ ] **Step 2: Run focused tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/runtime/application-controller.test.ts tests/unit/runtime/message-errors.test.ts
```

Expected: FAIL because the controller and error types are not implemented.

- [ ] **Step 3: Implement the background controller.**

The background path must:

1. Identify the active tab.
2. Request or use the user-gesture-derived active-tab access.
3. Inject the WXT unlisted-script output file `form-runtime.js` only when a scan or confirmed fill is requested.
4. Send `scan-page` or `fill-fields` to the content script.
5. Load profile and mappings in the extension context, not in the page context.
6. Return serializable results to the side panel.

The content script must keep an in-memory `fieldId → RuntimePageField` map for the current page, re-resolve a field by fingerprint after a page rerender, and reject unknown field IDs without mutating any control.

The injection call must use the generated WXT path:

```ts
await browser.scripting.executeScript({
  target: { tabId },
  files: ['form-runtime.js'],
});
```

- [ ] **Step 4: Make injection and message handling idempotent.**

Use a page-local marker so repeated scans do not install duplicate message listeners. A scan must only return descriptors. A fill command must contain only explicit `ConfirmedFill` records selected by the user.

- [ ] **Step 5: Translate failures into non-sensitive runtime errors.**

Use stable error codes such as `TAB_UNAVAILABLE`, `PERMISSION_DENIED`, `CONTENT_SCRIPT_UNAVAILABLE`, `SCAN_FAILED`, and `FIELD_OPERATION_FAILED`. Do not put URLs, profile values, or raw page HTML into error text sent to the side panel.

- [ ] **Step 6: Run tests, build, and commit.**

```bash
pnpm exec vitest run tests/unit/runtime/application-controller.test.ts tests/unit/runtime/message-errors.test.ts
pnpm typecheck
pnpm build
git add src/runtime src/shared/messages.ts entrypoints/background.ts entrypoints/form-runtime.ts tests/unit/runtime
git diff --cached --check
git commit -m "feat(resume-autofill): connect extension runtime messages"
```

### Task 9: Build the options page and review-first side panel

**Files:**
- Create: `src/ui/panel-state.ts`
- Create: `src/ui/profile-fields.ts`
- Create: `src/ui/field-match-view.tsx`
- Create: `src/ui/status-summary.tsx`
- Modify: `entrypoints/options/index.html`
- Modify: `entrypoints/options/main.tsx`
- Modify: `entrypoints/options/App.tsx`
- Modify: `entrypoints/sidepanel/index.html`
- Modify: `entrypoints/sidepanel/main.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`
- Create: `entrypoints/options/style.css`
- Create: `entrypoints/sidepanel/style.css`
- Test: `tests/unit/ui/panel-state.test.ts`
- Test: `tests/unit/ui/field-match-view.test.tsx`

**Interfaces:**
- Consumes: `ProfileStore`, `MappingStore`, `ScanResult`, `ConfirmedFill`, and `FillSummary`.
- Produces a review state machine:

```ts
export type PanelState =
  | { kind: 'idle'; error?: string }
  | { kind: 'scanning' }
  | { kind: 'review'; result: ScanResult }
  | { kind: 'filling'; selectedFieldIds: string[] }
  | { kind: 'result'; summary: FillSummary };
```

- [ ] **Step 1: Write state transition tests.**

Cover `idle → scanning → review`, `review → filling → result`, scan failure back to `idle` with an error, and partial fill results. Assert that `review` does not dispatch a fill message.

```ts
it('does not leave review state when no field is confirmed', () => {
  const state = reducePanel({ kind: 'idle' }, { type: 'scan_succeeded', result });
  const next = reducePanel(state, { type: 'fill_requested', fieldIds: [] });

  expect(next.kind).toBe('review');
  expect(next).toEqual(state);
});
```

- [ ] **Step 2: Run UI tests and verify failure.**

```bash
pnpm exec vitest run tests/unit/ui/panel-state.test.ts tests/unit/ui/field-match-view.test.tsx
```

Expected: FAIL because the state and components are not implemented.

- [ ] **Step 3: Implement the options page with safe P0 fields.**

Provide editable fields for the initial canonical keys: name, phone, email, school, degree, major, company, title, and target city. Include a custom-field row with a key, label, type, value, and policy. Save only through an explicit `Save` action. Do not prefill the page with real user data.

- [ ] **Step 4: Implement the side-panel review screen.**

The panel must expose `Scan page` and `Fill confirmed fields` as separate actions. Render counts for matched, needs confirmation, skipped existing, unsupported, and failed. Each matched row must show page label, proposed profile label/key, masked display value, score/reasons, and a selectable confirmation control.

- [ ] **Step 5: Enforce the interaction boundary in UI state.**

The scan action only requests `scanActiveTab`. The fill action is disabled while scanning, requires at least one selected field, and sends only selected fields. `unsupported`, `needs_confirmation`, and `policy=never` rows cannot be included in the automatic selection. Never render a `Submit application` action.

- [ ] **Step 6: Add explicit mapping creation.**

For an unresolved field, allow the user to select an existing profile key or create a `custom.*` key, choose its policy, and save a mapping scoped to the current host and field fingerprint. Saving a mapping must not automatically fill the field during the same scan; the user must explicitly include it in a later fill action.

- [ ] **Step 7: Run tests and manual UI checks.**

```bash
pnpm exec vitest run tests/unit/ui/panel-state.test.ts tests/unit/ui/field-match-view.test.tsx
pnpm typecheck
pnpm build
```

Manual checks: opening the options page works; saving a dummy profile survives reload; opening the side panel does not change a test page; scan results are readable; no profile value appears in the browser console.

- [ ] **Step 8: Commit the UI.**

```bash
git add src/ui entrypoints/options entrypoints/sidepanel tests/unit/ui
git diff --cached --check
git commit -m "feat(resume-autofill): add review-first extension UI"
```

### Task 10: Add local form fixtures and browser end-to-end coverage

**Files:**
- Create: `tests/fixtures/basic-form.html`
- Create: `tests/fixtures/controlled-form.html`
- Create: `tests/fixtures/dynamic-form.html`
- Create: `tests/fixtures/unsupported-form.html`
- Create: `tests/fixtures/fixture-server.ts`
- Modify: `package.json`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/support/extension.ts`
- Create: `tests/e2e/generic-fill.spec.ts`
- Create: `tests/e2e/safety-boundary.spec.ts`

**Interfaces:**
- Produces a local fixture server on `http://127.0.0.1:4173` and browser tests that never navigate to a production recruitment site or click a submit control.
- Produces `openExtensionSidePanelForActiveTab(page: Page): Promise<void>` in `tests/e2e/support/extension.ts`.

- [ ] **Step 1: Write fixture pages with deterministic expected outcomes.**

`basic-form.html` must contain standard controls for name, phone, email, degree, city, radio, checkbox, and select. `controlled-form.html` must render a controlled input and select with a small local script that replaces DOM values from its internal state. `dynamic-form.html` must append a second form section after a button click. `unsupported-form.html` must contain a file input and a CAPTCHA-like placeholder with no bypass logic.

- [ ] **Step 2: Implement the local fixture server.**

Use Node's built-in `http` and `fs` modules. Serve only the four fixed files from `tests/fixtures/`, reject path traversal, set `Content-Type: text/html`, and support a `--port` argument. Do not add a general-purpose static-server dependency.

- [ ] **Step 3: Configure Playwright for extension testing.**

The test setup must:

1. Run `pnpm build:test` before the browser project.
2. Start the fixture server on `127.0.0.1:4173`.
3. Launch a persistent Chromium context with the built extension loaded.
4. Build the test manifest with only `http://127.0.0.1/*` in `host_permissions`, while the normal build omits that host permission; use that test-only permission to inject the content script into fixtures.
5. Close the context after each test so profile state cannot leak between tests.

- [ ] **Step 4: Write the end-to-end tests.**

`generic-fill.spec.ts` must verify scan-before-fill, ordinary control filling, controlled-form verification, dynamic-field rescan, and partial success. `safety-boundary.spec.ts` must verify existing values remain unchanged, unsupported file/CAPTCHA controls remain manual, and no submit control is clicked.

```ts
test('scan does not mutate the fixture before confirmation', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/basic-form.html');
  const before = await page.locator('#name').inputValue();
  await openExtensionSidePanelForActiveTab(page);
  await page.getByRole('button', { name: 'Scan page' }).click();
  expect(await page.locator('#name').inputValue()).toBe(before);
});
```

The helper `openExtensionSidePanelForActiveTab` must be implemented in `tests/e2e/support/extension.ts` using the loaded extension's actual ID; it must not rely on a hard-coded extension ID.

- [ ] **Step 5: Run browser tests and inspect artifacts.**

```bash
pnpm e2e
```

Expected: all local fixture tests pass; Playwright report contains no production URL, real profile value, or submit action.

- [ ] **Step 6: Commit fixture and browser coverage.**

```bash
git add tests/fixtures tests/e2e package.json playwright.config.ts
git diff --cached --check
git commit -m "test(resume-autofill): cover local form filling flow"
```

### Task 11: Document local development and complete MVP verification

**Files:**
- Modify: `README.md`
- Create: `docs/verification/mvp-checklist.md`
- Test: the complete repository test suite

**Interfaces:**
- Produces a reproducible local workflow for a future developer and a checklist that distinguishes unit, browser, and manual evidence.

- [ ] **Step 1: Document installation and commands.**

`README.md` must explain:

```text
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

It must explain how to load the generated Chrome MV3 build as an unpacked extension and how to open the options page and side panel. It must state that the extension does not submit applications, bypass verification, or upload files automatically.

- [ ] **Step 2: Write the verification checklist.**

The checklist must include:

- `pnpm typecheck` passes;
- `pnpm test` passes;
- `pnpm e2e` passes against local fixtures;
- `pnpm build` passes;
- scan has no page mutation;
- only explicitly confirmed fields are filled;
- existing values are preserved;
- controlled inputs are re-verified;
- one field can fail without discarding other successful fields;
- unsupported file/CAPTCHA controls remain manual;
- no submit action exists;
- no real personal values or secrets are present in source, fixtures, logs, or test artifacts.

- [ ] **Step 3: Run the full verification set.**

```bash
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
git diff --check
```

- [ ] **Step 4: Inspect the final repository state.**

Run:

```bash
git status --short --branch
git log --oneline --decorate -12
rg -n -i 'api[_-]?key|token|password|secret|fixme' --glob '!pnpm-lock.yaml' --glob '!docs/superpowers/specs/**' --glob '!docs/superpowers/plans/**' .
```

Expected: no credential-like values and no unfinished implementation markers in source; generated artifacts and environment `.DS_Store` files remain untracked or ignored, never committed.

- [ ] **Step 5: Commit the verification documentation.**

```bash
git add README.md docs/verification/mvp-checklist.md
git diff --cached --check
git commit -m "docs(resume-autofill): document MVP verification"
```

## Implementation References

- [WXT installation and React starter](https://wxt.dev/guide/installation.html)
- [WXT project structure and entrypoints](https://wxt.dev/guide/essentials/project-structure.html)
- [WXT entrypoint types and generated content-script paths](https://wxt.dev/guide/essentials/entrypoints.html)
- [WXT React integration](https://wxt.dev/guide/essentials/frontend-frameworks.html)
- [Chrome Manifest V3 reference](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Vitest guide](https://vitest.dev/guide/index.html)
- [Playwright browser testing](https://playwright.dev/docs/browsers)

## Plan Completion Criteria

This P0 implementation plan is complete only when the repository can be loaded as a Chrome MV3 extension and all of the following are demonstrated on local fixtures:

1. A user can save a dummy local profile.
2. The extension can scan a form without changing it.
3. The extension proposes field mappings with reasons and statuses.
4. The user can confirm a subset of fields.
5. The extension fills and verifies that subset.
6. Existing values, ambiguous fields, unsupported controls, and failures are handled according to the design.
7. The extension never submits an application.
8. Unit, browser, type, build, and manual verification evidence is recorded.

Real recruitment-platform Adapter work, application history, answer libraries, multiple resume versions, and AI remain outside this P0 plan and require a separate reviewed plan after MVP evidence exists.
