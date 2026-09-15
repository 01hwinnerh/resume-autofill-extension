# 简历填写助手

一个基于 WXT、React 和 Chrome Manifest V3 的本地优先浏览器扩展。它扫描招聘表单，将页面字段与本机资料匹配，在用户预览确认后填写；**不会自动提交申请**。

## 功能

- 侧边栏提供“填写助手 / 我的资料 / 自定义字段”三个明确入口。
- 扫描标准 HTML 表单，展示匹配状态、置信度、页面当前值与候选填写值。
- 高置信度（严格大于 50%）、`policy=auto`、非敏感且无临时值的普通字段可快速填写；其余字段进入逐项预览，完整预览始终可用。
- 预览会说明每项需要确认的原因，敏感值默认脱敏；填写完成后提供状态反馈，**永不自动提交**。
- 未匹配的安全文本、日期和数字控件可输入本次值，也可保存为自定义字段；映射默认作用于“所有网站”，并可改为当前网站或当前页面。
- 自定义字段支持搜索、新建、编辑、删除；映射列表支持查看目标、编辑作用域和删除单条映射，删除字段会同步删除其映射。
- 完整资料中心支持多段教育、工作和项目经历的新增、复制、排序与删除，继续使用兼容旧数据的扁平 indexed key。
- 扫描页面已存在的重复经历容器并按段落索引匹配，使第二段资料进入第二段页面容器。
- 保留页面已有值，填写后逐字段校验；文件上传、验证码、登录和最终提交始终手动完成。

## 隐私与安全边界

资料、填写策略和网站映射仅保存在当前 Chrome 配置的扩展本地存储中。当前版本没有后端、远程同步、AI 服务、遥测或账号系统。扫描时不会把完整资料发送给页面；只有用户在预览面板最终确认的字段值才会传给当前活动页进行填写。

扩展不会自动提交表单，不处理文件上传、CAPTCHA、短信验证、登录/OAuth、反自动化检查，也不会自动创建页面中的重复经历区块。

## 安装依赖与开发

要求：Node.js 20+、npm，以及本机安装的 Google Chrome（综合测试使用）。

```bash
npm install
npm run dev
```

仓库保留 `pnpm-lock.yaml`；团队如统一使用 Corepack/pnpm，也可以运行对应的 `pnpm` 命令。请勿在未计划升级时改动依赖版本。

## 构建并加载到 Chrome

```bash
npm run build
```

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择仓库中的 `.output/chrome-mv3`。
5. 在扩展详情中打开侧边栏，或进入“扩展程序选项”维护完整资料。

### 日常更新

拉取代码后，如依赖清单未变化，无需重复安装。运行 `npm run build`，然后在 `chrome://extensions` 对该扩展点击“重新加载”。若开发服务器正在运行，可使用 WXT 的开发构建与热更新。

## 本地综合测试页

单独启动 fixture 服务：

```bash
npm run fixtures:serve -- --port 4173
```

浏览器访问：

- `http://127.0.0.1:4173/basic-form.html`
- `http://127.0.0.1:4173/comprehensive-form.html`
- `http://127.0.0.1:4173/controlled-form.html`
- `http://127.0.0.1:4173/dynamic-form.html`

自动化 E2E 会先构建测试扩展，再启动同一 fixture 服务：

```bash
npm run e2e
```

## 测试与质量检查

```bash
npm test
npm run typecheck
npm run build
npm run e2e
git diff --check
```

## 目录结构

- `entrypoints/`：WXT 后台、页面 runtime、侧边栏和完整资料中心。
- `src/form-engine/`：DOM 扫描、标签解析、字段指纹和运行时描述。
- `src/matching/`：通用字段字典、评分、置信度和匹配解析。
- `src/filling/`：标准控件填写与填写后校验。
- `src/profile/`、`src/storage/`：本地资料、网站映射及持久化。
- `src/runtime/`：活动标签页、消息编排和错误边界。
- `src/ui/`：可复用视图、资料字段定义和纯 UI 逻辑。
- `tests/unit/`：Vitest 与 Testing Library 单元/交互测试。
- `tests/fixtures/`、`tests/e2e/`：本地综合页面及 Playwright 流程。

## 路线图：Git 同步与配置迁移

**导出/导入目前尚未实现，Git 同步也不是现有能力。** 后续计划按以下顺序推进：

1. 为资料、字段和映射定义独立 schema 版本及兼容迁移器。
2. 提供本地 JSON 导出/导入，并在写入前展示新增、覆盖、删除和冲突预览。
3. 增加可选加密（用户自行保存密钥或口令），避免明文配置进入 Git。
4. 提供可选的 Git 仓库同步流程，不默认上传任何资料。
5. 为新电脑迁移提供明确步骤：旧设备导出 → 安全传输/同步 → 新设备预览冲突 → 确认导入 → 在目标网站重新验证映射。

设计背景见 [`docs/superpowers/specs/2026-09-14-resume-autofill-extension-design.md`](docs/superpowers/specs/2026-09-14-resume-autofill-extension-design.md)。
