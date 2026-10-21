# 简历填写助手

一个本地优先、确认优先的 Chrome MV3 简历填写扩展：扫描招聘表单、匹配本地资料、页内预览确认后填写，**不会自动提交申请**。

## 当前能力

- 扫描标准控件、同源/获授权的跨域 iframe 与 open Shadow DOM；支持动态页面重新扫描。
- 通用字段匹配、多段教育/工作/项目经历、Formily、原生下拉与 Combobox；现有站点专用 Adapter 只有 ByteDance Jobs。
- 在招聘页内显示 preview，用户确认后才填写；保留已有值，逐字段校验，不自动上传文件或提交。
- 资料、自定义字段、填写策略与字段映射保存在 `chrome.storage.local`。
- V2 明文 JSON 备份包含个人资料、映射和投递记录；V1 备份仍可导入。导入通过 transaction journal 协调恢复，失败时阻止部分覆盖。
- 填写后保存 pending application draft；用户真实提交后仍需手动确认，才会写入投递记录与阶段时间线。
- Playwright 同时覆盖 runtime harness 和加载真实构建产物的扩展 E2E。

## 安装与更新

要求：Node.js 20+、npm、Google Chrome。仓库以 `package-lock.json` / npm 为唯一包管理基线。

```bash
git clone git@github.com:01hwinnerh/resume-autofill-extension.git
cd resume-autofill-extension
npm ci
npm run build
```

在 `chrome://extensions` 开启“开发者模式”，选择“加载已解压的扩展程序”，加载 `.output/chrome-mv3`。更新代码后执行 `npm ci && npm run build`，在扩展页点击“重新加载”，再刷新招聘页面。

## 使用

1. 在“我的资料”维护资料，打开招聘申请页。
2. 在侧边栏点击“扫描当前页面”；检查目标标签页、iframe 警告和字段结果。
3. 选择字段并打开页内 preview，确认或修改后填写。
4. 人工处理附件、验证码及最终提交。
5. 真实提交完成后，由用户手动确认并保存投递记录。

## 权限与用户触发边界

| 权限 | 用途与边界 |
| --- | --- |
| `activeTab` | 用户在侧边栏发起扫描/填写时确定当前目标标签页；不用于后台轮询。 |
| `scripting` | 在该次用户操作绑定的标签页和可访问 frame 注入 `form-runtime.js`。 |
| `storage` | 在扩展本地保存资料、映射、投递记录、pending draft、preview session 与恢复 journal。 |
| `sidePanel` | 提供扫描、复核和填写入口。 |
| `http://*/*`、`https://*/*` host permissions | Chrome 对跨域 iframe 注入要求显式 host access；仍只在用户点击扫描/填写后执行，不表示后台采集。 |

浏览器拒绝权限、受限页面（如 `chrome://`）或不可访问 frame 会被明确提示。单个 frame 不可访问时，UI 显示“部分 iframe 已跳过”，可访问 frame 的结果仍保留；整页注入失败时提示检查网站权限。扩展不在后台采集页面内容，也不会把完整资料发送到远程服务器。

## 仿真回归覆盖

`tests/fixtures/` 中 Greenhouse/Lever/Workday 风格页、通用页、组件页和 third-round 页用于**仿真回归覆盖**。`npm run evaluate:matching` 对版本化标注 corpus 检查 `profileKey/status/sectionIndex`，并与分组阈值快照比较：8 组 HTML fixture 计入 scanner + matcher；仓库没有 ByteDance 脱敏 HTML，其既有测试描述符明确标记为 descriptor-only，只计入 matcher-only，不混入 scanner 指标。

这些指标不是、也不得表述为真实线上准确率。新增平台 Adapter 前必须先提供可复现的真实页面证据，并将去标识、去个人信息的最小 HTML/descriptor 样本及版本化标注加入 corpus；没有样本时只维护通用匹配，不新增猜测性 Adapter。

本地 fixture 服务：

```bash
npm run fixtures:serve -- --port 4173
```

常用页面包括 `/all-features-ats.html`、`/greenhouse-ats.html`、`/lever-ats.html`、`/workday-ats.html`、`/component-ats.html` 和 `/third-round-ats.html`。

## 开发与验证

```bash
npm run dev
npm run typecheck
npm test                       # 等价于 test:unit
npm run test:unit
npm run test:e2e-extension     # 等价于 e2e；构建并加载真实扩展
npm run evaluate:matching      # 离线仿真匹配回归
npm run bench:forms            # 100/300/1000 控件，多轮 p50/p95
npm run build
npm run zip
```

质量基线与限制见 [`docs/quality-baseline.md`](docs/quality-baseline.md)。

## 安全边界

- 不自动提交、上传文件、处理验证码、短信验证、登录或 OAuth。
- 不创建页面中尚不存在的重复经历区块。
- 扫描结果绑定目标 tab/URL；页面变化、不可访问或会话失效时阻止继续填写并要求重扫。
- JSON 备份为明文，只应保存在可信设备。

## 技术栈

WXT · React · TypeScript · Chrome Manifest V3 · Vitest · Playwright
