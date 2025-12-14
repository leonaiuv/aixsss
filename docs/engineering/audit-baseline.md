# 工程现状审查与基线（Baseline）

> 目标：在不破坏现有功能的前提下，明确“上线阻断项”和可量化基线，为后续 monorepo + 后端 + 队列化 AI 工作流 + 前端数据层迁移提供对照与验收标准。

## 结论摘要（TL;DR）

当前仓库属于 **高质量 MVP**：有较完整的 TypeScript 类型体系、较多自动化测试、覆盖率门槛、性能分包策略与本地存储迁移机制。

但要升级为生产级产品，存在几项**硬阻断**：

- **AI 供应商 API Key 在浏览器端使用**（当前通过 `src/lib/ai/factory.ts` 直接调用供应商），即使加密存储也无法满足生产安全基线；必须迁移到服务端托管密钥、队列化执行与审计。
- **持久化完全依赖 LocalStorage**：不支持多端一致性、协作、审计与配额控制；同时 LocalStorage 容量、并发写入与恢复策略在真实用户规模下不可控。
- **缺少服务端数据模型与权限边界**：目前无法满足账号体系（用户/团队）、RBAC、配额/计费、审计日志、可观察性等生产必需能力。

## 项目基线（可量化）

- **Lint/Test**：`apps/web` 当前 `pnpm -C apps/web run check` / 根目录 `pnpm run check` 通过。测试中存在多处 React/Radix 相关 `act(...)` 警告（不阻塞现状，但属于“生产级严谨性”债务，需要在迁移期逐步清零）。
- **构建体积（vite build）**：
  - `dist/assets/Editor-*.js` 约 233KB（gzip ~68KB）
  - `dist/assets/radix-ui-*.js` 约 161KB（gzip ~50KB）
  - `dist/assets/react-vendor-*.js` 约 142KB（gzip ~46KB）
  - `dist/assets/charts-*.js` 约 410KB（gzip ~110KB）
  - `dist/assets/index-*.js` 约 147KB（gzip ~43KB）
  - CSS 约 51KB（gzip ~10KB）
- **覆盖率门槛**：`vitest.config.ts` 设置了基线阈值（lines/functions/statements 70%，branches 60%），具备“防回退”能力。

## 现有实现亮点（保留并迁移）

- **存储迁移与备份**：`apps/web/src/lib/storage.ts` 有版本迁移、备份/恢复与清理孤立数据的机制；对后续“从 LocalStorage 迁移到服务端”非常有价值（可复用其 schema 与迁移路径思路）。
- **密钥管理系统雏形**：`apps/web/src/lib/keyManager.ts` 支持按用途派生密钥（CONFIG/PROJECT/SCENE/GENERAL），并保留遗留数据兼容逻辑。
- **性能分包**：`apps/web/vite.config.ts` 已做手动分包（react/radix/charts/dnd/utils/crypto），对生产构建与首屏性能有帮助。

## 上线阻断项与风险清单

### 1) 安全：AI Key 暴露（阻断）

- 现状：`apps/web/src/lib/ai/factory.ts`（历史实现）在浏览器侧调用供应商；生产级已迁移为 API 模式（Key 不下发浏览器）。
- 风险：
  - 任何前端加密都无法阻止“运行时/内存/DevTools/恶意扩展”获取 key；
  - 无法做真正的配额、速率限制、审计、计费归因；
  - 供应商风控下容易触发封禁，且无法做统一重试/降级/熔断。
- 方向：服务端托管密钥 + 队列化任务执行 + 统一观测与审计（与计划的 `ConfigService/WorkflowService/JobQueue` 对齐）。

### 2) 数据：LocalStorage 单点（阻断）

- 现状：项目/分镜/配置曾主要存储在 LocalStorage（见 `apps/web/src/lib/storage.ts`、`apps/web/src/stores/*`）；生产级默认走 API 模式并提供本地数据导入云端入口。
- 风险：
  - 多端不一致、无法协作、难以恢复与审计；
  - LocalStorage 容量与写入频率限制（尤其在长文本编辑/批量生成场景）；
  - 无法进行服务端检索、统计、计费、合规留存策略。
- 方向：以 Postgres 为事实来源；前端以 TanStack Query 同步；保留“渐进式导入”方案将旧 LocalStorage 数据迁移入库。

### 3) 测试严谨性：`act(...)` 警告（中风险）

- 现状：测试通过但存在多处 `act(...)` 警告，说明部分 UI 更新没有以“用户行为”方式稳定收敛。
- 方向：迁移到 Playwright 端到端 + Axe 可访问性测试后，这类问题会更容易复现与定位；单测逐步消除警告并提升可信度。

### 4) 生产 Web 元信息/安全响应头缺失（中风险）

- `apps/web/index.html` 仍可进一步补齐生产级 meta（title/description/OG 等）。
- 生产级建议：SEO/OG、PWA/manifest（可选）、CSP、Referrer-Policy、Permissions-Policy、严格缓存策略（由 CDN/反代控制）。

### 5) 调试能力泄露（中风险）

- `apps/web/src/main.tsx` 引入 `@/lib/ai/debugLogger`，需确保生产环境不暴露敏感调试入口（可按需加守卫）。
- 方向：以环境变量/feature flag 控制，仅在 dev/staging 或具备管理员权限时启用。

### 6) 加密参数强度（低~中风险，迁移后应删除）

- `PBKDF2_ITERATIONS = 10000` 对现代设备与攻击模型偏低。
- 方向：在服务端使用 KMS/密钥托管（或 libsodium/argon2id 等更稳健方案）；浏览器端仅保留“本地加密临时缓存”能力（非核心安全边界）。

## 下一步（与实施计划对齐）

- 完成 monorepo 结构（`apps/web` 复用现有前端，新增 `apps/api`、`apps/worker`、`packages/shared`）。
- 后端落地：NestJS + Prisma + Postgres + Redis（队列/速率限制/事件），并实现最小可用的 Project/Scene/Config/AIJob API。
- AI 工作流：将现有 `src/lib/ai/*` 逻辑拆成“共享 Prompt/Schema”与“服务端 Provider/Worker 执行”两部分；前端只消费进度与结果。
- 前端迁移：引入 TanStack Query 与路由，把 `stores` 中的实体数据逐步替换为服务端同步；提供 LocalStorage→服务端的一键迁移入口与回滚策略。


