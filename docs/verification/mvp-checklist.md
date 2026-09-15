# MVP verification checklist

更新时间：2026-09-15

本文只记录当前仓库中已经实现并验证的 P0 能力。真实招聘平台 Adapter、投递历史、多份简历、回答库和 AI 不属于当前 MVP 验收范围。

## Automated verification

在仓库根目录依次执行：

```bash
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
git diff --check
```

当前已验证结果：

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | 通过 | `pnpm typecheck` exit code 0 |
| 单元测试 | 通过 | 20 个测试文件，72 个测试通过 |
| 浏览器 E2E | 通过 | 本地 fixture，7 个测试通过 |
| Chrome MV3 构建 | 通过 | `pnpm build` 生成 `.output/chrome-mv3` |
| 差异格式检查 | 通过 | `git diff --check` |
| 普通构建权限边界 | 通过 | 普通 manifest 不包含 `host_permissions` |
| E2E 测试权限边界 | 通过 | 测试 manifest 仅包含 `http://127.0.0.1/*` |

## Behavior checklist

- [x] 扫描页面不会修改表单值。
- [x] 只有用户明确确认的字段才会填写。
- [x] 已有值的字段保持不变并返回跳过状态。
- [x] 标准文本、邮箱、下拉框、单选框和复选框可以填写并校验。
- [x] 受控输入在原生事件后重新读取并校验结果。
- [x] 动态新增表单区域可以通过新的用户扫描重新识别。
- [x] 单个字段失败不会丢弃其他已成功填写的结果。
- [x] 文件上传和 CAPTCHA 类控件保持人工处理。
- [x] 扫描和填写流程不触发提交动作。
- [x] 没有生产招聘平台 URL、真实个人资料、凭据或密钥进入 fixture、源码、日志和测试产物。

## Manual loading check

1. 执行 `pnpm build`。
2. 在 Chrome 打开 `chrome://extensions`，启用开发者模式。
3. 使用 **Load unpacked** 加载 `.output/chrome-mv3`。
4. 从扩展详情打开 options 页面，保存虚构的本地资料。
5. 打开 Chrome Side panel，选择本扩展并扫描一个本地表单页面。
6. 检查字段匹配、置信度、状态和原因后，只选择部分字段进行填写。
7. 检查填写结果和校验结果；确认最终提交按钮仍由用户手动操作。

## Known MVP limits

- 当前仅覆盖标准 DOM 表单控件和通用匹配；平台专属 Adapter 只有契约与注册机制。
- 不自动处理文件选择器、验证码、短信验证、登录/OAuth、反自动化校验或最终提交。
- 当前 profile 与 mapping 使用浏览器本地存储，未实现跨设备同步和服务端账户。
- AI 接入没有进入 MVP 的依赖、接口或验收条件，可无限期延后。
