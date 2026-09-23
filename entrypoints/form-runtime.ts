import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { fillField } from '../src/filling/control-filler';
import { verifyField } from '../src/filling/verify-field';
import { highlightField } from '../src/form-engine/focus-field';
import { openScanRoots, scanDocument, toDescriptor } from '../src/form-engine/scanner';
import type { RuntimePageField } from '../src/form-engine/runtime-types';
import { closeActivePreviewOverlay, createPreviewOverlay, mutationTouchesPreviewOverlay } from '../src/runtime/preview-overlay';
import { extractApplicationMetadata } from '../src/runtime/application-identity';
import { createRuntimeError } from '../src/runtime/runtime-errors';
import type { ConfirmedFill, ContentPageMessage, PageMessage, PageResponse } from '../src/shared/messages';
import { browser } from 'wxt/browser';

const installedKey = '__resumeAutofillFormRuntimeInstalled';

export default defineUnlistedScript(() => {
  const page = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (page[installedKey]) return; page[installedKey] = true;
  const runtimeFields = new Map<string, RuntimePageField>();
  let activeScanToken: string | undefined; let activeNamespace = 'frame'; let baselineFingerprint = ''; let baselineUrl = '';
  let baselineFieldCounts = new Map<string, number>(); let baselineFrameCount = 0; let sessionObserver: MutationObserver | undefined; let mutationTimer: number | undefined;

  function fieldsForDocument(namespace = 'frame'): RuntimePageField[] { return scanDocument(document, { url: location.href, host: location.host, title: document.title, framePath: [] }).map((field) => ({ ...field, fieldId: `${namespace}-${field.fieldId}` })); }
  function rootKey(field: RuntimePageField): string {
    const parts: string[] = []; let root = field.elements[0]?.getRootNode();
    while (root instanceof ShadowRoot) { const host = root.host; parts.unshift(`${host.tagName.toLowerCase()}#${host.id || host.getAttribute('name') || host.getAttribute('aria-label') || ''}`); root = host.getRootNode(); }
    return parts.length ? parts.join('/') : 'document';
  }
  function semanticKey(field: RuntimePageField): string { return `${field.fingerprint}|section:${field.sectionIndex ?? '-'}|root:${rootKey(field)}`; }
  function fieldCounts(fields: RuntimePageField[]): Map<string, number> { const counts = new Map<string, number>(); for (const field of fields) { const key = semanticKey(field); counts.set(key, (counts.get(key) ?? 0) + 1); } return counts; }
  function stableFingerprint(fields: RuntimePageField[]): string { return [location.href, ...fields.map(semanticKey).sort()].join('||'); }
  function compareBaseline(fields: RuntimePageField[]): { hard: boolean; newFieldCount: number } {
    if (location.href !== baselineUrl) return { hard: true, newFieldCount: 0 };
    const current = fieldCounts(fields); let added = 0;
    for (const [key, count] of baselineFieldCounts) {
      const currentCount = current.get(key) ?? 0;
      if (currentCount < count || currentCount > count) return { hard: true, newFieldCount: Math.max(0, currentCount - count) };
    }
    for (const [key, count] of current) if (!baselineFieldCounts.has(key)) added += count;
    const frames = document.querySelectorAll('iframe,frame').length;
    if (frames < baselineFrameCount) return { hard: true, newFieldCount: added };
    return { hard: false, newFieldCount: added + Math.max(0, frames - baselineFrameCount) };
  }
  function refreshBindings(): boolean {
    const current = fieldsForDocument(activeNamespace); const comparison = compareBaseline(current); if (comparison.hard) return false;
    const candidates = new Map<string, RuntimePageField[]>();
    for (const field of current) { const key = semanticKey(field); candidates.set(key, [...(candidates.get(key) ?? []), field]); }
    const original = [...runtimeFields.entries()]; const rebound = new Map<string, RuntimePageField>(); const offsets = new Map<string, number>();
    for (const [fieldId, oldField] of original) {
      const key = semanticKey(oldField); const matches = candidates.get(key) ?? []; const offset = offsets.get(key) ?? 0;
      if (!matches[offset]) return false;
      rebound.set(fieldId, { ...matches[offset]!, fieldId }); offsets.set(key, offset + 1);
    }
    runtimeFields.clear(); for (const [id, field] of rebound) runtimeFields.set(id, field); return true;
  }
  function mutationRelevant(record: MutationRecord): boolean {
    if (mutationTouchesPreviewOverlay(record)) return false;
    if (record.type === 'attributes') return record.target instanceof HTMLElement && (record.target.matches('input,textarea,select,iframe,frame') || Boolean(record.target.querySelector('input,textarea,select,iframe,frame')));
    const touchesControl = (node: Node) => node.nodeType === Node.ELEMENT_NODE && ((node as Element).matches('input,textarea,select,iframe,frame') || Boolean((node as Element).querySelector('input,textarea,select,iframe,frame')) || Boolean((node as HTMLElement).shadowRoot));
    return Array.from(record.addedNodes).some(touchesControl) || Array.from(record.removedNodes).some(touchesControl);
  }
  function observeSession(): void {
    sessionObserver?.disconnect(); if (mutationTimer !== undefined) clearTimeout(mutationTimer);
    sessionObserver = new MutationObserver((records) => {
      if (!records.some(mutationRelevant)) return;
      if (mutationTimer !== undefined) clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        const current = fieldsForDocument(activeNamespace); const comparison = compareBaseline(current);
        if (!comparison.hard && comparison.newFieldCount === 0) { refreshBindings(); observeSession(); return; }
        void browser.runtime.sendMessage({ type: 'page-fields-changed', newFieldCount: comparison.newFieldCount, sessionInvalidated: comparison.hard }).catch(() => undefined);
        if (comparison.hard) sessionObserver?.disconnect(); else { refreshBindings(); observeSession(); }
      }, 250);
    });
    for (const root of openScanRoots(document)) sessionObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'name', 'id', 'type', 'role'] });
  }
  function stale(requestId: string): PageResponse { return { type: 'error', requestId, error: createRuntimeError('FIELD_OPERATION_FAILED', '页面步骤、关键字段或 iframe 已变化，请重新扫描。', true) }; }
  function sessionCurrent(message: PageMessage): boolean {
    if (message.scanToken !== activeScanToken || (message.expectedFingerprint && message.expectedFingerprint !== baselineFingerprint)) return false;
    return refreshBindings();
  }
  function scan(requestId: string, namespace = 'frame', scanToken?: string): PageResponse {
    try {
      activeNamespace = namespace; const fields = fieldsForDocument(namespace); runtimeFields.clear(); for (const field of fields) runtimeFields.set(field.fieldId, field);
      activeScanToken = scanToken; baselineUrl = location.href; baselineFingerprint = stableFingerprint(fields); baselineFieldCounts = fieldCounts(fields); baselineFrameCount = document.querySelectorAll('iframe,frame').length; observeSession();
      return { type: 'scan-result', requestId, result: { descriptors: fields.map(toDescriptor), metadata: window === window.top ? extractApplicationMetadata(document) : undefined, fingerprint: baselineFingerprint, frameUrl: location.href, childFrameCount: baselineFrameCount } };
    } catch { return { type: 'error', requestId, error: createRuntimeError('SCAN_FAILED', 'The frame could not be scanned.', true) }; }
  }
  function currentField(field: RuntimePageField): RuntimePageField | undefined { return field.elements.every((element) => element.isConnected) ? field : undefined; }
  async function fill(message: Extract<PageMessage, { type: 'fill-fields' }>): Promise<PageResponse> {
    if (!sessionCurrent(message)) return stale(message.requestId); const results = [];
    for (const confirmed of message.fields) {
      const stored = runtimeFields.get(confirmed.fieldId); const field = stored ? currentField(stored) : undefined;
      if (!field) { results.push({ fieldId: confirmed.fieldId, outcome: { status: 'failed' as const, fieldId: confirmed.fieldId, reason: 'field is unavailable; rescan required' } }); continue; }
      try { const outcome = await fillField(field, confirmed.value, { confirmed: true, overwrite: confirmed.overwrite === true }); const verification = outcome.status === 'filled' ? verifyField(field, confirmed.value) : undefined; results.push({ fieldId: confirmed.fieldId, outcome, verification }); }
      catch { results.push({ fieldId: confirmed.fieldId, outcome: { status: 'failed' as const, fieldId: confirmed.fieldId, reason: 'field operation failed' } }); }
    }
    return { type: 'fill-result', requestId: message.requestId, results };
  }
  function focusField(message: Extract<PageMessage, { type: 'focus-field' }>): PageResponse {
    if (!sessionCurrent(message)) return stale(message.requestId); const field = runtimeFields.get(message.fieldId); const element = field && currentField(field)?.elements[0];
    if (!element) return { type: 'focus-result', requestId: message.requestId, fieldId: message.fieldId, focused: false };
    highlightField(element); return { type: 'focus-result', requestId: message.requestId, fieldId: message.fieldId, focused: true };
  }
  browser.runtime.onMessage.addListener((message: ContentPageMessage) => {
    if (message.type === 'scan-page') return Promise.resolve(scan(message.requestId, message.namespace, message.scanToken));
    if (message.type === 'focus-field') return Promise.resolve(focusField(message));
    if (message.type === 'close-preview-overlay') return closeActivePreviewOverlay(document).then(() => ({ type: 'preview-overlay-closed' as const, requestId: message.requestId }));
    if (message.type === 'open-preview-overlay') {
      const allowedUrl = new URL((browser.runtime as typeof browser.runtime & { getURL(value: string): string }).getURL('preview.html')); const requestedUrl = new URL(message.previewUrl);
      if (requestedUrl.protocol !== allowedUrl.protocol || requestedUrl.host !== allowedUrl.host || requestedUrl.pathname !== allowedUrl.pathname || requestedUrl.searchParams.get('embedded') !== '1' || requestedUrl.searchParams.get('id') !== message.sessionId) return Promise.reject(new Error('Invalid embedded preview URL'));
      createPreviewOverlay({ document, sessionId: message.sessionId, previewUrl: requestedUrl.href }); return Promise.resolve({ type: 'preview-overlay-opened' as const, sessionId: message.sessionId });
    }
    return fill(message);
  });
});
