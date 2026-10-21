# 质量基线

日期：2026-09-23（Asia/Shanghai）

## 环境

- macOS 26.6.2（Apple M3 Pro，36 GiB）
- Node.js 24.19.0，npm 11.17.0
- 本仓库 `package-lock.json` 安装结果
- 基准为 jsdom 离线扫描与通用匹配，不等同于 Chrome 页面端到端耗时

## 仿真匹配回归

命令：`npm run evaluate:matching`。阈值快照位于 `tests/quality/matching-baseline.json`。

评测按证据链分组，禁止混算：

### Scanner + matcher（HTML fixture）

包含通用、Greenhouse 风格、Lever 风格、Workday 风格、组件/Formily、third-round、iframe 和 all-features，共 8 组版本化 HTML fixture。

| 指标 | 当前值 |
| --- | ---: |
| 标注/识别字段 | 67 / 63 |
| 正确 profileKey | 63 |
| 错误 profileKey / 误匹配 | 0 / 0 |
| 未识别 | 4 |
| missing_profile | 2 |
| needs_confirmation | 17 |
| 自动可用（matched） | 44 |
| 已标注 profileKey 正确率 | 100.00% |
| 自动可用覆盖率 | 65.67% |

### Matcher-only（descriptor-only）

仓库没有 ByteDance 脱敏 HTML fixture。`bytedance-adapter-descriptors@1` 仅来自既有 Adapter 单元测试描述符，因此明确标记为 `descriptor-only`，不计入 scanner 指标。

| 指标 | 当前值 |
| --- | ---: |
| 标注/识别字段 | 6 / 6 |
| 正确 profileKey | 6 |
| 错误 profileKey / 误匹配 / 未识别 | 0 / 0 / 0 |
| needs_confirmation / 自动可用 | 1 / 5 |
| profileKey 正确率 | 100.00% |
| 自动可用覆盖率 | 83.33% |

以上均为仓库脱敏 fixture 的**仿真回归覆盖**，不是线上准确率。

## 表单性能

命令：`npm run bench:forms`。每个规模预先创建一个 JSDOM fixture、安装一次 DOM globals 并预建 profile；这些 setup 全部在计时区外。轮次内只测 `scanDocument` 与 `resolveMatches`，DOM 不被修改，因此无需重建，仅复用相同最小 fixture。每 5 个控件包含 1 个“存在 id 但不在 label 索引中”的缓存 miss。

轮次：每种规模均预热 3 轮、记录 20 轮。20 个样本避免小样本下 p95 直接退化为单次最大值；仍应结合 p50、p95 与 min/max 判断抖动。

### 当前结果

| 控件数 | scanner p50 / p95 | matcher p50 / p95 | 合计 p50 / p95 |
| ---: | ---: | ---: | ---: |
| 100 | 24.82 / 26.70 ms | 12.40 / 12.51 ms | 37.21 / 39.65 ms |
| 300 | 136.03 / 139.18 ms | 36.87 / 37.44 ms | 172.85 / 176.39 ms |
| 1000 | 1312.00 / 2207.76 ms | 123.72 / 169.15 ms | 1436.52 / 2367.05 ms |

### 同口径修复前后

以下“修复前”是在相同计时边界、fixture 与 cache-miss 分布下恢复旧 fallback 行为后的定向实测；当时采用较少的 15/7/3 记录轮次。右栏是当前 20 轮结果。两者仅用于确认热点方向，不计算加速比，也不把运行噪声包装成稳定收益。

| 控件数 | fallback 修复前合计 p50 / p95 | 当前修复后合计 p50 / p95 |
| ---: | ---: | ---: |
| 100 | 38.84 / 40.67 ms | 37.21 / 39.65 ms |
| 300 | 181.95 / 193.64 ms | 172.85 / 176.39 ms |
| 1000 | 1396.93 / 1409.12 ms | 1436.52 / 2367.05 ms |

上一版文档的 69.52/79.91、262.11/263.46、1598.96/1614.33 ms 使用“每轮新建一个 JSDOM、但 setup 本身不计时”的冷 DOM 口径。当前改为每规模预建并复用 fixture，同时拆分 scanner/matcher，因此旧数值只保留为历史记录，**不得与当前结果直接计算加速比**。

数值受机器、Node/jsdom 和后台负载影响，只用于同环境趋势回归，不代表真实网站 FMP 或线上延迟。

## 测试层次

1. `npm run test:unit`：领域逻辑、scanner/matcher、1000 控件缓存 miss、存储事务和 UI 组件。
2. `npm run evaluate:matching`：版本化脱敏 corpus 与分组阈值回归。
3. `npm run bench:forms`：100/300/1000 控件离线 scanner/matcher 性能趋势。
4. `npm run test:e2e-extension`：本地 fixture、跨 frame 行为和真实构建扩展加载。
5. `npm run typecheck`、`npm run build`、`git diff --check`：静态、产物与补丁卫生检查。

## 已知限制与新增样本流程

- 当前没有用户提供的新真实站点样本，无法度量真实线上覆盖率、准确率或真实页面性能。
- 除既有 ByteDance Jobs Adapter 外，不依据品牌仿真页新增平台 Adapter；ByteDance 当前仅有 matcher-only descriptor 证据。
- 新平台先保存去标识、去个人信息的最小复现 HTML fixture/descriptor，记录来源版本与预期标注；只有 HTML 经 scanner 生成的结果才计入 scanner + matcher 指标。
- 浏览器拒绝权限或跨域 frame 不可访问时，UI 会报告 frame warning；该 frame 不计作已扫描覆盖。
