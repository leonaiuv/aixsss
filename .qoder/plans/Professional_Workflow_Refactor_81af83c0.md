# 全面专业化工作流重构计划

## 改动总览

7 项改进按依赖关系组织为 4 个改动域（Data -> Worker -> API -> Frontend），全部在一轮中完成。

---

## A. 数据层改造（Schema + DB）

### A1. 新增共享 Schema 文件

**新建 `packages/shared/src/schemas/sceneScript.ts`** -- 分场脚本层

```ts
// 核心数据结构
export const SceneScriptSchema = z.object({
  sceneHeading: z.string(), // INT. 咖啡厅 - 日
  actionLines: z.array(z.string()), // 动作行（场景描述/角色行为）
  dialogueBlocks: z.array(
    z.object({
      character: z.string(),
      parenthetical: z.string().optional(), // (低声/颤抖)
      line: z.string(),
    }),
  ),
  emotionalBeat: z.string().optional(), // 情绪节拍标注
  soundCues: z.array(SoundCueSchema).default([]), // 声音提示 -> 联动声音设计
  transitionOut: TransitionSchema.optional(), // 转场 -> 联动转场设计
  estimatedDuration: z.number().optional(), // 预估秒数 -> 联动时长估算
});
```

**新建 `packages/shared/src/schemas/characterRelationship.ts`** -- 角色关系图谱

```ts
export const RelationshipTypeSchema = z.enum([
  'family',
  'romantic',
  'friendship',
  'rivalry',
  'mentorship',
  'alliance',
  'subordinate',
  'enemy',
  'stranger',
  'custom',
]);
export const CharacterRelationshipSchema = z.object({
  id: z.string(),
  fromCharacterId: z.string(),
  toCharacterId: z.string(),
  type: RelationshipTypeSchema,
  label: z.string().max(60), // "师徒/暗恋/死敌"
  description: z.string().max(2000).default(''),
  intensity: z.number().int().min(1).max(10).default(5), // 关系强度
  arc: z
    .array(
      z.object({
        // 关系变化弧线
        episodeOrder: z.number().int(),
        change: z.string().max(500), // "从对立转为合作"
        newIntensity: z.number().int().min(1).max(10),
      }),
    )
    .default([]),
});
```

**新建 `packages/shared/src/schemas/emotionArc.ts`** -- 情绪张力弧线

```ts
export const EmotionArcPointSchema = z.object({
  episodeOrder: z.number().int().min(1),
  sceneOrder: z.number().int().min(1).optional(),
  tension: z.number().min(0).max(10), // 冲突张力 0-10
  emotionalValence: z.number().min(-5).max(5), // 情绪效价 -5(悲)~+5(喜)
  label: z.string().max(100).optional(), // "真相揭露"
  beatName: z.string().max(120).optional(), // 关联因果链节拍
});
export const EmotionArcSchema = z.object({
  points: z.array(EmotionArcPointSchema),
  generatedAt: z.string().optional(),
});
```

**新建 `packages/shared/src/schemas/shotDictionary.ts`** -- 镜头语言词典

```ts
export const ShotSizeSchema = z.enum([
  'ECU',
  'CU',
  'MCU',
  'MS',
  'MLS',
  'LS',
  'ELS',
  'XLS',
  'OTS',
  'POV',
  'INSERT',
  'TWO_SHOT',
  'GROUP',
]);
export const CameraAngleSchema = z.enum([
  'eye_level',
  'low_angle',
  'high_angle',
  'birds_eye',
  'worms_eye',
  'dutch_angle',
  'overhead',
]);
export const CameraMotionSchema = z.enum([
  'static',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'dolly_in',
  'dolly_out',
  'truck_left',
  'truck_right',
  'crane_up',
  'crane_down',
  'zoom_in',
  'zoom_out',
  'handheld',
  'steadicam',
  'whip_pan',
  'rack_focus',
]);
export const LensTypeSchema = z.enum([
  'wide',
  'normal',
  'telephoto',
  'macro',
  'fisheye',
  'anamorphic',
]);
export const ShotLanguageSchema = z.object({
  shotSize: ShotSizeSchema,
  angle: CameraAngleSchema.default('eye_level'),
  motion: CameraMotionSchema.default('static'),
  lens: LensTypeSchema.default('normal'),
  focalLength: z.string().max(20).optional(), // "35mm"
  depthOfField: z.enum(['shallow', 'medium', 'deep']).optional(),
  notes: z.string().max(500).optional(),
});
```

