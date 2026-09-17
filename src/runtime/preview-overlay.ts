export const PREVIEW_OVERLAY_HOST_ATTRIBUTE = 'data-resume-autofill-preview-overlay';
export const PREVIEW_CLOSE_MESSAGE = 'resume-autofill-close-preview';
export const PREVIEW_REQUEST_CLOSE_MESSAGE = 'resume-autofill-request-preview-close';

export interface PreviewOverlayOptions {
  document: Document;
  sessionId: string;
  previewUrl: string;
}

export interface PreviewOverlayController {
  close(): void;
  requestClose(): void;
  host: HTMLElement;
  frameWindow(): Window | null;
}

const activeOverlays = new WeakMap<Document, PreviewOverlayController>();

export async function closeActivePreviewOverlay(document: Document): Promise<void> {
  activeOverlays.get(document)?.close();
  await new Promise<void>((resolve) => {
    const view = document.defaultView;
    if (view?.requestAnimationFrame) view.requestAnimationFrame(() => resolve());
    else view?.setTimeout(resolve, 0) ?? resolve();
  });
}

export function postMessageOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
}

export function requestPreviewFrameClose(frame: Pick<Window, 'postMessage'>, sessionId: string, targetOrigin: string): void {
  frame.postMessage({ type: PREVIEW_REQUEST_CLOSE_MESSAGE, sessionId }, targetOrigin);
}

function overlayStyles(): string {
  return `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 3vh 3vw; background: rgba(10, 20, 38, .68); backdrop-filter: blur(4px); }
    .dialog { display: grid; grid-template-rows: auto minmax(0, 1fr); width: min(1500px, 94vw); height: 92vh; overflow: hidden; border: 1px solid rgba(255,255,255,.55); border-radius: 18px; background: #fff; box-shadow: 0 28px 80px rgba(0,0,0,.36); }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; padding: 8px 12px 8px 18px; border-bottom: 1px solid #dce5f2; color: #172033; background: #f8fbff; font: 700 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .close { min-width: 76px; min-height: 36px; border: 1px solid #cbd8e9; border-radius: 10px; color: #33425a; background: #fff; cursor: pointer; font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .close:focus-visible { outline: 3px solid rgba(22,119,255,.25); outline-offset: 2px; }
    iframe { width: 100%; height: 100%; border: 0; background: #f3f7fc; }
    @media (max-width: 720px) { .backdrop { padding: 1.5vh 2vw; } .dialog { width: 96vw; height: 96vh; border-radius: 13px; } }
  `;
}

export function createPreviewOverlay(options: PreviewOverlayOptions): PreviewOverlayController {
  const { document, sessionId, previewUrl } = options;
  const iframeUrl = new URL(previewUrl);
  const extensionOrigin = postMessageOrigin(iframeUrl.href);
  const parentOrigin = document.defaultView?.location.origin;
  if (parentOrigin && parentOrigin !== 'null') iframeUrl.searchParams.set('parentOrigin', parentOrigin);
  activeOverlays.get(document)?.close();
  document.querySelectorAll<HTMLElement>(`[${PREVIEW_OVERLAY_HOST_ATTRIBUTE}]`).forEach((existing) => existing.remove());

  const host = document.createElement('div');
  host.setAttribute(PREVIEW_OVERLAY_HOST_ATTRIBUTE, '');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = overlayStyles();
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  const dialog = document.createElement('section');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', '简历填写完整预览');
  const bar = document.createElement('header');
  bar.className = 'bar';
  bar.textContent = '简历填写完整预览';
  const closeButton = document.createElement('button');
  closeButton.className = 'close';
  closeButton.type = 'button';
  closeButton.textContent = '关闭预览';
  closeButton.setAttribute('aria-label', '关闭简历填写预览');
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl.href;
  iframe.title = '简历填写预览';
  bar.append(closeButton);
  dialog.append(bar, iframe);
  backdrop.append(dialog);
  shadow.append(style, backdrop);

  const body = document.body;
  const previousOverflow = body.style.overflow;
  let closed = false;
  let closeFallback: number | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    if (closeFallback !== undefined) document.defaultView?.clearTimeout(closeFallback);
    document.removeEventListener('keydown', onKeydown, true);
    document.defaultView?.removeEventListener('message', onMessage);
    host.remove();
    body.style.overflow = previousOverflow;
    activeOverlays.delete(document);
  };
  const requestClose = () => {
    const frame = iframe.contentWindow;
    if (!frame) { close(); return; }
    requestPreviewFrameClose(frame, sessionId, extensionOrigin);
    if (closeFallback === undefined) closeFallback = document.defaultView?.setTimeout(close, 1500);
  };
  const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose(); };
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; sessionId?: unknown } | null;
    if (event.source !== iframe.contentWindow
      || event.origin !== extensionOrigin
      || !data
      || data.type !== PREVIEW_CLOSE_MESSAGE
      || data.sessionId !== sessionId) return;
    close();
  };
  closeButton.addEventListener('click', requestClose);
  document.addEventListener('keydown', onKeydown, true);
  document.defaultView?.addEventListener('message', onMessage);
  body.style.overflow = 'hidden';
  (document.documentElement ?? body).append(host);
  const controller = { close, requestClose, host, frameWindow: () => iframe.contentWindow };
  activeOverlays.set(document, controller);
  closeButton.focus();
  return controller;
}

export function requestEmbeddedPreviewClose(parent: Pick<Window, 'postMessage'>, sessionId: string, targetOrigin: string): void {
  parent.postMessage({ type: PREVIEW_CLOSE_MESSAGE, sessionId }, targetOrigin);
}

export function mutationTouchesPreviewOverlay(record: MutationRecord): boolean {
  const isOverlayNode = (node: Node) => node instanceof Element
    && (node.hasAttribute(PREVIEW_OVERLAY_HOST_ATTRIBUTE) || Boolean(node.closest(`[${PREVIEW_OVERLAY_HOST_ATTRIBUTE}]`)));
  return isOverlayNode(record.target)
    || [...record.addedNodes, ...record.removedNodes].some(isOverlayNode);
}
