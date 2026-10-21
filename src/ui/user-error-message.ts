import { StorageError } from '../storage/storage-port';

interface CodedError { code?: unknown; message?: unknown }

export function userErrorMessage(error: unknown, action = '操作失败'): string {
  console.error(`[resume-autofill] ${action}`, error);
  if (error instanceof StorageError) {
    const outcome = (error as StorageError & { outcome?: unknown }).outcome;
    if (outcome === 'failed-recovered') return `${action}：操作失败，但已恢复到操作前状态；请重试。`;
    if (outcome === 'manual-recovery-required' || error.code === 'recovery_required') return `${action}：存储恢复日志正在阻塞写入，请前往“我的资料 → 配置迁移”处理后重试。`;
    if (error.code === 'corrupt_data') return `${action}：本地数据已损坏，已阻止覆盖。请在“完整备份与恢复”中导出原始数据。`;
    if (error.code === 'unsupported_schema') return `${action}：检测到较新版本的数据，请升级扩展后重试；现有数据不会被覆盖。`;
    if (error.code === 'conflict') return `${action}：其他扩展页面正在更新同一份数据，请重试。`;
    if (error.code === 'write_failed' && /[\u3400-\u9fff]/.test(error.message)) return `${action}：${error.message}`;
    return `${action}：浏览器本地存储暂时不可用，请检查扩展权限后重试。`;
  }
  const candidate = error as CodedError | undefined;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  if (code === 'FILL_IN_PROGRESS' || code === 'FILL_RESULT_UNKNOWN') return `${action}：上一次填写仍在处理或结果尚未确认，请等待并检查招聘页，不要立即重复填写；刷新后需重新扫描。`;
  const detail = typeof candidate?.message === 'string' ? candidate.message.toLocaleLowerCase() : '';
  if (code === 'TAB_UNAVAILABLE' || code === 'CONTENT_SCRIPT_UNAVAILABLE' || detail.includes('frame')) {
    return `${action}：招聘页面或其中的嵌入区域已变化，请返回页面后重新扫描。`;
  }
  if (detail.includes('stale') || detail.includes('session') || detail.includes('fingerprint')) {
    return `${action}：当前扫描结果已失效，请重新扫描后再操作。`;
  }
  if (detail.includes('valid') || detail.includes('number') || detail.includes('format')) {
    return `${action}：输入内容格式不符合字段要求，请修改后重试。`;
  }
  if (code === 'PERMISSION_DENIED') return `${action}：扩展无法访问当前页面，请检查网站权限后重试。`;
  if (code === 'CONTENT_SCRIPT_TIMEOUT') return `${action}：招聘页面响应超时，请等待页面加载完成后重试。`;
  return `${action}：未能完成操作，请重试；如果页面已经变化，请重新扫描。`;
}

export function runtimeErrorMessage(error: CodedError, action: string): string {
  return userErrorMessage(error, action);
}