**新建 `packages/shared/src/schemas/transition.ts`** -- 转场设计

```ts
export const TransitionTypeSchema = z.enum([
  'cut',
  'dissolve',
  'fade_in',
  'fade_out',
  'fade_to_black',
  'wipe',
  'iris',
  'match_cut',
  'jump_cut',
  'smash_cut',
  'cross_dissolve',
  'dip_to_black',
  'L_cut',
  'J_cut',
]);
export const TransitionSchema = z.object({
  type: TransitionTypeSchema.default('cut'),
  durationMs: z.number().int().min(0).max(5000).default(0),
  motivation: z.string().max(500).optional(), // "用叠化暗示时间流逝"
  matchElement: z.string().max(200).optional(), // 匹配剪辑的关联元素
});
```

**新建 `packages/shared/src/schemas/soundDesign.ts`** -- 声音设计

```ts
export const SoundCueTypeSchema = z.enum([
  'sfx',
  'bgm',
  'ambience',
  'foley',
  'voice_over',
  'silence',
]);
export const SoundCueSchema = z.object({
  id: z.string(),
  type: SoundCueTypeSchema,
  description: z.string().max(500), // "门缓缓关上的吱呀声"
  timingHint: z.string().max(100).optional(), // "0:03-0:05" 或 "与关键帧KF3同步"
  intensity: z.enum(['subtle', 'normal', 'prominent', 'dominant']).default('normal'),
  mood: z.string().max(100).optional(), // "紧张/温馨"
  reference: z.string().max(500).optional(), // 参考曲/音效库编号
  loopable: z.boolean().default(false),
});
export const SceneSoundDesignSchema = z.object({
  cues: z.array(SoundCueSchema).default([]),
  masterMood: z.string().max(200).optional(),
  generatedAt: z.string().optional(),
});
```

**新建 `packages/shared/src/schemas/durationEstimate.ts`** -- 专业时长估算

```ts
export const DurationEstimateSchema = z.object({
  dialogueSec: z.number().min(0), // 对白时长（按字速 4字/秒）
  actionSec: z.number().min(0), // 动作/无对白镜头时长
  transitionSec: z.number().min(0), // 转场时长
  pauseSec: z.number().min(0), // 戏剧停顿
  totalSec: z.number().min(0),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  breakdown: z
    .array(
      z.object({
        sceneOrder: z.number().int(),
        seconds: z.number().min(0),
        source: z.string().max(200), // "3行对白@4字/秒 + 2个动作节拍@2秒"
      }),
    )
    .default([]),
});
```

**修改 `packages/shared/src/schemas/index.ts`** -- 注册新 Schema 导出

```ts
// 新增 6 行导出
export * from './sceneScript.js';
export * from './characterRelationship.js';
export * from './emotionArc.js';
export * from './shotDictionary.js';
export * from './transition.js';
export * from './soundDesign.js';
export * from './durationEstimate.js';
```

### A2. 修改现有 Schema

**修改 `packages/shared/src/schemas/scene.ts`** -- Scene 扩展字段

- 新增 `sceneScript: z.unknown().optional()` (分场脚本 JSON)
- 新增 `soundDesignJson: z.unknown().optional()` (声音设计 JSON)
- 新增 `transitionIn: z.unknown().optional()` (入转场)
- 新增 `transitionOut: z.unknown().optional()` (出转场)
- 新增 `shotLanguageJson: z.unknown().optional()` (标准镜头语言)
- 新增 `durationEstimateJson: z.unknown().optional()` (时长估算)

**修改 `packages/shared/src/schemas/episode.ts`** -- Episode 扩展

- `CoreExpressionSchema` 新增 `emotionArcPoints: z.array(EmotionArcPointSchema).optional()`
- 新增 `EpisodeScriptSchema`（完整集脚本的元数据）

**修改 `packages/shared/src/types.ts`** -- 新增工作流状态

- `EpisodeWorkflowState` 新增 `'SCRIPT_WRITING'` 状态（在 CORE_EXPRESSION_READY 和 SCENE_LIST_EDITING 之间）
- `SceneStatus` 新增 `'sound_design_generating'` 和 `'sound_design_confirmed'`
- 新增 `SOUND_CUE_TYPES`, `SHOT_SIZES`, `CAMERA_ANGLES`, `CAMERA_MOTIONS`, `TRANSITION_TYPES` 常量数组

