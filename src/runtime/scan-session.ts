export interface ScanTarget {
  tabId: number;
  windowId?: number;
  url: string;
  title: string;
  scannedAt: string;
}

export interface TabIdentity {
  id?: number;
  url?: string;
}

export function isScanTargetCurrent(target: ScanTarget, tab: TabIdentity): boolean {
  return tab.id === target.tabId && tab.url === target.url;
}

export function assertScanTarget(target: ScanTarget, tab: TabIdentity): void {
  if (tab.id !== target.tabId) {
    throw new Error('当前页面已切换，请重新扫描后再继续。');
  }
  if (tab.url !== target.url) {
    throw new Error('当前页面地址已变化，请重新扫描后再继续。');
  }
}
