# aixsss（漫剧创作助手）

面向 AIGC 漫剧/短剧创作者的创作引导系统：前端提供分镜编辑与导出；后端负责鉴权、项目/分镜存储与队列化 AI 工作流；Worker 负责执行 AI 任务（浏览器不直接持有/调用供应商 Key）。

## 快速开始（本地开发）

### 1) 安装依赖

```bash
pnpm install
```

### 2) 构建共享包

```bash
pnpm -C packages/shared build
```

> 首次安装或 `packages/shared` 代码变更后需要执行，否则 API 服务无法启动。

### 3) 启动依赖服务（Postgres / Redis / MinIO）

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4) 配置环境变量

- **API**：见 `apps/api/ENVIRONMENT.md`
- **Worker**：见 `apps/worker/ENVIRONMENT.md`
- **Web**（可选）：
  - `VITE_DATA_MODE=api|local`（默认：开发/生产走 `api`，测试走 `local`）
  - `VITE_API_BASE_PATH=/api`（默认 `/api`，本地由 Vite 代理到 `http://localhost:3001`）

### 5) 数据库迁移（首次）

在 `apps/api/.env` 配好 `DATABASE_URL` 后：

```bash
pnpm -C apps/api prisma:migrate
```

### 6) 启动开发

```bash
pnpm dev
```

或分别启动：

```bash
pnpm -C apps/api dev
pnpm -C apps/worker dev
pnpm -C apps/web dev
```

## 目录结构

```
apps/
  web/       # React + Vite 前端
  api/       # NestJS API（鉴权/项目/分镜/AI 配置/工作流）
  worker/    # BullMQ Worker（执行 AI 任务）
packages/
  shared/    # 前后端共享类型与 Zod Schema
docs/        # 审计/工程/迁移文档
```

## 本地数据迁移（local → api）

当 `apps/web` 处于 **API 模式** 且检测到浏览器里存在旧的本地项目数据时，项目列表页会出现“导入到云端”提示条。

- **导入内容**：项目 + 分镜（核心数据）
- **未导入内容**：角色/世界观等仍保持本地（后续可扩展为服务端实体）

更详细说明见 `docs/migration/local-to-api.md`。