### A3. Prisma Schema 改造

**修改 `apps/api/prisma/schema.prisma`**

1. `EpisodeWorkflowState` 枚举新增 `SCRIPT_WRITING`
2. `SceneStatus` 枚举新增 `sound_design_generating`, `sound_design_confirmed`
3. `Character` 模型：`relationships` 字段已有（Json?），保持不变，但语义升级为结构化关系数组
4. 新增 `CharacterRelationship` 独立模型：

```prisma
model CharacterRelationship {
  id                String   @id @default(cuid())
  projectId         String
  fromCharacterId   String
  toCharacterId     String
  type              String   // family/romantic/rivalry...
  label             String   @default("")
  description       String   @default("")
  intensity         Int      @default(5)
  arc               Json?    // 关系变化弧线 JSON
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, fromCharacterId, toCharacterId])
  @@index([projectId])
}
```

5. `Scene` 模型新增字段：

```prisma
  sceneScriptJson       Json?    // 分场脚本
  soundDesignJson       Json?    // 声音设计
  transitionInJson      Json?    // 入转场
  transitionOutJson     Json?    // 出转场
  shotLanguageJson      Json?    // 标准镜头语言参数
  durationEstimateJson  Json?    // 时长估算
```

6. `Episode` 模型新增字段：

```prisma
  sceneScriptDraft   String  @default("")  // 完整分场脚本文本草稿
  emotionArcJson     Json?                  // 情绪弧线数据
  durationEstimateJson Json?               // 集级时长估算
```

7. `Project` 模型新增关联：

```prisma
  characterRelationships CharacterRelationship[]
```

8. 新建迁移：`pnpm --filter api exec prisma migrate dev --name add_professional_workflow_v2`

---

## B. Worker 任务新增/改造

### B1. 新增 Worker 任务文件

**新建 `apps/worker/src/tasks/generateSceneScript.ts`** -- 分场脚本生成

- 输入：episodeId + coreExpression + sceneList(summaries) + 全局上下文
- 链路：为该集的每个 Scene 生成标准分场脚本（场景标题/动作行/对白块/情绪标注/声音提示/转场）
- 输出：写入 `scene.sceneScriptJson`
- 关键：需同时生成 soundCues + transitionOut，即声音/转场信息一并产出
- System Prompt key: `workflow.scene_script.system`

**新建 `apps/worker/src/tasks/generateEmotionArc.ts`** -- 情绪弧线生成

- 输入：projectId + 叙事因果链(beatFlow.escalation) + 各集 coreExpression(emotionalArc)
- 链路：遍历因果链的每个 beat 的 escalation + 情绪基调，结合各集核心表达，计算并输出跨集情绪张力点
- 输出：写入 `project.contextCache.emotionArc` 和各 `episode.emotionArcJson`
- System Prompt key: `workflow.emotion_arc.system`

**新建 `apps/worker/src/tasks/generateSoundDesign.ts`** -- 声音设计生成

- 输入：sceneId + sceneScript + sceneAnchor + motionPrompt + dialogues
- 链路：基于分场脚本的声音提示和场景锚点氛围，生成完整的 SFX/BGM/Ambience 音效标注
- 输出：写入 `scene.soundDesignJson`
- System Prompt key: `workflow.sound_design.system`

**新建 `apps/worker/src/tasks/generateCharacterRelationships.ts`** -- 角色关系图谱生成

- 输入：projectId + characters + narrativeCausalChain(characterMatrix + plotLines)
- 链路：从因果链的角色矩阵和叙事线提取关系，按集生成关系变化弧线
- 输出：写入 `CharacterRelationship` 表
- System Prompt key: `workflow.character_relationships.system`

**新建 `apps/worker/src/tasks/estimateDuration.ts`** -- 专业时长估算

- 纯计算任务（不需要 AI），基于规则引擎：
  - 对白：中文 4 字/秒，英文 3 词/秒
  - 动作节拍：每个 ActionBeat 约 2-4 秒（根据 beat 复杂度）
  - 转场：按 TransitionType 查表（cut=0, dissolve=1s, fade=1.5s...）
  - 戏剧停顿：情绪高潮点 +1-2 秒
- 输出：写入 `scene.durationEstimateJson` 和 `episode.durationEstimateJson`

### B2. 修改现有 Worker 任务

**修改 `apps/worker/src/tasks/refineSceneAll.ts`** -- 细化链路扩展

