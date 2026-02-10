# AI Agent 迁移 V1（务实版）

## 目标
- 在不破坏现有工作流接口的前提下，把高复杂任务升级为可回退的 Agent 执行模式。
- 迁移顺序固定：角色扩充 -> 叙事因果链 Phase3/4 -> Supervisor 编排。
- 时长估算等规则化任务继续保留普通函数调用。

## 当前落地范围
- Agent Runtime：`apps/worker/src/agents/runtime/jsonToolLoop.ts`
  - JSON 指令循环（`tool_call | final`）
  - `maxSteps` / `stepTimeoutMs` / `totalTimeoutMs`
  - fallback 到 legacy
  - trace 输出
- 角色扩充 Agent：
  - 入口不变：`POST /workflow/projects/:projectId/characters/expand`
  - 任务：`expand_story_characters`
  - 保持“候选后导入”，不自动写入角色表
- 叙事因果链 Phase3/4 Agent 包装：
  - 入口不变：`POST /workflow/projects/:projectId/narrative-causal-chain`
  - 对 phase=3/4 开启 Agent 规划 + fallback，phase1/2 保持 legacy
  - 结果新增：`executionMode` / `fallbackUsed` / `agentTrace` / `stepSummaries`
- Supervisor 首版（手动触发）：
  - 新入口：`POST /workflow/projects/:projectId/supervisor/run`
  - 新任务：`run_workflow_supervisor`
  - 固定步骤：
    1. 角色扩充
    2. 因果链 Phase3（按需）
    3. 因果链 Phase4（按需）
    4. 角色关系图谱
    5. 情绪弧线
  - 策略：遇错即停；子步骤内部可 fallback

## 关键兼容约束
- 所有已有 API 路径与入参保持兼容。
- Agent 失败默认自动回退 legacy（受开关控制）。
- 不新增 trace 表，trace 暂存于 `AIJob.result/progress`。

## 环境开关
- `AI_AGENT_CHARACTER_EXPANSION_ENABLED`
- `AI_AGENT_NARRATIVE_PHASE34_ENABLED`
- `AI_AGENT_SUPERVISOR_ENABLED`
- `AI_AGENT_FALLBACK_TO_LEGACY`
- `AI_AGENT_MAX_STEPS`
- `AI_AGENT_STEP_TIMEOUT_MS`
- `AI_AGENT_TOTAL_TIMEOUT_MS`

## 前端入口
- 工作台新增“`一键运行 Agent 流程`”按钮：
  - 触发 `apiWorkflowRunSupervisor`
  - 完成后刷新项目、分集、关系图、情绪弧线与当前场景数据
  - 显示执行模式与是否触发回退

## 测试清单（本次已补齐）
- shared：
  - `packages/shared/src/schemas/agentTrace.test.ts`
  - `packages/shared/src/systemPrompts.test.ts`
- worker：
  - `apps/worker/src/agents/runtime/jsonToolLoop.test.ts`
  - `apps/worker/src/tasks/expandStoryCharacters.agent.test.ts`
  - `apps/worker/src/tasks/buildNarrativeCausalChain.phase34.agent.test.ts`
  - `apps/worker/src/tasks/runWorkflowSupervisor.test.ts`
- api：
  - `apps/api/src/jobs/workflow.controller.test.ts`
  - `apps/api/src/jobs/jobs.service.test.ts`

## 后续建议
- 在 `AIJob` 之外补一张标准化 step 表（如 `AIJobStep`）以提升可检索性和分析能力。
- 为 Supervisor 增加 project 级互斥（防并发覆盖）。
- 将 Supervisor 从“手动触发”演进到“可配置编排策略”（分步重试/跳过策略）。
