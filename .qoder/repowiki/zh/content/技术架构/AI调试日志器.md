# AI调试日志器

<cite>
**本文引用的文件**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts)
- [main.tsx](file://manga-creator/src/main.tsx)
- [README.md](file://manga-creator/README.md)
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx)
- [skills.ts](file://manga-creator/src/lib/ai/skills.ts)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts)
- [types.ts](file://manga-creator/src/lib/ai/types.ts)
- [index.ts](file://manga-creator/src/types/index.ts)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts)
- [streamingHandler.ts](file://manga-creator/src/lib/ai/streamingHandler.ts)
</cite>

## 更新摘要
**已做更改**
- 新增了与AI进度跟踪系统的桥接功能，支持实时进度同步
- 增加了AI功能降级时的通知机制，完善了用户提示
- 扩展了日志记录功能，增加了进度事件和统计分析能力
- 更新了调试日志器的事件系统，支持更丰富的状态追踪

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
AI调试日志器是漫剧创作助手项目中的一个专用调试工具，用于记录和可视化每次AI调用的全过程，包括调用类型、上下文、发送给AI的提示词模板与实际消息、配置信息以及响应结果（含Token用量）。本次更新增强了日志器功能，新增了与AI进度跟踪系统的桥接能力，支持在AI功能降级时通知用户，并完善了日志记录和统计功能。它通过在浏览器控制台暴露全局对象，便于开发者在开发与排障时快速定位问题、复盘提示词效果与优化生成质量。

## 项目结构
AI调试日志器位于前端应用的工具库目录中，随应用启动即被加载，供各业务组件在调用AI时统一记录日志。本次更新引入了进度桥接器和AI进度Store，形成了完整的进度追踪体系。

```mermaid
graph TB
subgraph "应用入口"
M["main.tsx<br/>加载调试日志器"]
end
subgraph "AI工具库"
D["debugLogger.ts<br/>日志器核心"]
F["factory.ts<br/>AI客户端工厂"]
T["types.ts<br/>AI接口类型"]
S["skills.ts<br/>Agent技能定义"]
P["providers/deepseek.ts<br/>供应商适配器"]
H["streamingHandler.ts<br/>流式响应处理"]
PB["progressBridge.ts<br/>进度桥接器"]
end
subgraph "状态管理"
APS["aiProgressStore.ts<br/>AI进度追踪Store"]
end
subgraph "编辑器组件"
SG["SceneGeneration.tsx<br/>分镜生成"]
SR["SceneRefinement.tsx<br/>分镜细化"]
end
subgraph "类型定义"
IT["types/index.ts<br/>项目/场景/工作流类型"]
end
M --> D
SG --> D
SR --> D
SG --> F
SR --> F
F --> T
F --> P
SR --> S
SG --> IT
SR --> IT
D --> IT
D --> PB
PB --> APS
```

**图表来源**
- [main.tsx](file://manga-creator/src/main.tsx#L1-L13)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [types.ts](file://manga-creator/src/lib/ai/types.ts#L1-L15)
- [skills.ts](file://manga-creator/src/lib/ai/skills.ts#L1-L147)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)
- [streamingHandler.ts](file://manga-creator/src/lib/ai/streamingHandler.ts#L1-L351)
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [index.ts](file://manga-creator/src/types/index.ts#L1-L558)

**章节来源**
- [main.tsx](file://manga-creator/src/main.tsx#L1-L13)
- [README.md](file://manga-creator/README.md#L1-L195)

## 核心组件
- 调试日志器：提供日志记录、更新、查询、导出与统计摘要能力；支持启用/禁用；在浏览器控制台暴露全局对象以便随时调试。
- 进度桥接器：连接调试日志器和AI进度Store，实现日志事件到进度任务的自动转换。
- AI进度Store：管理所有AI调用的状态、进度、错误和性能指标，提供全局进度面板。
- AI工厂与适配器：负责根据配置创建AI客户端，统一调用不同供应商的聊天接口。
- 编辑器组件：在分镜生成与细化流程中调用日志器记录关键调用，便于回溯与优化。
- 技能系统：定义不同阶段的提示词模板与上下文要求，为日志器提供标准化的“技能名称”与“模板”。

**章节来源**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [skills.ts](file://manga-creator/src/lib/ai/skills.ts#L1-L147)

## 架构总览
AI调试日志器贯穿应用的AI调用链路，从编辑器组件发起请求，经由AI工厂与适配器，最终到达供应商API。日志器在调用前后分别记录“待发送内容”和“响应结果”，并通过进度桥接器将事件同步到AI进度Store，在UI层提供实时进度反馈。当AI功能降级时，系统会通过通知机制告知用户。

```mermaid
sequenceDiagram
participant UI as "编辑器组件<br/>SceneGeneration/SceneRefinement"
participant Factory as "AI工厂<br/>AIFactory"
participant Provider as "AI适配器<br/>DeepSeek/OpenAI兼容/Gemini"
participant Logger as "AI调试日志器<br/>debugLogger"
participant Bridge as "进度桥接器<br/>progressBridge"
participant Store as "AI进度Store<br/>aiProgressStore"
participant Console as "浏览器控制台"
participant UIComp as "UI组件<br/>进度面板/通知"
UI->>Logger : 记录调用日志(类型/模板/上下文/配置)
Logger->>Bridge : 发射call : start事件
Bridge->>Store : 创建进度任务
Store->>UIComp : 更新进度面板
UI->>Factory : 创建AI客户端
Factory->>Provider : chat()/streamChat()
Provider-->>UI : 返回响应(含内容/Token用量)
UI->>Logger : 更新响应/错误状态
Logger->>Bridge : 发射call : success/error事件
Bridge->>Store : 完成/失败任务
Store->>UIComp : 更新进度面板/显示通知
Logger-->>Console : 结构化输出日志
```

**图表来源**
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)

## 详细组件分析

### 调试日志器（debugLogger）
- 职责
  - 记录AI调用：包含调用类型、技能名称、提示词模板、填充后的完整提示词、消息数组、上下文、配置与状态。
  - 更新响应：在调用成功后补充响应内容与Token用量；在失败时记录错误信息。
  - 查询与导出：提供历史查询、清空、导出为JSON、打印统计摘要。
  - 控制台交互：在浏览器控制台暴露全局对象，支持动态启用/禁用与执行上述操作。
  - 事件系统：新增了`call:progress`事件，支持进度更新；通过`subscribeToAIEvents`支持事件订阅。
  - 降级通知：通过`notifyAIFallback`支持在AI功能降级时通知用户。
- 关键数据结构
  - AICallType：调用类型枚举，覆盖分镜列表生成、场景描述生成、关键帧提示词生成、时空提示词生成等。
  - AILogEvent：新增`call:progress`事件类型，用于进度更新。
  - AICallContext：上下文数据，包含项目/分镜/已生成内容等关键字段。
  - AICallLogEntry：单次调用的完整日志条目。
- 行为特性
  - 历史容量限制：最多保留固定数量的日志条目，超出则移除最早的一条。
  - 条目状态：pending/success/error，便于统计与筛选。
  - 控制台格式化输出：按调用类型分组，分区块展示基本信息、上下文、提示词模板、消息、完整提示词与响应摘要。
  - 进度追踪集成：通过`setProgressTrackingEnabled`控制是否启用与进度系统的集成。
- 使用位置
  - 在分镜生成与细化组件中调用，记录关键阶段的提示词与上下文，便于后续优化。

```mermaid
classDiagram
class DebugLogger {
+setDebugEnabled(enabled)
+isDebugEnabled() boolean
+setProgressTrackingEnabled(enabled)
+isProgressTrackingEnabled()
+logAICall(callType, params) string
+updateLogWithResponse(logId, response)
+updateLogWithError(logId, error)
+updateLogProgress(logId, progress, step)
+getLogHistory() AICallLogEntry[]
+clearLogHistory()
+exportLogs() string
+printLogSummary()
+getCallStatsByType()
+getRecentErrors()
+getOptimizationSuggestions()
+subscribeToAIEvents(event, callback)
}
class AICallLogEntry {
+string id
+string timestamp
+AICallType callType
+string? skillName
+string promptTemplate
+string filledPrompt
+messages : Array
+context : AICallContext
+config : AIConfig
+response? : AIResponse
+status : "pending"|"success"|"error"
+error? : string
}
class AICallContext {
+string? projectId
+string? projectTitle
+string? style
+string? protagonist
+string? summary
+string? sceneId
+number? sceneOrder
+string? sceneSummary
+string? prevSceneSummary
+string? sceneDescription
+string? actionDescription
}
DebugLogger --> AICallLogEntry : "管理"
DebugLogger --> AICallContext : "记录"
```

**图表来源**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)

**章节来源**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)

### 进度桥接器（progressBridge）
- 职责
  - 事件订阅：订阅`debugLogger`的`call:start`、`call:success`、`call:error`和`call:progress`事件。
  - 任务同步：将日志事件转换为AI进度Store中的任务状态变更。
  - 降级通知：通过`notifyAIFallback`在AI功能降级时创建警告任务并通知用户。
  - 手动任务：提供`createProgressTask`用于不通过`debugLogger`的调用创建进度任务。
- 关键数据结构
  - FallbackNotification：降级通知项，包含功能名称、降级原因、错误信息、降级目标等。
  - FallbackReason：降级原因枚举，包括API错误、超时、解析错误、网络错误等。
- 行为特性
  - 自动初始化：通过`initProgressBridge`订阅所有AI事件，建立日志器与进度Store的连接。
  - 任务映射：维护日志ID到任务ID的映射，确保事件能正确关联到任务。
  - 降级检测：通过`detectFallbackReason`分析错误信息，自动识别降级原因。
  - 历史记录：保留最近的降级通知历史，便于问题追溯。

```mermaid
classDiagram
class ProgressBridge {
+initProgressBridge() () => void
+createProgressTask(type, context) ProgressTaskAPI
+notifyAIFallback(feature, error, fallbackTo)
+getFallbackHistory() FallbackNotification[]
+clearFallbackHistory()
+subscribeToFallbackEvents(callback)
}
class ProgressTaskAPI {
+taskId string
+updateProgress(progress, step)
+complete(response)
+fail(error)
}
class FallbackNotification {
+id string
+feature string
+reason FallbackReason
+message string
+fallbackTo string
+timestamp number
}
class AITask {
+id string
+type AICallType
+title string
+status AITaskStatus
+progress number
+currentStep? string
}
ProgressBridge --> AITask : "同步"
ProgressBridge --> FallbackNotification : "管理"
ProgressBridge --> ProgressTaskAPI : "创建"
```

**图表来源**
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)

**章节来源**
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)

### AI进度Store（aiProgressStore）
- 职责
  - 任务管理：提供任务的增删改查、状态变更、进度更新等操作。
  - 状态追踪：维护所有AI调用的完整生命周期状态。
  - 统计分析：计算调用成功率、平均响应时间、Token用量等性能指标。
  - UI同步：通过状态变更驱动UI组件更新进度面板和通知。
- 关键数据结构
  - AITask：AI任务项，包含ID、类型、标题、状态、进度、上下文、响应、错误等信息。
  - AITaskStatus：任务状态枚举，包括排队中、执行中、已完成、失败、已取消。
  - AIPerformanceStats：性能统计，包含总调用数、成功率、平均响应时间、Token用量等。
- 行为特性
  - 事件系统：支持任务事件订阅，便于其他组件响应状态变更。
  - 过滤查询：提供按状态、类型、项目ID等条件过滤任务的能力。
  - 批量操作：支持批量生成等复杂操作的进度管理。
  - 全局访问：在浏览器控制台暴露`window.aiProgress`，便于调试。

```mermaid
classDiagram
class AIProgressStore {
+addTask(task) string
+updateTask(taskId, updates)
+removeTask(taskId)
+startTask(taskId)
+completeTask(taskId, response)
+failTask(taskId, error)
+updateProgress(taskId, progress, step)
+pauseQueue()
+resumeQueue()
+getTask(taskId) AITask
+getFilteredTasks() AITask[]
+getActiveTasks() AITask[]
+getRecentTasks(limit) AITask[]
+refreshStats()
+subscribe(event, callback)
}
class AITask {
+id string
+type AICallType
+title string
+description? string
+status AITaskStatus
+priority AITaskPriority
+progress number
+currentStep? string
+projectId? string
+sceneId? string
+sceneOrder? number
+createdAt number
+startedAt? number
+completedAt? number
+response? AIResponse
+error? TaskError
+retryCount number
+maxRetries number
}
class AIPerformanceStats {
+totalCalls number
+successCount number
+errorCount number
+avgResponseTime number
+totalTokensUsed number
+costEstimate number
}
AIProgressStore --> AITask : "管理"
AIProgressStore --> AIPerformanceStats : "计算"
```

**图表来源**
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)

**章节来源**
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)

### AI工厂与适配器（AIFactory/AIProvider）
- 职责
  - AIFactory：根据用户配置创建对应供应商的AI客户端，统一chat与streamChat接口。
  - AIProvider：抽象不同供应商的聊天接口，屏蔽差异。
  - DeepSeekProvider：示例适配器，演示如何构造URL、处理响应与错误。
- 与日志器的关系
  - 编辑器组件通过工厂创建客户端后，再调用日志器记录本次调用的上下文与配置，随后发起请求并更新日志。

```mermaid
classDiagram
class AIFactory {
+createClient(config) AIClient
}
class AIClient {
-provider : AIProvider
-config : UserConfig
+providerName string
+chat(messages) Promise~AIResponse~
+streamChat(messages) AsyncGenerator~string~
}
class AIProvider {
<<interface>>
+name string
+chat(messages, config) Promise~AIResponse~
+streamChat(messages, config) AsyncGenerator~string~
}
class DeepSeekProvider {
+name string
+chat(messages, config) Promise~AIResponse~
+streamChat(messages, config) AsyncGenerator~string~
}
AIFactory --> AIClient : "创建"
AIClient --> AIProvider : "委托"
DeepSeekProvider ..|> AIProvider
```

**图表来源**
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [types.ts](file://manga-creator/src/lib/ai/types.ts#L1-L15)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)

**章节来源**
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [types.ts](file://manga-creator/src/lib/ai/types.ts#L1-L15)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)

### 编辑器组件中的日志使用（SceneGeneration/SceneRefinement）
- 分镜生成（SceneGeneration）
  - 构造完整提示词与消息数组，调用日志器记录“scene_list_generation”类型的调用。
  - 请求完成后调用更新响应，补充内容与Token用量。
  - 出错时调用更新错误，便于定位问题。
- 分镜细化（SceneRefinement）
  - 通过技能系统获取模板，替换变量后记录“scene_description/keyframe_prompt/motion_prompt”等类型调用。
  - 每个阶段均记录上下文（项目风格、主角、分镜概要、前一分镜等）与配置信息。
  - 成功后更新响应，失败后更新错误。

```mermaid
sequenceDiagram
participant SG as "SceneGeneration"
participant SR as "SceneRefinement"
participant DL as "debugLogger"
participant AF as "AIFactory"
participant AP as "AIProvider"
SG->>DL : logAICall("scene_list_generation", ...)
SG->>AF : createClient(config)
AF->>AP : chat(messages)
AP-->>SG : AIResponse
SG->>DL : updateLogWithResponse(id, response)
SR->>DL : logAICall("scene_description"/"keyframe_prompt"/"motion_prompt", ...)
SR->>AF : createClient(config)
AF->>AP : chat(messages)
AP-->>SR : AIResponse
SR->>DL : updateLogWithResponse(id, response)
```

**图表来源**
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)

**章节来源**
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)

### 技能系统与上下文（skills）
- 技能定义：包含提示词模板、输出格式与最大Token限制，便于统一管理与复用。
- 上下文注入：在细化阶段，组件会将项目风格、主角、当前/前一分镜概要等上下文注入模板，日志器据此记录完整上下文，便于回溯。

**章节来源**
- [skills.ts](file://manga-creator/src/lib/ai/skills.ts#L1-L147)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)

### 类型系统支撑（types/index）
- 项目/场景/工作流状态、上下文缓存、AI相关类型（供应商、消息、响应）等，为日志器记录上下文与配置提供类型保障。

**章节来源**
- [index.ts](file://manga-creator/src/types/index.ts#L1-L558)

## 依赖分析
- 组件耦合
  - 编辑器组件与日志器：强耦合（必须在调用前后记录日志）。
  - 日志器与进度桥接器：强耦合（通过事件系统紧密集成）。
  - 进度桥接器与AI进度Store：强耦合（直接调用Store的API）。
  - 日志器与类型系统：弱耦合（通过接口定义的数据结构进行记录与查询）。
  - 工厂与适配器：弱耦合（日志器不关心具体供应商实现，仅记录调用元数据）。
- 外部依赖
  - 浏览器控制台：日志器通过console输出结构化日志。
  - Fetch API：适配器通过fetch与供应商API通信。
- 循环依赖
  - 未发现循环依赖迹象；日志器作为工具库被组件导入，工厂与适配器相互独立。

```mermaid
graph LR
SG["SceneGeneration.tsx"] --> DL["debugLogger.ts"]
SR["SceneRefinement.tsx"] --> DL
DL --> PB["progressBridge.ts"]
PB --> APS["aiProgressStore.ts"]
SG --> F["factory.ts"]
SR --> F
F --> T["types.ts"]
F --> P["deepseek.ts"]
DL --> IT["types/index.ts"]
```

**图表来源**
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [types.ts](file://manga-creator/src/lib/ai/types.ts#L1-L15)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)
- [index.ts](file://manga-creator/src/types/index.ts#L1-L558)

**章节来源**
- [SceneGeneration.tsx](file://manga-creator/src/components/editor/SceneGeneration.tsx#L1-L465)
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)
- [factory.ts](file://manga-creator/src/lib/ai/factory.ts#L1-L54)
- [types.ts](file://manga-creator/src/lib/ai/types.ts#L1-L15)
- [deepseek.ts](file://manga-creator/src/lib/ai/providers/deepseek.ts#L1-L110)
- [index.ts](file://manga-creator/src/types/index.ts#L1-L558)

## 性能考虑
- 日志容量限制：默认最多保留固定数量的历史条目，避免内存膨胀。
- 控制台输出：结构化分组与表格输出，便于快速浏览，但大量日志仍可能影响控制台性能。
- Token用量：日志器记录prompt/completion/total，有助于成本与性能分析。
- 建议
  - 在生产环境可考虑降低日志级别或关闭调试输出，减少控制台渲染压力。
  - 对高频调用场景，建议合并日志或延迟输出，避免阻塞主线程。
  - 进度桥接器的事件处理应保持轻量，避免在事件回调中执行耗时操作。

[本节为通用建议，无需特定文件引用]

## 故障排查指南
- 如何启用/禁用调试日志
  - 在浏览器控制台执行`window.aiDebug.setEnabled(true/false)`，动态切换调试输出。
- 查看最近一次调用详情
  - 使用历史查询或统计摘要，定位最近一次调用的上下文与配置。
- 导出日志进行离线分析
  - 将日志导出为JSON，便于团队协作与回归分析。
- 常见问题定位
  - 调用失败：检查错误信息与状态；核对供应商配置、API Key与模型。
  - 提示词异常：对比“提示词模板”与“完整提示词”，确认变量替换是否正确。
  - Token用量异常：核对最大Token与实际用量，评估模板长度与上下文大小。
  - 进度不更新：检查`setProgressTrackingEnabled(true)`是否已调用，确认进度桥接器已初始化。
  - 降级通知：通过`window.aiProgress.getTasks()`查看降级警告任务，分析降级原因。

**章节来源**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)
- [progressBridge.ts](file://manga-creator/src/lib/ai/progressBridge.ts#L1-L314)
- [aiProgressStore.ts](file://manga-creator/src/stores/aiProgressStore.ts#L1-L669)

## 结论
AI调试日志器为漫剧创作助手提供了完善的AI调用可观测性，覆盖从提示词模板、上下文注入到响应与Token用量的全流程记录。通过在编辑器组件中统一集成，开发者能够快速定位问题、优化提示词并提升生成质量。配合工厂与适配器的抽象，日志器与业务逻辑松耦合，易于扩展与维护。新增的进度桥接功能实现了日志系统与UI进度反馈的无缝集成，当AI功能降级时能及时通知用户，提升了系统的健壮性和用户体验。

[本节为总结性内容，无需特定文件引用]

## 附录

### 控制台交互命令
- window.aiDebug.setEnabled(true/false)：启用/禁用调试日志
- window.aiDebug.isEnabled()：检查调试模式是否启用
- window.aiDebug.setProgressTracking(true/false)：启用/禁用进度追踪集成
- window.aiDebug.isProgressTracking()：检查进度追踪是否启用
- window.aiDebug.getHistory()：获取所有日志
- window.aiDebug.clear()：清空日志
- window.aiDebug.export()：导出日志为JSON
- window.aiDebug.summary()：打印统计摘要
- window.aiDebug.getStatsByType()：按类型获取调用统计
- window.aiDebug.getErrors()：获取最近错误
- window.aiDebug.getSuggestions()：获取优化建议
- window.aiDebug.subscribe(event, callback)：订阅AI日志事件

**章节来源**
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L502-L529)

### 典型调用流程（分镜细化）
```mermaid
flowchart TD
Start(["开始"]) --> BuildCtx["构建上下文<br/>风格/主角/分镜概要/前一分镜"]
BuildCtx --> FillTpl["填充模板变量<br/>生成完整提示词"]
FillTpl --> LogCall["记录调用日志<br/>类型/模板/上下文/配置"]
LogCall --> CallAI["调用AI客户端"]
CallAI --> Resp{"响应成功?"}
Resp --> |是| UpdateResp["更新响应<br/>内容/Token用量"]
Resp --> |否| UpdateErr["更新错误信息"]
UpdateResp --> End(["结束"])
UpdateErr --> End
```

**图表来源**
- [SceneRefinement.tsx](file://manga-creator/src/components/editor/SceneRefinement.tsx#L1-L845)
- [debugLogger.ts](file://manga-creator/src/lib/ai/debugLogger.ts#L1-L530)