import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { fillField } from '../src/filling/control-filler';
import { verifyField } from '../src/filling/verify-field';
import { highlightField } from '../src/form-engine/focus-field';
import { scanDocument, toDescriptor } from '../src/form-engine/scanner';
import type { RuntimePageField } from '../src/form-engine/runtime-types';
import { extractApplicationMetadata } from '../src/runtime/application-identity';
import { createRuntimeError } from '../src/runtime/runtime-errors';
import type { ConfirmedFill, PageMessage, PageResponse } from '../src/shared/messages';
import { browser } from 'wxt/browser';

const installedKey = '__resumeAutofillFormRuntimeInstalled';

export default defineUnlistedScript(() => {
  const page = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (page[installedKey]) return;
  page[installedKey] = true;

  const runtimeFields = new Map<string, RuntimePageField>();
  const elementIdentities = new WeakMap<HTMLElement, number>();
  let nextElementIdentity = 0;
  let activeScanToken: string | undefined;
  let baselineFingerprint = '';
  let baselineFieldFingerprints = new Set<string>();
  let sessionObserver: MutationObserver | undefined;
  let mutationTimer: number | undefined;

  function fieldsForDocument(namespace = 'frame'): RuntimePageField[] {
    return scanDocument(document, { url: location.href, host: location.host, title: document.title, framePath: [] })
      .map((field) => ({ ...field, fieldId: `${namespace}-${field.fieldId}` }));
  }

  function pageFingerprint(fields = fieldsForDocument('fingerprint')): string {
    const identity = (element: HTMLElement) => {
      let value = elementIdentities.get(element);
      if (value === undefined) { value = ++nextElementIdentity; elementIdentities.set(element, value); }
      return value;
    };
    return [location.href, document.title, ...fields.map((field) => `${field.fingerprint}@${field.elements.map(identity).join('.')}`)].join('||');
  }

  function observeSession(): void {
    sessionObserver?.disconnect();
    if (mutationTimer !== undefined) clearTimeout(mutationTimer);
    sessionObserver = new MutationObserver((records) => {
      const relevant = records.some((record) => record.type === 'attributes'
        || Array.from(record.addedNodes).some((node) => node.nodeType === Node.ELEMENT_NODE
          && ((node as Element).matches('input,textarea,select,iframe,frame') || Boolean((node as Element).querySelector('input,textarea,select,iframe,frame'))))
        || Array.from(record.removedNodes).some((node) => node.nodeType === Node.ELEMENT_NODE));
      if (!relevant) return;
      if (mutationTimer !== undefined) clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        const currentFields = fieldsForDocument('fingerprint');
        if (pageFingerprint(currentFields) === baselineFingerprint) return;
        sessionObserver?.disconnect();
        const newFieldCount = currentFields.filter((field) => !baselineFieldFingerprints.has(field.fingerprint)).length;
        void browser.runtime.sendMessage({
          type: 'page-fields-changed', newFieldCount, sessionInvalidated: true,
        }).catch(() => undefined);
      }, 250);
    });
    if (document.documentElement) sessionObserver.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'],
    });
  }

  function stale(requestId: string): PageResponse {
    return { type: 'error', requestId, error: createRuntimeError('FIELD_OPERATION_FAILED', '页面步骤、关键字段或 iframe 已变化，请重新扫描。', true) };
  }

  function sessionCurrent(message: PageMessage): boolean {
    if (message.scanToken !== activeScanToken) return false;
    return !message.expectedFingerprint || message.expectedFingerprint === pageFingerprint();
  }

  function scan(requestId: string, namespace?: string, scanToken?: string): PageResponse {
    try {
      const fields = fieldsForDocument(namespace);
      runtimeFields.clear();
      for (const field of fields) runtimeFields.set(field.fieldId, field);
      activeScanToken = scanToken;
      baselineFingerprint = pageFingerprint(fields);
      baselineFieldFingerprints = new Set(fields.map((field) => field.fingerprint));
      observeSession();
      return {
        type: 'scan-result', requestId,
        result: {
          descriptors: fields.map(toDescriptor),
          metadata: window === window.top ? extractApplicationMetadata(document) : undefined,
          fingerprint: baselineFingerprint,
          frameUrl: location.href,
          childFrameCount: document.querySelectorAll('iframe,frame').length,
        },
      };
    } catch {
      return { type: 'error', requestId, error: createRuntimeError('SCAN_FAILED', 'The frame could not be scanned.', true) };
    }
  }

  function currentField(field: RuntimePageField): RuntimePageField | undefined {
    if (field.elements.every((element) => element.isConnected)) return field;
    return undefined;
  }

  async function fill(message: Extract<PageMessage, { type: 'fill-fields' }>): Promise<PageResponse> {
    if (!sessionCurrent(message)) return stale(message.requestId);
    const results = [];
    for (const confirmed of message.fields) {
      const stored = runtimeFields.get(confirmed.fieldId);
      const field = stored ? currentField(stored) : undefined;
      if (!field) {
        results.push({ fieldId: confirmed.fieldId, outcome: { status: 'failed' as const, fieldId: confirmed.fieldId, reason: 'field is unavailable; rescan required' } });
        continue;
      }
      try {
        const outcome = await fillField(field, confirmed.value, { confirmed: true, overwrite: confirmed.overwrite === true });
        const verification = outcome.status === 'filled' ? verifyField(field, confirmed.value) : undefined;
        results.push({ fieldId: confirmed.fieldId, outcome, verification });
      } catch {
        results.push({ fieldId: confirmed.fieldId, outcome: { status: 'failed' as const, fieldId: confirmed.fieldId, reason: 'field operation failed' } });
      }
    }
    return { type: 'fill-result', requestId: message.requestId, results };
  }

  function focusField(message: Extract<PageMessage, { type: 'focus-field' }>): PageResponse {
    if (!sessionCurrent(message)) return stale(message.requestId);
    const field = runtimeFields.get(message.fieldId);
    const element = field && currentField(field)?.elements[0];
    if (!element) return { type: 'focus-result', requestId: message.requestId, fieldId: message.fieldId, focused: false };
    highlightField(element);
    return { type: 'focus-result', requestId: message.requestId, fieldId: message.fieldId, focused: true };
  }

  browser.runtime.onMessage.addListener((message: PageMessage) => {
    if (message.type === 'scan-page') return Promise.resolve(scan(message.requestId, message.namespace, message.scanToken));
    if (message.type === 'focus-field') return Promise.resolve(focusField(message));
    return fill(message);
  });
});
