import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { fillField } from '../src/filling/control-filler';
import { verifyField } from '../src/filling/verify-field';
import { highlightField } from '../src/form-engine/focus-field';
import { scanDocument, toDescriptor } from '../src/form-engine/scanner';
import type { RuntimePageField } from '../src/form-engine/runtime-types';
import { extractApplicationMetadata } from '../src/runtime/application-identity';
import { createRuntimeError } from '../src/runtime/runtime-errors';
import type { ConfirmedFill, PageFieldsChangedMessage, PageMessage, PageResponse } from '../src/shared/messages';
import { browser } from 'wxt/browser';

const installedKey = '__resumeAutofillFormRuntimeInstalled';

export default defineUnlistedScript(() => {
  const page = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (page[installedKey]) return;
  page[installedKey] = true;

  const runtimeFields = new Map<string, RuntimePageField>();
  let baselineFingerprints = new Set<string>();
  let lastNotifiedCount = 0;
  let hasScanned = false;
  let changeTimer: number | undefined;
  const observers = new Map<Document, MutationObserver>();

  function documentAtPath(framePath: number[]): Document | undefined {
    let current = document;
    for (const index of framePath) {
      const frame = current.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame')[index];
      try {
        if (!frame?.contentDocument) return undefined;
        current = frame.contentDocument;
      } catch {
        return undefined;
      }
    }
    return current;
  }

  function scanFrameTree(currentDocument: Document, framePath: number[] = []): RuntimePageField[] {
    const currentLocation = currentDocument.defaultView?.location;
    const fields = scanDocument(currentDocument, {
      url: currentLocation?.href ?? location.href,
      host: currentLocation?.host ?? location.host,
      title: currentDocument.title,
      framePath,
    }).map((field) => ({
      ...field,
      fieldId: `frame-${framePath.join('.') || 'main'}-${field.fieldId}`,
    }));

    const frames = Array.from(currentDocument.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame'));
    frames.forEach((frame, index) => {
      try {
        if (frame.contentDocument) fields.push(...scanFrameTree(frame.contentDocument, [...framePath, index]));
      } catch {
        // Cross-origin frames remain unavailable without explicit host permissions.
      }
    });
    return fields;
  }

  function fieldFingerprint(field: RuntimePageField): string {
    return `${field.framePath.join('.')}:${field.fingerprint}`;
  }

  function observedDocuments(currentDocument: Document, result: Document[] = []): Document[] {
    result.push(currentDocument);
    for (const frame of currentDocument.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame')) {
      try {
        if (frame.contentDocument) observedDocuments(frame.contentDocument, result);
      } catch {
        // Cross-origin frames cannot be observed from this runtime.
      }
    }
    return result;
  }

  function scheduleFieldChangeCheck(): void {
    if (!hasScanned) return;
    if (changeTimer !== undefined) window.clearTimeout(changeTimer);
    changeTimer = window.setTimeout(() => {
      const current = scanFrameTree(document);
      const newFieldCount = current.filter((field) => !baselineFingerprints.has(fieldFingerprint(field))).length;
      attachObservers();
      if (newFieldCount <= lastNotifiedCount) return;
      lastNotifiedCount = newFieldCount;
      const message: PageFieldsChangedMessage = { type: 'page-fields-changed', newFieldCount };
      void browser.runtime.sendMessage(message).catch(() => undefined);
    }, 450);
  }

  function containsPotentialField(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as Element;
    return ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'FRAME'].includes(element.tagName)
      || element.querySelector('input,textarea,select,iframe,frame') !== null;
  }

  function relevantMutations(records: MutationRecord[]): boolean {
    return records.some((record) => record.type === 'attributes'
      ? containsPotentialField(record.target)
      : Array.from(record.addedNodes).some(containsPotentialField));
  }

  function attachObservers(): void {
    const documents = new Set(observedDocuments(document));
    for (const [observedDocument, observer] of observers) {
      if (documents.has(observedDocument)) continue;
      observer.disconnect();
      observers.delete(observedDocument);
    }
    for (const currentDocument of documents) {
      if (observers.has(currentDocument)) continue;
      const Observer = currentDocument.defaultView?.MutationObserver;
      if (!Observer || !currentDocument.documentElement) continue;
      const observer = new Observer((records) => {
        if (relevantMutations(records)) scheduleFieldChangeCheck();
      });
      observer.observe(currentDocument.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'],
      });
      observers.set(currentDocument, observer);
    }
  }

  function scan(requestId: string): PageResponse {
    try {
      const fields = scanFrameTree(document);
      runtimeFields.clear();
      for (const field of fields) runtimeFields.set(field.fieldId, field);
      baselineFingerprints = new Set(fields.map(fieldFingerprint));
      lastNotifiedCount = 0;
      hasScanned = true;
      attachObservers();
      return {
        type: 'scan-result',
        requestId,
        result: { descriptors: fields.map(toDescriptor), metadata: extractApplicationMetadata(document) },
      };
    } catch {
      return {
        type: 'error',
        requestId,
        error: createRuntimeError('SCAN_FAILED', 'The page could not be scanned.', true),
      };
    }
  }

  function currentField(field: RuntimePageField): RuntimePageField | undefined {
    if (field.elements.some((element) => element.isConnected)) return field;
    const currentDocument = documentAtPath(field.framePath);
    if (!currentDocument) return undefined;
    const currentLocation = currentDocument.defaultView?.location;
    const candidate = scanDocument(currentDocument, {
      url: currentLocation?.href ?? location.href,
      host: currentLocation?.host ?? location.host,
      title: currentDocument.title,
      framePath: field.framePath,
    }).find((next) => next.fingerprint === field.fingerprint);
    return candidate ? { ...candidate, fieldId: field.fieldId } : undefined;
  }

  async function fill(requestId: string, fields: ConfirmedFill[]): Promise<PageResponse> {
    const results = [];
    for (const confirmed of fields) {
      const stored = runtimeFields.get(confirmed.fieldId);
      const field = stored ? currentField(stored) : undefined;
      if (!field) {
        results.push({
          fieldId: confirmed.fieldId,
          outcome: { status: 'failed' as const, fieldId: confirmed.fieldId, reason: 'field is unavailable' },
        });
        continue;
      }

      try {
        const outcome = await fillField(field, confirmed.value, {
          confirmed: true,
          overwrite: confirmed.overwrite === true,
        });
        const verification = outcome.status === 'filled'
          ? verifyField(field, confirmed.value)
          : undefined;
        results.push({ fieldId: confirmed.fieldId, outcome, verification });
      } catch {
        results.push({
          fieldId: confirmed.fieldId,
          outcome: {
            status: 'failed' as const,
            fieldId: confirmed.fieldId,
            reason: 'field operation failed',
          },
        });
      }
    }
    return { type: 'fill-result', requestId, results };
  }

  function focusField(requestId: string, fieldId: string): PageResponse {
    const stored = runtimeFields.get(fieldId);
    const field = stored ? currentField(stored) : undefined;
    const element = field?.elements[0];
    if (!element) return { type: 'focus-result', requestId, fieldId, focused: false };
    highlightField(element);
    return { type: 'focus-result', requestId, fieldId, focused: true };
  }

  browser.runtime.onMessage.addListener((message: PageMessage) => {
    if (message.type === 'scan-page') return Promise.resolve(scan(message.requestId));
    if (message.type === 'focus-field') return Promise.resolve(focusField(message.requestId, message.fieldId));
    return fill(message.requestId, message.fields);
  });
});
