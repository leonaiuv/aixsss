# ActionBeat V1（动作拆解层）复盘

## 背景与目标

现有“一个分镜 → 3 张关键帧（KF0/KF1/KF2）”在剪辑上经常出现动作断裂、跳帧、观众“看不出在动”的问题。根因通常不是动画/补间技术，而是**分镜内部的动作拆解能力**不足：一个 Scene 往往包含多个动作点/信息点，3 张图承载不下，也缺少可用于下游 I2V 的稳定运动线索。

V1 的工程化目标是：在 `Scene` 与 `Keyframes` 之间新增一层 **ActionBeat（动作段）**，把“start-mid-end 三段式”变成硬约束，并结构化落库，便于校验、修复、复用与后续迭代（画布/可视化编辑/局部重生成）。

## V1 落地范围（传统构建）

- Scene 先生成 `ActionPlanJson`（beats 列表，每个 beat 强制 start/mid/end 状态）
- 再按 beat 生成 `KeyframeGroupsJson`（每个 beat 输出 start/mid/end 的 `frame_spec`）
- **兼容旧链路**：把第 1 个 beat 的 start/mid/end 映射回老的 `scene.shotPrompt`（KF0/KF1/KF2 JSON），不改现有 UI 与生图链路

## 存储方案（方案 A：Scene 增加 JSON 字段）

在 `Scene` 上新增字段：

- `actionPlanJson`：动作拆解结果（beats）
- `keyframeGroupsJson`：关键帧输出（按 beat 分组）
- `motionGroupsJson`：预留（按 beat 的运动提示，下游 I2V 用）

对应迁移：`apps/api/prisma/migrations/20260107190000_add_action_beats/migration.sql`

## JSON 契约（下游消费的核心接口）

当前 V1 重点固化 3 个对象：

- `ActionPlanJson`：`scene_id / scene_summary / beats[]`（每个 beat 含 `start_state / mid_state / end_state`）
- `KeyframeGroupsJson`：`scene_id / groups[]`（每个 group 对应一个 beat，强制 `start/mid/end` 三帧）
- `FrameSpec`：单帧规格，强调“瞬间定格”（`action_snapshot` 禁止连续叙事词）

实现位置：`apps/worker/src/tasks/actionBeats.ts`

## Pipeline 接入点（传统版本）

- `generate_keyframe_prompt`：先生成 `actionPlanJson/keyframeGroupsJson`，再把第 1 组映射写入 `scene.shotPrompt`；若 ActionBeat 流程失败，会回退旧版 KF0/KF1/KF2 生成。
  - 入口：`apps/worker/src/tasks/generateKeyframePrompt.ts`
- `refine_scene_all`：keyframe 步骤切到 ActionBeat；失败回退旧版 KF0/KF1/KF2，保证 refine-all 可用性。
  - 入口：`apps/worker/src/tasks/refineSceneAll.ts`

## 校验与自动修复（V1 关键）

V1 的思路是“尽量用纯代码校验 + 必要时 LLM repair 兜底”：

1. **结构校验**：JSON parse + zod 校验（字段齐全、类型正确）
2. **语义校验（关键帧）**
   - `action_snapshot` 禁止连续叙事词（then/after/starts to/逐渐/慢慢/然后…）
   - 同 beat 内 anchors/camera 稳定（除非明确切镜头）
   - 三帧必须有足够可见差异点（≥3 个变化点：姿势/手/重心/视线/道具状态/画面位置…）
3. **连续性校验（beat 间）**：`prev_end` ≈ `next_start`（人物位置/朝向/手持道具等稳定字段保持一致或可解释的小变化）
4. **自动修复（repair）**
   - 结构/语义失败：对原输出做“校验-修复”重试
   - 连续性失败：用 `prev_end_frame_spec + next_start_frame_spec + beat_summary` 触发 repair，目标是最小修改 next_start 以承接 prev_end

## 兼容策略与已知限制

- 兼容优先：老 UI/生图仍只用 `scene.shotPrompt`（第 1 个 beat 的三帧）
- 多 beat 的“逐组生图/逐组 motionGroups”尚未贯通（字段已落库，导出已携带）
- 后续要做可视化编辑/局部重生成，建议升级到方案 B（Beat 表）

## 如何跑迁移（开发/部署）

- 本地开发（生成并应用迁移）：`pnpm -C apps/api prisma:migrate`
- 生产/CI 部署（仅应用已存在迁移）：`pnpm -C apps/api prisma:deploy`（等价 `prisma migrate deploy`）

Windows 上若遇到 Prisma `EPERM rename query_engine-windows.dll.node`（文件占用），通常是有 Node 进程占用 `.prisma` 引擎文件：

- 先停掉 `apps/api` / `apps/worker` 的运行进程再重试
- 或用 `prisma migrate dev --skip-generate`，然后单独跑 `prisma generate`

## 下一步（建议迭代）

- 方案 B：新增 `Beat/ShotUnit` 表，支持 UI 编辑、局部重生成、回滚
- `motionGroupsJson`：基于 beats 生成运动提示，适配 I2V
- 画布版本：增加 Scene/Beats 节点，用于触发生成并可视化查看 `actionPlanJson/keyframeGroupsJson`
