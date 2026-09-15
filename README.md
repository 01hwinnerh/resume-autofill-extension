# Resume Autofill Assistant

A local-first, review-first Chrome MV3 extension for accelerating job-application form filling. It uses a generic form engine, optional recruitment-platform adapters, and user-defined mappings; the current MVP focuses on standard HTML controls and a manual confirmation flow.

## Scope and safety

- Scan the current page and show proposed field mappings, confidence, reasons, and status.
- Fill only fields explicitly confirmed by the user, then verify the result in the page.
- Preserve existing values and report individual failures without discarding successful fields.
- Keep file uploads, CAPTCHA, SMS verification, login/OAuth, anti-automation checks, and final submission manual.
- Store the local profile and mappings in browser local storage. The MVP has no backend, remote API, or AI dependency.

AI-assisted matching is optional future work and is not required by the MVP.

## Local development

Requirements: Node.js with Corepack enabled and pnpm available.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

`pnpm dev` starts the WXT development server. `pnpm e2e` builds a test variant, starts the local fixture server at `http://127.0.0.1:4173`, and runs Playwright against the installed Google Chrome channel. The test variant grants only the localhost fixture permission; the normal production build omits `host_permissions`.

## Load the extension locally

1. Run `pnpm build`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and choose the generated `.output/chrome-mv3` directory.
4. Open the extension details and choose **Extension options** to edit the local profile.
5. Open Chrome's **Side panel**, select **Resume Autofill Assistant**, then open a page containing a form.
6. Click **扫描当前页面**, review the proposed matches, select the fields to fill, and click **填写已确认字段**.

The current MVP is intended for local fixture/manual validation. It does not automatically submit applications, bypass verification, or upload files.

## Repository map

- `entrypoints/`: WXT background service worker, page runtime, options page, and side panel.
- `src/form-engine/`: DOM scanning, labels, fingerprints, and runtime field descriptors.
- `src/matching/`: generic confidence-based profile-field matching.
- `src/adapters/`: adapter contracts and registry for platform-specific hints.
- `src/filling/`: standard-control filling and post-fill verification.
- `src/profile/` and `src/storage/`: local profile and mapping persistence.
- `src/runtime/`: message orchestration and runtime error handling.
- `src/ui/`: review-first panel state and field/status views.
- `tests/fixtures/` and `tests/e2e/`: local deterministic pages and browser coverage.

Detailed design decisions and MVP boundaries are recorded in [`docs/superpowers/specs/2026-09-14-resume-autofill-extension-design.md`](docs/superpowers/specs/2026-09-14-resume-autofill-extension-design.md). The implementation plan and task acceptance criteria are in [`docs/superpowers/plans/2026-09-14-resume-autofill-mvp.md`](docs/superpowers/plans/2026-09-14-resume-autofill-mvp.md). Verification evidence is tracked in [`docs/verification/mvp-checklist.md`](docs/verification/mvp-checklist.md).
