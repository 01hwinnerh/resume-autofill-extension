# 秋招工具链项目交接说明

更新时间：2026-09-15（Asia/Shanghai）

本文面向接手本仓库的 Agent 或开发者。内容区分“当前已实现事实”“已经确认的产品方向”和“尚未实现的后续方案”，不得把后两者当成现有代码能力。

## 1. 接手前先确认

仓库路径：`/Users/bytedance/Study/vibe/resume-autofill-extension`

当前分支：`aime/1789464099-profile-mapping-workflow`

当前 HEAD：`d9dec1a795a153a1398bf067d82a3e2be7635893`，提交标题为 `feat: add profile mapping scopes and multi-entry support`。

当前工作区在本次交接前是干净的，当前分支已跟踪 `origin/aime/1789464099-profile-mapping-workflow`。不要假设它仍然是早期的 `feat/resume-autofill-mvp` 分支；`d9dec1a` 已经重构了资料管理、映射作用域、扫描逻辑和 UI 入口。

接手后的第一组只读检查：

```bash
cd /Users/bytedance/Study/vibe/resume-autofill-extension
git status --short --branch
git log --oneline --decorate -12
npm test
npm run typecheck
npm run build
```

综合浏览器测试命令是：

```bash
npm run e2e
```

它会由 Playwright 配置启动本地 fixture 服务，并在已安装的 Google Chrome 中运行。`playwright.config.ts` 内部使用 `pnpm build:test` 和 `pnpm fixtures:serve --port 4173`；仓库保留 `pnpm-lock.yaml`，修改包管理方式前先确认影响。

## 2. 用户目标和不可突破的约束

用户正在准备秋招，目标是提高以下环节的效率和竞争力：

```text
岗位发现 → 材料准备 → 快速投递 → 面试准备 → 面试复盘 → 知识补齐
```

当前用户约束：

- 开发必须在当前项目范围内进行，不影响其他项目。
- 所有开发沿一条串行工作线进行，不派发智能体，不创建额外 worktree。
- 依赖安装、构建和项目内修改已获授权。
- 不得主动降级覆盖范围、准确性、安全性或用户体验；若只能降级实现，必须先停下说明利弊并等待用户决定。
- 信息不清晰且会改变架构、数据安全或目标范围时，先停下集中提问。
- 个人资料、Cookie、Token、密码、内部代码和未公开业务数据不得写入仓库、日志或外发服务。
- 自动化只能辅助填写和整理，不能自动提交申请、绕过 CAPTCHA、短信验证、登录/OAuth、反自动化检查或自动选择文件上传。
- AI 接入可以无限期延后，不得把 AI 作为当前 MVP 的前置依赖。

## 3. 当前产品定位

当前仓库是一个 Chrome Manifest V3 浏览器扩展，产品定位是“本地优先、确认优先的招聘表单填写助手”。它不是自动投递机器人，也不是当前阶段的投递记录系统。

当前扩展有两个主要界面：

- 侧边栏：处理当前活动页面的扫描、匹配、确认、填写、资料快速编辑、自定义字段和映射管理。
- Options 页面：维护完整个人资料，支持多段教育、工作和项目经历。

当前后台流程是：

```text
Side panel
  → background service worker
  → query active tab
  → inject form-runtime.js
  → scan page descriptors
  → load local profile and mappings
  → generic matching
  → user review
  → send only confirmed fields
  → fill page controls
  → verify each field
  → return per-field result and summary
```

页面扫描只返回字段描述；资料匹配在扩展上下文中完成；只有用户确认的字段值才会传给活动页面。

## 4. 当前已经实现的能力

### 4.1 表单扫描和填写

- 扫描标准 HTML 表单控件。
- 识别关联 label、祖先 label、aria-label、placeholder、name、id、autocomplete 和语义分组。
- 支持文本、邮箱、电话、URL、搜索、数字、日期、月份、周、时间、本地日期时间、下拉框、单选框和复选框等标准控件。
- 扫描页面中的重复教育、工作和项目容器，并按段落索引匹配多段资料。
- 保留页面已有值，不默认覆盖。
- 填写后逐字段校验。
- 单字段失败不会丢弃其他成功结果。
- 动态新增页面区域可以通过新的用户扫描识别。
- 文件输入、密码、验证码类区域、登录和最终提交保持人工处理。

### 4.2 资料中心

完整资料字段定义位于 `src/ui/profile-fields.ts`，资料持久化由 `src/profile/profile-store.ts` 和 `src/storage/local-storage.ts` 完成。

当前 Options 页面支持：

- 基本资料维护；
- 多段教育经历的新增、复制、排序、删除；
- 多段工作经历的新增、复制、排序、删除；
- 多段项目经历的新增、复制、排序、删除；
- 兼容旧版本扁平 indexed key；
- 资料预览和未保存状态提示；
- 本地存储提示。

当前 Side panel 支持快速资料编辑和自定义字段管理。自定义字段 key 必须使用 `custom.` 命名空间。

### 4.3 映射作用域

`src/shared/mapping.ts` 定义三种作用域：

- `global`：所有网站；
- `host`：当前网站；
- `path`：当前网站的指定页面路径。

`src/storage/mapping-store.ts` 负责持久化、旧映射作用域归一化、写入队列和按资料字段删除映射。删除自定义资料字段时会同步删除对应映射。

当前 UI 支持查看、编辑作用域和删除单条映射。映射 ID 通过 `createMappingId` 根据作用域、指纹和资料字段生成。

### 4.4 测试和验证状态

本次基于当前交接分支重新验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 26 个测试文件、97 个测试通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，生成 Chrome MV3 包 |
| `npm run e2e` | 11 个测试通过 |

