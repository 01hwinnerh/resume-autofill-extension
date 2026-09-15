import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { fillField } from '../src/filling/control-filler';
import { verifyField } from '../src/filling/verify-field';
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

  function scan(requestId: string): PageResponse {
    try {
      const url = new URL(location.href);
      const fields = scanDocument(document, {
        url: url.href,
        host: url.host,
        title: document.title,
        framePath: [],
      });
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
    const url = new URL(location.href);
    return scanDocument(document, {
      url: url.href,
      host: url.host,
      title: document.title,
      framePath: field.framePath,
    }).find((candidate) => candidate.fingerprint === field.fingerprint);
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

  browser.runtime.onMessage.addListener((message: PageMessage) => {
    if (message.type === 'scan-page') return Promise.resolve(scan(message.requestId));
    return fill(message.requestId, message.fields);
  });
});
