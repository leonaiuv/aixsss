# Beta 版本优化方向与对齐计划

根据对 `manga-creator-beta-prd.md` 和现有代码库 (`manga-creator-beta/`) 的深入分析，我发现当前的 Beta 版本实现与 PRD 设计存在显著的架构差异。为了确保项目按照既定目标（Agent 驱动、状态持久化）发展，我建议进行以下优化：

## 1. 架构核心对齐 (Critical)

目前的实现使用了自研的 Checkpoint 系统 (`lib/checkpoint`) 和直接的 AI 服务调用，而 PRD 明确要求使用 **LangGraph.js**。这是最大的优化点。

* **现状**: `lib/checkpoint` + `ai-service.ts` (直接 `generateText` 调用)。

* **目标**: 引入 **LangGraph.js** + **LangGraph Checkpoint SQLite**。

* **行动**:

  1. 安装 `@langchain/langgraph` 和 `@langchain/langgraph-checkpoint-sqlite`。
  2. 定义 `AgentState` (项目状态、分镜列表、工作流状态)。
  3. 构建 StateGraph (状态机)，定义节点 (`Node`) 和边 (`Edge`)。
  4. 替换现有的 `lib/checkpoint`，使用 LangGraph 的原生持久化机制。

## 2. 工具系统标准化

目前的 AI 功能是硬编码在 Service 层的，没有利用大模型原生的 "Tool Calling" 能力。

* **现状**: `ai-service.ts` 中手动拼接 Prompt 并解析 JSON。

* **目标**: 使用 Vercel AI SDK 标准 `tool()` 定义。

* **行动**:

  1. 将 `generateScenes` 和 `refineScene` 重构为标准工具。
  2. 利用 Zod 定义严格的输入/输出 Schema。
  3. 将工具集成到 LangGraph 的 Agent 节点中。

## 3. 状态管理与同步机制优化

PRD 强调 "双层状态管理" (Zustand UI 状态 + LangGraph Agent 状态)。

* **现状**: 编辑器通过 `/api/agent/update-canvas` 更新自定义的 Checkpoint Store。

* **目标**: 建立标准的 "UI <-> Agent" 同步桥梁。

* **行动**:

  1. 更新 `sync.ts`，使其通过 LangGraph API 更新 Agent 状态。
  2. 确保前端 Zustand Store 正确地从 Agent 状态 "hydrate" (注水/恢复)。

## 4. 实施计划 (Roadmap)

我建议分三步走：

### 第一步：引入 LangGraph 基础架构

* [ ] 安装依赖 (`@langchain/langgraph`, etc.)。

* [ ] 在 `src/lib/agent/graph.ts` 中定义 `StateGraph`。

* [ ] 配置 SQLite Checkpoint。

### 第二步：迁移 AI 能力为工具

* [ ] 创建 `src/lib/agent/tools/` 目录。

* [ ] 将 `ai-service.ts` 逻辑重构为 `generateScenesTool` 和 `refineSceneTool`。

### 第三步：对接 UI 与 API

* [ ] 修改 `/api/chat/route.ts` 以使用 LangGraph 运行时。

* [ ] 更新 `/api/agent/update-canvas` 适配新的状态结构。

请确认是否同意按照此方向进行优化？确认后我将开始 **全面实现。**
