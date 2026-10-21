# 当前验证清单

更新时间：2026-09-23（Asia/Shanghai）

本页仅记录已经由当前工作区实现并验证的能力；fixture 指标不是线上准确率。详细数字见 [`../quality-baseline.md`](../quality-baseline.md)。

## 自动验证

```bash
npm run typecheck
npm test
npm run evaluate:matching
npm run bench:forms
npm run build
npm run e2e
git diff --check
```

| 检查项 | 当前证据 |
| --- | --- |
| TypeScript | `npm run typecheck` 通过 |
| 单元/组件 | 49 个文件、299 个测试通过 |
| 仿真匹配 | scanner + matcher：67 个 HTML 标注、63 个正确 profileKey；matcher-only：6 个 descriptor、6 个正确；均为 0 错配、0 误匹配 |
| 浏览器 E2E | 31 个测试通过，含真实 MV3 扩展加载 |
| Chrome MV3 构建 | `npm run build` 生成 `.output/chrome-mv3` |
| 差异格式 | `git diff --check` 通过 |

## 行为与权限

- [x] 扫描不修改表单；只有用户确认字段才填写，且不触发提交。
- [x] 支持标准 DOM、open Shadow DOM 和可访问 frame；不可访问 frame 显示 warning。
- [x] 已有值保护、受控输入校验、动态重扫、失败隔离与 stale session 阻断。
- [x] 文件上传、CAPTCHA、短信、登录/OAuth 和最终提交保持人工处理。
- [x] V2 备份覆盖资料、映射和投递记录；导入使用恢复 journal。
- [x] `activeTab`/`scripting` 仅在用户扫描或填写时使用；`http/https` host permissions 用于跨域 iframe 注入，不代表后台采集。
- [x] fixture 不包含真实个人资料、凭据或密钥。

## 手工加载

1. 执行 `npm ci && npm run build`。
2. 在 `chrome://extensions` 启用开发者模式，加载 `.output/chrome-mv3`。
3. 使用脱敏资料验证侧边栏扫描、页内 preview、部分字段填写、iframe warning 和手动投递记录。
4. 刷新或切换页面，确认旧扫描会话不能继续填写。

## 已知限制

- 没有新真实站点样本，不能声称真实线上覆盖率或准确率。
- 只有既有 ByteDance Jobs 专用 Adapter；Greenhouse/Lever/Workday 名称仅表示本地仿真样式。
- 不支持自动文件上传、自动提交或云端跨设备同步。
