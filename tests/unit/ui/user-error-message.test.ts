import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageError } from '../../../src/storage/storage-port';
import { userErrorMessage } from '../../../src/ui/user-error-message';

describe('userErrorMessage', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    [{ code: 'CONTENT_SCRIPT_UNAVAILABLE', message: 'frame missing' }, /嵌入区域已变化.*重新扫描/],
    [{ message: 'stale session fingerprint mismatch' }, /扫描结果已失效.*重新扫描/],
    [{ message: 'validity format mismatch' }, /输入内容格式.*修改后重试/],
    [new StorageError('conflict', 'write', 'private-key', new Error('raw conflict')), /其他扩展页面.*重试/],
    [new StorageError('unsupported_schema', 'read', 'private-key', undefined), /较新版本的数据.*升级扩展.*不会被覆盖/],
  ])('turns technical failures into actionable Chinese guidance', (error, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = userErrorMessage(error, '保存失败');
    expect(message).toMatch(expected); expect(message).not.toContain('private-key'); expect(message).not.toContain('raw conflict');
  });
});