E2E 覆盖基础控件、综合控件、受控输入、动态区域、重复经历、已有值保护、文件/CAPTCHA 边界、失败隔离和手动提交边界。

验证时曾发现本地端口 `4173` 被遗留 fixture 进程占用；确认是本项目端口上的具体 Node 进程后停止该进程，随后 E2E 全部通过。它不是代码失败，不要通过修改端口边界来掩盖同类问题。

## 5. 关键代码入口

| 目录或文件 | 职责 |
| --- | --- |
| `entrypoints/background.ts` | 创建 Controller、注入本地存储和 AdapterRegistry、接收扩展消息 |
| `entrypoints/form-runtime.ts` | 注入活动页面，扫描字段、维护运行时字段句柄、执行填写和校验 |
| `entrypoints/sidepanel/App.tsx` | 侧边栏视图切换、扫描、资料、映射和填写流程 |
| `entrypoints/sidepanel/ReviewPanel.tsx` | 扫描结果预览、字段选择、填写确认和定位页面字段 |
| `entrypoints/options/App.tsx` | 完整资料中心和多段经历管理 |
| `src/form-engine/` | DOM 扫描、标签解析、字段指纹和运行时描述 |
| `src/matching/` | 通用字段词典、评分、置信度和匹配解析 |
| `src/adapters/` | Adapter 类型、Generic Adapter 和注册表 |
| `src/filling/` | 标准控件填写、原生值更新和校验 |
| `src/profile/`、`src/storage/` | Profile、Mapping 和浏览器本地存储 |
| `src/runtime/application-controller.ts` | 活动标签页、页面 runtime、匹配和填写结果编排 |
| `tests/fixtures/`、`tests/e2e/` | 本地招聘类 fixture 和 Playwright 流程 |

## 6. 当前没有实现的能力

以下内容不能在交接时写成“已经支持”：

- 真实招聘平台 Adapter；当前 `AdapterRegistry` 有契约和注册机制，但 `background.ts` 创建的注册表没有加入具体平台 Adapter。
- Chrome Web Store 发布；当前构建可以作为本地解压扩展加载，但还没有商店图标、截图、隐私声明和完整发布材料。
- 投递工作台：岗位记录、状态、截止时间、简历版本、提醒和统计尚未实现。
- 面试项目证据库与故事教练尚未实现，初步方案见 `docs/superpowers/plans/2026-09-15-interview-evidence-story-coach-initial-plan.md`。
- 文件上传、开放题答案库、投递历史、多份独立简历版本和 AI 均不在当前代码中。
- Git 同步、JSON 导入导出和跨设备同步尚未实现；当前 README 已明确说明该路线图不是现有能力。

## 7. 投递工作台的已确认方向

用户已认可“投递工作台与自动填写插件逻辑一体、界面分离”的方向。后续目标不是做两个互不相干的产品，而是：

```text
同一个扩展、同一个仓库、同一份本地数据
├── 侧边栏：当前岗位快速操作
├── Options/工作台页面：岗位、投递、简历版本、提醒和统计
└── 共享数据层：资料、映射、岗位记录、投递事件
```

推荐的交互链路：

1. 用户打开岗位页面。
2. 侧边栏读取页面标题、URL 和当前平台信息。
3. 用户点击“保存岗位”，创建或更新岗位记录。
4. 用户扫描页面，检查匹配并确认字段。
5. 用户完成填写、附件上传、验证码和最终提交。
6. 用户点击“已投递”，工作台记录投递时间、岗位状态和使用的材料版本。
7. 用户下次打开同一岗位时，侧边栏展示历史状态和已有映射。

必须保留“用户点击已投递”这一步，不能根据填写完成或检测到提交按钮自动推断投递成功。

工作台的完整表格、筛选、统计和提醒不应全部塞进侧边栏。侧边栏只保留当前页面相关操作，Options 页面逐步升级为完整工作台；未来确实需要跨设备同步时，再评估独立 Web 客户端和后端。

## 8. 接手后的建议顺序

除非用户改变目标，建议按以下顺序推进：

1. 先评审并确认投递工作台的数据边界和页面入口。
2. 在当前扩展中增加岗位记录领域，不先接后端。
3. 增加侧边栏“保存岗位”和“已投递”操作，工作台页面提供列表、筛选和状态编辑。
4. 选择用户最常投递的一个真实平台，单独设计并实现 Adapter。
5. 另行创建独立的面试项目证据库工具，不把长文本编辑和面试训练逻辑塞进表单 runtime。

## 9. 开发交接规则

- 先读取本文、当前设计文档和当前实施计划，再读取具体代码。
- 不要以旧分支、旧测试数量或旧 README 片段覆盖当前 `d9dec1a` 的事实。
- 新功能必须先写测试，再写实现；遇到同一错误重复三次，停止并说明根因和决策点。
- 任何涉及真实平台、登录、上传、商店发布、外部服务或个人资料的动作，都要明确记录权限边界。
- 新模块要保持单一职责，优先扩展现有接口，不直接把工作台逻辑写入 `form-runtime.ts`。
- 当前本地存储是单用户本地优先方案；不要为了提前支持云同步引入后端、账号或远程 AI。
- 每个阶段结束后运行相关测试、类型检查、构建和 `git diff --check`，再提交独立 commit。

## 10. 交接结论

当前仓库已经是可构建、可测试、具备多段资料和作用域映射能力的表单填写 MVP；它可以作为后续秋招工具链的浏览器入口，但还不是完整投递管理系统。下一步的产品扩展应采用“扩展内集成工作台、工作台页面与侧边栏分工、面试证据库独立建设”的边界。
