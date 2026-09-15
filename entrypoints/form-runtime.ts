import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { fillField } from '../src/filling/control-filler';
import { verifyField } from '../src/filling/verify-field';
import { highlightField } from '../src/form-engine/focus-field';
import { scanDocument, toDescriptor } from '../src/form-engine/scanner';
import type { RuntimePageField } from '../src/form-engine/runtime-types';
import { createRuntimeError } from '../src/runtime/runtime-errors';
import type { ConfirmedFill, PageMessage, PageResponse } from '../src/shared/messages';
import { browser } from 'wxt/browser';

const installedKey = '__resumeAutofillFormRuntimeInstalled';

export default defineUnlistedScript(() => {
  const page = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (page[installedKey]) return;
  page[installedKey] = true;

  const runtimeFields = new Map<string, RuntimePageField>();

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

  function scan(requestId: string): PageResponse {
    try {
      const fields = scanFrameTree(document);
      runtimeFields.clear();
      for (const field of fields) runtimeFields.set(field.fieldId, field);
      return {
        type: 'scan-result',
        requestId,
        result: { descriptors: fields.map(toDescriptor) },
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
          overwrite: false,
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
