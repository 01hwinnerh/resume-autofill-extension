import type { ScanTarget } from './scan-session';
import type { PageResponse, PreviewOverlayMessage } from '../shared/messages';

export interface PreviewTabPort {
  sendMessage(tabId: number, message: PreviewOverlayMessage, options?: { frameId: number }): Promise<PageResponse>;
}

export async function openPreviewInTargetTab(
  tabs: PreviewTabPort,
  target: ScanTarget,
  sessionId: string,
  previewUrl: string,
): Promise<void> {
  const response = await tabs.sendMessage(target.tabId, {
    type: 'open-preview-overlay', sessionId, previewUrl,
  }, { frameId: 0 });
  if (response.type !== 'preview-overlay-opened' || response.sessionId !== sessionId) {
    throw new Error('目标招聘页未能确认预览窗口已打开，请返回目标页并重新扫描。');
  }
}

export type TargetTabState = 'active' | 'suspended' | 'invalidated';

export function targetTabState(target: ScanTarget, tab: { id?: number; url?: string }): TargetTabState {
  if (tab.id !== target.tabId) return 'suspended';
  return tab.url === target.url ? 'active' : 'invalidated';
}
