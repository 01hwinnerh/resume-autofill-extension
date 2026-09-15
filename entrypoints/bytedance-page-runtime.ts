import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { annotateByteDancePage } from '../src/adapters/bytedance-page-schema';

const installedKey = '__resumeAutofillByteDanceSemanticsInstalled';

export default defineUnlistedScript(() => {
  const page = globalThis as typeof globalThis & { [installedKey]?: boolean };
  if (page[installedKey]) {
    annotateByteDancePage(document);
    return;
  }
  page[installedKey] = true;

  let scheduled = false;
  const annotate = () => {
    scheduled = false;
    annotateByteDancePage(document);
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(annotate);
  });

  annotate();
  observer.observe(document.documentElement, { childList: true, subtree: true });
});