- 在现有 4 步（锚点->关键帧->运动->台词）之后新增：
  - 步骤 5: 生成声音设计（调用 generateSoundDesign 逻辑）
  - 步骤 6: 计算时长估算（调用 estimateDuration 逻辑）
- 更新 SceneStatus 流转：`completed` 前增加 `sound_design_generating` -> `sound_design_confirmed`

**修改 `apps/worker/src/tasks/generateEpisodeSceneList.ts`** -- 分镜列表升级

- userPrompt 新增：注入分场脚本上下文（如果已生成）
- 输出的每个 scene 额外携带 `shotLanguage`（标准镜头语言参数）和 `transitionOut`（默认 cut）

**修改 `apps/worker/src/tasks/contextHelpers.ts`** -- 上下文注入升级

- 新增 `formatCharacterRelationships()` 函数：从关系图谱提取当前场景涉及角色的关系摘要
- 新增 `formatSceneScript()` 函数：格式化分场脚本为 prompt 上下文
- 新增 `formatShotLanguageConstraints()` 函数：将标准镜头语言转为生成约束

**修改 `apps/worker/src/tasks/generateSceneAnchor.ts`** -- 锚点生成注入增强

- userPrompt 注入分场脚本的 `sceneHeading` 和 `actionLines` 作为环境参考
- 注入角色关系上下文（当前场景出场角色间的关系）

**修改 `apps/worker/src/tasks/actionBeats.ts`** -- ActionBeat 镜头语言约束

- `buildActionPlanPrompt` 注入场景的标准 `shotLanguage`（景别/角度/运镜）作为镜头约束
- `continuity_rules` 新增 `transition_hint` 字段

### B3. 新增 System Prompt 定义

**修改 `packages/shared/src/systemPrompts.ts`** -- 新增 6 个 System Prompt

1. `workflow.scene_script.system` - 分场脚本生成
2. `workflow.emotion_arc.system` - 情绪弧线生成
3. `workflow.sound_design.system` - 声音设计生成
4. `workflow.character_relationships.system` - 角色关系图谱生成
5. `workflow.scene_script.fix.system` - 分场脚本格式纠偏
6. `workflow.sound_design.fix.system` - 声音设计格式纠偏

---

## C. API 层改造

### C1. 新增 API 模块

**新建 `apps/api/src/character-relationships/` 目录** (controller + service + module)

- `GET /projects/:projectId/character-relationships` - 获取项目所有关系
- `POST /projects/:projectId/character-relationships` - 创建关系
- `PATCH /projects/:projectId/character-relationships/:id` - 更新关系
- `DELETE /projects/:projectId/character-relationships/:id` - 删除关系

### C2. 修改 Workflow Controller

**修改 `apps/api/src/jobs/workflow.controller.ts`** -- 新增路由

```ts
// 分场脚本
@Post('projects/:projectId/episodes/:episodeId/scene-script')
generateSceneScript(...)

// 情绪弧线
@Post('projects/:projectId/emotion-arc')
generateEmotionArc(...)

// 声音设计（单场景）
@Post('projects/:projectId/scenes/:sceneId/sound-design')
generateSoundDesign(...)

// 角色关系图谱
@Post('projects/:projectId/character-relationships/generate')
generateCharacterRelationships(...)

// 时长估算（整集）
@Post('projects/:projectId/episodes/:episodeId/duration-estimate')
estimateDuration(...)
```

### C3. 修改 JobsService

**修改 `apps/api/src/jobs/jobs.service.ts`** -- 新增 5 个 enqueue 方法

- `enqueueGenerateSceneScript()`
- `enqueueGenerateEmotionArc()`
- `enqueueGenerateSoundDesign()`
- `enqueueGenerateCharacterRelationships()`
- `enqueueEstimateDuration()`

### C4. 修改 Scene/Episode API

**修改 `apps/api/src/scenes/scenes.service.ts`** -- Scene CRUD 支持新字段

- update 方法允许写入 `sceneScriptJson`, `soundDesignJson`, `transitionInJson`, `transitionOutJson`, `shotLanguageJson`, `durationEstimateJson`

**修改 `apps/api/src/episodes/episodes.service.ts`** -- Episode CRUD 支持新字段

- update 方法允许写入 `sceneScriptDraft`, `emotionArcJson`, `durationEstimateJson`

---

## D. 前端改造

### D1. 新增 Store

**新建 `apps/web/src/stores/characterRelationshipStore.ts`**

- state: `relationships: CharacterRelationship[]`, `isLoading`, `error`
- actions: `loadRelationships`, `createRelationship`, `updateRelationship`, `deleteRelationship`, `generateRelationships`

**新建 `apps/web/src/stores/emotionArcStore.ts`**

- state: `arcPoints: EmotionArcPoint[]`, `isLoading`
- actions: `loadArc`, `generateArc`

### D2. 新增 API 客户端函数

**修改 `apps/web/src/lib/api/workflow.ts`** -- 新增 5 个 API 调用

- `apiWorkflowGenerateSceneScript()`
- `apiWorkflowGenerateEmotionArc()`
- `apiWorkflowGenerateSoundDesign()`
- `apiWorkflowGenerateCharacterRelationships()`
- `apiWorkflowEstimateDuration()`

**新建 `apps/web/src/lib/api/characterRelationships.ts`** -- 关系 CRUD API

### D3. 新增/修改前端组件

**新建 `apps/web/src/components/editor/CharacterRelationshipGraph.tsx`**

- 角色关系图谱可视化组件（使用力导向图或简单节点连线布局）
- 节点 = 角色（头像+名字），边 = 关系（类型+标签+强度映射为线宽）
- 支持点击边查看/编辑关系详情
- 支持按集切换查看关系变化

**新建 `apps/web/src/components/editor/EmotionArcChart.tsx`**

- 情绪张力弧线可视化组件（折线图/面积图）
- X 轴 = 集/场景序号，Y 轴双轴 = tension(0-10) + emotionalValence(-5~5)
- 标注关键点（真相揭露/高潮/转折）
- 数据源：因果链 beatFlow.escalation + emotionalTone + coreExpression.emotionalArc

**新建 `apps/web/src/components/editor/SceneScriptEditor.tsx`**

- 分场脚本编辑器组件
- 格式化显示场景标题（INT./EXT.）、动作行、对白块（角色名+表演提示+台词）
- 支持 AI 生成 + 手动编辑
- 内联声音提示标注（SFX/BGM 高亮）
- 内联转场标注

**新建 `apps/web/src/components/editor/SoundDesignPanel.tsx`**

- 声音设计面板组件
- 时间轴式展示 SFX/BGM/Ambience/Foley 层
- 每个音效标注含类型图标、描述、时间提示、强度
- 支持 AI 生成 + 手动添加/编辑/删除

**新建 `apps/web/src/components/editor/ShotLanguageSelector.tsx`**

- 镜头语言选择器组件（下拉/卡片式）
- 景别 8 种 + 角度 7 种 + 运镜 17 种 + 镜头 6 种，带图标和中英文说明
- 组合选择后实时预览当前镜头描述文本

**新建 `apps/web/src/components/editor/TransitionSelector.tsx`**

- 转场类型选择器组件
- 14 种转场类型带图标描述 + 时长滑块 + 动机说明

**新建 `apps/web/src/components/editor/DurationEstimateBar.tsx`**

- 时长估算条形图组件
- 按分镜分段显示（对白/动作/转场/停顿）的时间占比
- 总集时长 + 各分镜时长排布

### D4. 修改现有前端组件

**修改 `apps/web/src/components/editor/EpisodeWorkflow.tsx`** -- 核心工作流改造

- 在单集创作的 Tabs 中，将 3 个 Tab 扩展为 5 个：
  1. 核心表达 (Core Expression) -- 现有
  2. **分场脚本 (Scene Script)** -- 新增，嵌入 SceneScriptEditor
  3. 分镜列表 (Scene List) -- 现有
  4. 分镜细化 (Scene Refinement) -- 现有
  5. **声音 & 时长 (Sound & Timing)** -- 新增，嵌入 SoundDesignPanel + DurationEstimateBar
- 工作台（WorkflowWorkbench）任务清单新增：分场脚本完成度、声音设计完成度、时长估算状态
- 左侧步骤导航新增"情绪弧线"步骤（在因果链和剧集规划之间），嵌入 EmotionArcChart
- 导出功能扩展：导出内容增加分场脚本、声音标注表、时长估算

**修改 `apps/web/src/components/editor/BasicSettings.tsx`** -- 全局设定扩展

- 在"角色管理" Tab 中嵌入 CharacterRelationshipGraph 子面板

**修改 `apps/web/src/components/editor/CharacterManager.tsx`** -- 角色管理增强

- 角色详情面板新增"关系"区域：显示该角色的所有关系连线
- 支持从角色管理界面直接添加/编辑关系

**修改 `apps/web/src/components/editor/SceneRefinement.tsx`** -- 分镜细化扩展

- 每个分镜的信息面板新增：
  - ShotLanguageSelector（标准镜头语言参数）
  - TransitionSelector（出转场设置）
  - 声音提示摘要（来自 sceneScript 或 soundDesign）
- 底部操作栏新增"生成声音设计"按钮

**修改 `apps/web/src/components/editor/SceneDetailModal.tsx`** -- 分镜详情扩展

- 新增"分场脚本"折叠区：显示该分镜的完整脚本内容
- 新增"声音设计"折叠区：显示 SFX/BGM/Ambience 列表
- 新增"时长估算"折叠区：显示分项计时
- 已有的"分镜组"折叠区中为每个 panel 新增镜头语言标签

**修改 `apps/web/src/components/editor/WorkflowWorkbench.tsx`** -- 工作台任务列表

- 新增任务项：`task:sceneScript`, `task:soundDesign`, `task:emotionArc`, `task:characterRelationships`, `task:durationEstimate`

**修改 `apps/web/src/components/editor/DataExporter.tsx`** -- 导出增强

- 导出内容新增：分场脚本文档、声音标注表（SFX Sheet）、完整时长估算报告

### D5. 修改前端辅助模块

**修改 `apps/web/src/lib/workflowLabels.ts`** -- 状态标签

- 新增 `SCRIPT_WRITING: '分场脚本撰写中'` 等标签

**修改 `apps/web/src/lib/ai/progressBridge.ts`** -- AI 调用类型

- 新增 `scene_script`, `emotion_arc`, `sound_design`, `character_relationships`, `duration_estimate` 类型描述

---

## E. 工作流状态机升级

### 新的完整工作流状态机

```
项目级：
IDLE -> DATA_COLLECTING -> DATA_COLLECTED ->
WORLD_VIEW_BUILDING -> CHARACTER_MANAGING ->
(新) CHARACTER_RELATIONSHIPS_READY ->
EPISODE_PLANNING -> EPISODE_PLAN_EDITING ->
(新) EMOTION_ARC_READY ->
EPISODE_CREATING -> ... -> ALL_EPISODES_COMPLETE -> EXPORTING

单集级：
IDLE ->
CORE_EXPRESSION_READY ->
(新) SCRIPT_WRITING ->
SCENE_LIST_EDITING ->
SCENE_PROCESSING ->
(新) SOUND_DESIGN_READY ->
COMPLETE
```

---

## F. 执行顺序

严格按以下顺序实施，每步完成后验证编译通过：

1. **shared schemas** (A1 + A2) -- 新建/修改 schema 文件 + types.ts + index.ts 导出 + systemPrompts.ts
2. **shared build** -- `pnpm --filter shared build` 验证编译
3. **Prisma schema** (A3) -- 修改 schema.prisma + 生成迁移 + `prisma generate`
4. **Worker tasks** (B1 + B2 + B3) -- 新建任务文件 + 修改现有任务 + 注册到 worker
5. **API layer** (C1-C4) -- 新建关系模块 + 修改 workflow controller + jobs service + scene/episode service
6. **API build** -- `pnpm --filter api build` 验证编译
7. **Frontend stores** (D1) -- 新建 store 文件
8. **Frontend API** (D2) -- 新建/修改 API 客户端
9. **Frontend components** (D3) -- 新建 7 个组件
10. **Frontend integration** (D4 + D5) -- 修改现有组件集成新功能
11. **Web build** -- `pnpm --filter web build` 验证编译
12. **全量 lint + typecheck** -- `pnpm turbo lint typecheck`

---

## G. 风险与注意事项

- **数据库迁移**：新增字段均为可空/有默认值，不破坏现有数据
- **向后兼容**：所有新功能为可选步骤，不破坏现有"核心表达->分镜列表->细化"的主链路
- **EpisodeWorkflow.tsx 是 159KB 巨型文件**：修改时需特别注意唯一性定位，避免 search_replace 冲突
- **pre-commit 检查**：每步修改后需确保通过 lint-staged，尤其注意未使用 import 的清理
- **shared 包先行**：所有类型和 schema 必须先在 shared 中定义并 build 成功，再在 api/worker/web 中消费
