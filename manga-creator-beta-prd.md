# 漫剧创作助手 Beta 版 - AI Agent 对话创作系统

> 产品需求文档 (PRD)  
> 版本: 1.0  
> 日期: 2024-12-10

---

## 1. 项目概述

### 1.1 背景

基于已完成的 MVP 版本（manga-creator），启动全新的 AI Agent 对话创作系统（Beta 版本）。用户只需通过对话即可完成漫剧创作，Agent 将按流程引导用户完成从剧本到分镜提示词的全流程。

### 1.2 目标

- 构建对话驱动的创作体验，取代传统表单交互
- 实现 Agent 全局状态记忆，确保上下文连贯性
- 提供 Notion 风格的块编辑器作为主画布
- 保持与 MVP 版本完全独立，避免代码耦合

### 1.3 项目位置

```
/Users/macbook/aiagent/aixsss/
├── manga-creator/          # MVP版本（保持稳定）
├── manga-creator-beta/     # Beta版本（本项目）
└── manga-creator-beta-prd.md
```

---

## 2. 技术架构

### 2.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **前端框架** | Next.js 15 (App Router) | assistant-UI 原生支持 |
| **对话 UI** | assistant-UI + @assistant-ui/react-ai-sdk | 对话式交互组件 |
| **工具 UI** | assistant-UI tool-UI | 工具调用结果展示 |
| **块编辑器** | BlockNote | Notion 风格块编辑器 |
| **AI SDK** | Vercel AI SDK (`ai`) | 工具调用、流式响应 |
| **Agent 框架** | LangGraph.js | 状态机 + Checkpoint 持久化 |
| **状态管理** | Zustand | 轻量级响应式状态管理 |
| **数据库** | SQLite + better-sqlite3 + Drizzle ORM | 轻量本地存储 |
| **AI 供应商** | DeepSeek | 通过 OpenAI 兼容接口 |
| **样式** | Tailwind CSS | 响应式设计 |
| **测试** | Vitest + Testing Library | 单元测试 + 集成测试 |

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Next.js 15 App Router                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────────────────┐  ┌────────────────────┐  │
│  │ ThreadList  │  │   BlockNote Canvas       │  │   AI Thread        │  │
│  │ (项目列表)   │  │   (块编辑器画布)          │  │   (对话交互)        │  │
│  │             │  │                          │  │                    │  │
│  │ assistant-  │  │ 自定义块:                 │  │ assistant-UI       │  │
│  │ UI 组件     │  │ - SceneBlock             │  │ Primitives         │  │
│  │             │  │ - BasicInfoBlock         │  │ + tool-UI          │  │
│  └─────────────┘  └──────────────────────────┘  └────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                           Zustand State Management                       │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    LangGraph.js Agent                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │ StateGraph  │  │ Checkpointer│  │ Tools       │               │   │
│  │  │ (工作流)     │  │ (持久化)    │  │ (工具集)    │               │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │
│  │ Vercel AI SDK    │  │ DeepSeek API      │  │ SQLite + Drizzle  │    │
│  │ (工具调用/流式)   │  │ (LLM 供应商)       │  │ (数据持久化)       │    │
│  └──────────────────┘  └───────────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 功能需求

### 3.1 三栏布局

#### 3.1.1 左侧 - 项目列表面板

**使用组件**: `assistant-UI ThreadList`

| 功能 | 描述 |
|------|------|
| 项目列表 | 展示所有创作项目，每个对话自动创建项目条目 |
| 新建项目 | 点击创建新的对话/项目 |
| 切换项目 | 点击切换到不同项目上下文 |
| 归档项目 | 支持归档已完成的项目 |

#### 3.1.2 中间 - 主编辑画布

**使用组件**: `BlockNote Editor`

| 功能 | 描述 |
|------|------|
| 块编辑器 | Notion 风格，支持拖拽、嵌套 |
| 自定义块 | SceneBlock、BasicInfoBlock 等业务块 |
| 实时同步 | 与 Agent 状态双向同步 |
| 手动编辑 | 用户可直接修改画布内容 |

**自定义块类型**:

```typescript
// 基础信息块
interface BasicInfoBlock {
  type: "basic_info";
  props: {
    title: string;
    summary: string;
    artStyle: string;
    protagonist: string;
  };
}

// 分镜块
interface SceneBlock {
  type: "scene";
  props: {
    sceneId: string;
    order: number;
    summary: string;
    status: "pending" | "scene_confirmed" | "keyframe_confirmed" | "completed";
    sceneDescription?: string;
    keyframePrompt?: string;
    spatialPrompt?: string;
    dialogues?: Dialogue[];
  };
}
```

#### 3.1.3 右侧 - AI 对话交互栏

**使用组件**: `assistant-UI Thread + tool-UI`

| 功能 | 描述 |
|------|------|
| 消息展示 | 用户消息、AI 消息、工具调用结果 |
| 工具 UI | 使用 tool-UI 展示结构化的工具调用结果 |
| 输入框 | 支持多行输入、快捷指令 |
| 上下文管理 | 显示当前项目上下文状态 |

### 3.2 Agent 能力

#### 3.2.1 工具定义（可扩展）

```typescript
// 核心工具集
const agentTools = {
  // === 项目管理 ===
  create_project: { description: "创建新项目" },
  get_project_state: { description: "获取当前项目状态" },
  
  // === 基础设定 ===
  set_project_info: { description: "设置项目基础信息" },
  set_art_style: { description: "设置画风风格" },
  set_protagonist: { description: "设置主角信息" },
  
  // === 分镜流程 ===
  generate_scenes: { description: "生成分镜列表" },
  refine_scene: { description: "细化单个分镜" },
  batch_refine_scenes: { description: "批量细化分镜" },
  
  // === 导出 ===
  export_prompts: { description: "导出提示词" },
  
  // === 扩展点（未来） ===
  // add_character: { ... },
  // generate_preview: { ... },
  // sync_to_cloud: { ... },
};
```

#### 3.2.2 工具 UI 组件

使用 `assistant-UI tool-UI` 为每个工具定义专属的结果展示组件：

```typescript
// 工具 UI 映射
const toolUIComponents = {
  generate_scenes: SceneListToolUI,      // 分镜列表卡片
  refine_scene: SceneDetailToolUI,       // 分镜细化详情
  set_project_info: BasicInfoToolUI,     // 基础信息卡片
  export_prompts: ExportPreviewToolUI,   // 导出预览
};
```

#### 3.2.3 状态持久化

使用 LangGraph.js Checkpoint 机制：

```typescript
// 项目状态 Schema
const ProjectState = {
  // 基础信息
  projectId: string,
  title: string,
  summary: string,
  artStyle: string,
  protagonist: string,
  
  // 工作流状态
  workflowState: WorkflowState,
  
  // 分镜数据
  scenes: Scene[],
  currentSceneIndex: number,
  
  // 画布内容
  canvasContent: Block[],
  
  // 角色数据
  characters: Character[],
};

// 持久化策略
// - 每次工具调用后自动保存 Checkpoint
// - 支持回溯到任意历史状态
// - thread_id 对应项目 ID
```

### 3.3 工作流状态机

```
IDLE
  ↓ create_project / set_project_info
COLLECTING_BASIC_INFO
  ↓ 基础信息完整
BASIC_INFO_COMPLETE
  ↓ generate_scenes
GENERATING_SCENES
  ↓ 生成完成
SCENE_LIST_EDITING
  ↓ 确认分镜列表
SCENE_LIST_CONFIRMED
  ↓ refine_scene
REFINING_SCENES
  ↓ 所有分镜完成
ALL_SCENES_COMPLETE
  ↓ export_prompts
EXPORTED
```

---

## 4. UI 构建规范

### 4.1 assistant-UI 使用规范

#### 4.1.1 组件引用

```typescript
// 核心组件
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
} from "@assistant-ui/react";

// AI SDK 集成
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";

// 样式
import "@assistant-ui/styles/index.css";
import "@assistant-ui/styles/markdown.css";
```

#### 4.1.2 Thread 组件结构

```tsx
export const Thread: FC = () => (
  <ThreadPrimitive.Root className="aui-root aui-thread-root">
    <ThreadPrimitive.Viewport className="aui-thread-viewport">
      <ThreadPrimitive.Messages
        components={{
          UserMessage,
          AssistantMessage,
          EditComposer,
        }}
      />
      <Composer />
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
);
```

#### 4.1.3 tool-UI 规范

```tsx
// 工具调用结果展示
<MessagePrimitive.Parts
  components={{
    Text: MarkdownText,
    tools: {
      // 自定义工具 UI
      generate_scenes: SceneListToolUI,
      refine_scene: SceneDetailToolUI,
      set_project_info: BasicInfoToolUI,
      // 兜底组件
      Fallback: ToolFallback,
    },
  }}
/>
```

### 4.2 BlockNote 使用规范

#### 4.2.1 编辑器初始化

```typescript
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";

// 自定义 Schema
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    scene: SceneBlock,
    basic_info: BasicInfoBlock,
  },
});

// 创建编辑器
const editor = useCreateBlockNote({
  schema,
  initialContent: [],
});
```

#### 4.2.2 与 Agent 状态同步

```typescript
// Agent 状态变更 → 更新画布
useEffect(() => {
  if (projectState.canvasContent) {
    editor.replaceBlocks(editor.document, projectState.canvasContent);
  }
}, [projectState.canvasContent]);

// 画布变更 → 通知 Agent
<BlockNoteView
  editor={editor}
  onChange={() => {
    syncCanvasToAgent(editor.document);
  }}
/>
```

### 4.3 状态管理架构

#### 4.3.1 双层状态管理模型

本项目采用 **Zustand + LangGraph.js** 双层状态管理架构：

| 层级 | 技术 | 职责 | 持久化 |
|------|------|------|--------|
| **UI 状态层** | Zustand | 界面响应式状态、临时状态 | 内存 |
| **Agent 状态层** | LangGraph.js Checkpoint | 项目数据、工作流状态、分镜数据 | SQLite |

```
┌───────────────────────────────────────────────────────────┐
│                      React Components                      │
├─────────────────────────────┴─────────────────────────────┤
│  Zustand Store (UI State)    │   LangGraph Checkpoint       │
│  - 界面加载状态              │   (Agent State)              │
│  - 编辑器临时状态            │   - projectState             │
│  - 弹窗/模态框状态           │   - scenes[]                 │
│  - 选中项状态                │   - workflowState            │
├─────────────────────────────┴─────────────────────────────┤
│           ↓ sync ↓                  ↓ persist ↓             │
│  「同步层」: Agent 状态变更 → Zustand → UI 更新              │
├───────────────────────────────────────────────────────────┤
│                        SQLite                               │
└───────────────────────────────────────────────────────────┘
```

#### 4.3.2 Zustand Store 定义

```typescript
// stores/projectStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface ProjectUIState {
  // UI 状态
  isLoading: boolean;
  currentThreadId: string | null;
  selectedSceneIndex: number;
  isGenerating: boolean;
  generatingStep: string | null;
  error: string | null;
  
  // Agent 状态镜像（从 Checkpoint 同步）
  projectState: ProjectState | null;
  
  // Actions
  setLoading: (loading: boolean) => void;
  setCurrentThread: (threadId: string) => void;
  setSelectedScene: (index: number) => void;
  setGenerating: (generating: boolean, step?: string) => void;
  setError: (error: string | null) => void;
  syncFromAgent: (state: ProjectState) => void;
}

export const useProjectStore = create<ProjectUIState>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    isLoading: false,
    currentThreadId: null,
    selectedSceneIndex: 0,
    isGenerating: false,
    generatingStep: null,
    error: null,
    projectState: null,
    
    // Actions
    setLoading: (loading) => set({ isLoading: loading }),
    
    setCurrentThread: (threadId) => set({ currentThreadId: threadId }),
    
    setSelectedScene: (index) => set({ selectedSceneIndex: index }),
    
    setGenerating: (generating, step) => set({ 
      isGenerating: generating, 
      generatingStep: step ?? null 
    }),
    
    setError: (error) => set({ error }),
    
    // 从 Agent Checkpoint 同步状态
    syncFromAgent: (state) => set({ projectState: state }),
  }))
);
```

#### 4.3.3 Canvas Store

```typescript
// stores/canvasStore.ts
import { create } from 'zustand';
import { Block } from '@blocknote/core';

interface CanvasState {
  // 画布内容
  blocks: Block[];
  isDirty: boolean;
  lastSyncedAt: Date | null;
  
  // Actions
  setBlocks: (blocks: Block[]) => void;
  markDirty: () => void;
  markSynced: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  blocks: [],
  isDirty: false,
  lastSyncedAt: null,
  
  setBlocks: (blocks) => set({ blocks, isDirty: true }),
  markDirty: () => set({ isDirty: true }),
  markSynced: () => set({ isDirty: false, lastSyncedAt: new Date() }),
}));
```

#### 4.3.4 状态同步机制

```typescript
// lib/agent/sync.ts
import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore } from '@/stores/canvasStore';

// Agent 状态变更时同步到 Zustand
export function syncAgentToUI(agentState: ProjectState) {
  const { syncFromAgent } = useProjectStore.getState();
  const { setBlocks, markSynced } = useCanvasStore.getState();
  
  // 同步项目状态
  syncFromAgent(agentState);
  
  // 同步画布内容
  if (agentState.canvasContent) {
    setBlocks(agentState.canvasContent);
    markSynced();
  }
}

// 画布变更时通知 Agent
export async function syncCanvasToAgent(blocks: Block[]) {
  const { currentThreadId } = useProjectStore.getState();
  
  if (!currentThreadId) return;
  
  // 通过 API 更新 Agent 状态
  await fetch('/api/agent/update-canvas', {
    method: 'POST',
    body: JSON.stringify({ threadId: currentThreadId, blocks }),
  });
}
```

#### 4.3.5 状态管理注意事项

**避免闭包陷阱**（参考历史经验）：

```typescript
// ❗ 错误示例：闭包捕获旧状态
const handleGenerate = async () => {
  const { projectState } = useProjectStore(); // 闭包捕获
  await step1();
  await step2();
  // projectState 可能已过期！
  console.log(projectState.scenes); // 旧数据
};

// ✅ 正确示例：从 store 获取最新状态
const handleGenerate = async () => {
  await step1();
  await step2();
  // 从 store 直接获取最新状态
  const { projectState } = useProjectStore.getState();
  console.log(projectState.scenes); // 最新数据
};
```

**状态更新原则**：

| 原则 | 说明 |
|------|------|
| 单一数据源 | Agent Checkpoint 是唯一真实数据源，Zustand 仅作镜像 |
| 异步操作读最新状态 | 连续异步操作中使用 `getState()` 而非闭包变量 |
| UI 状态不持久化 | 加载状态、选中状态等临时状态不存入数据库 |
| 原子更新 | 状态更新应当是原子操作，避免部分更新 |

---

## 5. 开发规范

### 5.1 Context7 参考规范

开发过程中，使用 Context7 MCP 工具获取最新的库文档和最佳实践：

```typescript
// 使用 context7 获取文档
// mcp_context7_resolve-library-id: 解析库 ID
// mcp_context7_get-library-docs: 获取文档

// 常用库 ID
const libraries = {
  langgraph: "/langchain-ai/langgraphjs",
  aiSdk: "/vercel/ai",
  blockNote: "/websites/blocknotejs",
  assistantUI: "使用 mcp_assistant-ui_assistantUIDocs",
};
```

### 5.2 代码规范

#### 5.2.1 TypeScript 规范

```typescript
// 严格类型定义
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}

// 类型优先
interface Scene {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
  // ...
}

type SceneStatus = "pending" | "scene_confirmed" | "keyframe_confirmed" | "completed";
```

#### 5.2.2 组件规范

```typescript
// 组件文件命名: PascalCase
// SceneBlock.tsx, ThreadList.tsx

// 组件结构
export const SceneBlock: FC<SceneBlockProps> = ({ block, editor }) => {
  // 1. Hooks
  const [state, setState] = useState();
  
  // 2. Derived state
  const isCompleted = block.props.status === "completed";
  
  // 3. Handlers
  const handleClick = useCallback(() => {}, []);
  
  // 4. Effects
  useEffect(() => {}, []);
  
  // 5. Render
  return <div>...</div>;
};
```

#### 5.2.3 工具定义规范

```typescript
// 使用 Zod 定义输入 Schema
import { tool } from "ai";
import { z } from "zod";

export const generateScenesTool = tool({
  description: "根据故事梗概生成分镜列表",
  inputSchema: z.object({
    count: z.number()
      .min(6, "至少6个分镜")
      .max(15, "最多15个分镜")
      .default(8)
      .describe("期望生成的分镜数量"),
  }),
  execute: async ({ count }, context) => {
    // 实现逻辑
  },
});
```

---

## 6. 测试驱动开发 (TDD)

### 6.1 测试策略

**核心原则：测试先行，不降低测试标准**

| 测试类型 | 覆盖范围 | 最低覆盖率 |
|---------|---------|-----------|
| 单元测试 | 工具函数、状态管理、Agent 逻辑 | 80% |
| 组件测试 | UI 组件、交互行为 | 75% |
| 集成测试 | API 端点、工具调用链 | 70% |
| E2E 测试 | 核心用户流程 | 关键路径 100% |

### 6.2 测试文件结构

```
src/
├── components/
│   ├── canvas/
│   │   ├── Editor.tsx
│   │   └── Editor.test.tsx          # 组件测试
│   └── assistant-ui/
│       ├── thread.tsx
│       └── thread.test.tsx
├── lib/
│   ├── agent/
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts        # 工具单元测试
│   │   ├── state.ts
│   │   └── state.test.ts            # 状态管理测试
│   └── db/
│       ├── schema.ts
│       └── schema.test.ts           # 数据库操作测试
└── app/
    └── api/
        └── chat/
            ├── route.ts
            └── route.test.ts        # API 集成测试
```

### 6.3 测试规范

#### 6.3.1 单元测试模板

```typescript
// lib/agent/tools/generateScenes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateScenesTool } from "./generateScenes";

describe("generateScenesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("inputSchema", () => {
    it("should accept valid count", () => {
      const result = generateScenesTool.inputSchema.safeParse({ count: 8 });
      expect(result.success).toBe(true);
    });

    it("should reject count < 6", () => {
      const result = generateScenesTool.inputSchema.safeParse({ count: 3 });
      expect(result.success).toBe(false);
    });

    it("should reject count > 15", () => {
      const result = generateScenesTool.inputSchema.safeParse({ count: 20 });
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("should generate scenes with correct count", async () => {
      const mockContext = createMockContext();
      const result = await generateScenesTool.execute({ count: 8 }, mockContext);
      
      expect(result.scenes).toHaveLength(8);
      expect(result.scenes[0]).toMatchObject({
        id: expect.any(String),
        order: 1,
        summary: expect.any(String),
        status: "pending",
      });
    });

    it("should handle AI service errors gracefully", async () => {
      const mockContext = createMockContext({ aiError: true });
      
      await expect(
        generateScenesTool.execute({ count: 8 }, mockContext)
      ).rejects.toThrow("AI服务暂时不可用");
    });
  });
});
```

#### 6.3.2 组件测试模板

```typescript
// components/canvas/SceneBlock.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SceneBlock } from "./SceneBlock";

describe("SceneBlock", () => {
  const defaultProps = {
    block: {
      id: "scene-1",
      type: "scene",
      props: {
        order: 1,
        summary: "开场 - 霓虹街道",
        status: "pending",
      },
    },
    editor: createMockEditor(),
  };

  it("should render scene summary", () => {
    render(<SceneBlock {...defaultProps} />);
    expect(screen.getByText("开场 - 霓虹街道")).toBeInTheDocument();
  });

  it("should display correct status badge", () => {
    render(<SceneBlock {...defaultProps} />);
    expect(screen.getByText("待处理")).toBeInTheDocument();
  });

  it("should expand details on click", async () => {
    render(<SceneBlock {...defaultProps} />);
    
    const expandButton = screen.getByRole("button", { name: /展开/i });
    fireEvent.click(expandButton);
    
    expect(screen.getByText("场景描述")).toBeInTheDocument();
  });

  it("should call onEdit when editing summary", async () => {
    const onEdit = vi.fn();
    render(<SceneBlock {...defaultProps} onEdit={onEdit} />);
    
    // 测试编辑交互
  });
});
```

#### 6.3.3 集成测试模板

```typescript
// app/api/chat/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "./route";

describe("POST /api/chat", () => {
  beforeAll(async () => {
    // 初始化测试数据库
  });

  afterAll(async () => {
    // 清理测试数据
  });

  it("should process user message and return stream", async () => {
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "帮我生成8个分镜" }],
        projectState: { title: "测试项目" },
      }),
    });

    const response = await POST(request);
    
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("should call generate_scenes tool when prompted", async () => {
    // 测试工具调用
  });
});
```

### 6.4 测试命令

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# 运行特定文件
npm run test -- path/to/file.test.ts
```

### 6.5 CI/CD 测试门禁

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:coverage
      - name: Check coverage thresholds
        run: |
          # 确保覆盖率不低于阈值
          npm run test:coverage -- --coverage.thresholds.lines=75
```

---

## 7. 项目目录结构

```
manga-creator-beta/
├── app/
│   ├── api/
│   │   └── chat/
│   │       ├── route.ts              # AI API 端点
│   │       └── route.test.ts
│   ├── layout.tsx
│   ├── page.tsx                      # 主页面
│   └── globals.css
├── components/
│   ├── assistant-ui/                 # 对话 UI 组件
│   │   ├── thread.tsx
│   │   ├── thread.test.tsx
│   │   ├── thread-list.tsx
│   │   ├── thread-list.test.tsx
│   │   ├── markdown-text.tsx
│   │   ├── tooltip-icon-button.tsx
│   │   └── tool-ui/                  # 工具调用结果 UI
│   │       ├── SceneListToolUI.tsx
│   │       ├── SceneListToolUI.test.tsx
│   │       ├── SceneDetailToolUI.tsx
│   │       ├── BasicInfoToolUI.tsx
│   │       ├── ExportPreviewToolUI.tsx
│   │       └── index.ts
│   ├── canvas/                       # BlockNote 画布
│   │   ├── Editor.tsx
│   │   ├── Editor.test.tsx
│   │   └── blocks/                   # 自定义块
│   │       ├── SceneBlock.tsx
│   │       ├── SceneBlock.test.tsx
│   │       ├── BasicInfoBlock.tsx
│   │       ├── BasicInfoBlock.test.tsx
│   │       └── index.ts
│   ├── layout/
│   │   ├── ThreeColumnLayout.tsx
│   │   └── ThreeColumnLayout.test.tsx
│   └── ui/                           # 基础 UI 组件
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── lib/
│   ├── agent/
│   │   ├── state.ts                  # LangGraph 状态定义
│   │   ├── state.test.ts
│   │   ├── graph.ts                  # Agent 工作流图
│   │   ├── graph.test.ts
│   │   └── tools/                    # 工具定义
│   │       ├── index.ts
│   │       ├── index.test.ts
│   │       ├── projectTools.ts
│   │       ├── sceneTools.ts
│   │       └── exportTools.ts
│   ├── ai/
│   │   ├── deepseek.ts               # DeepSeek 配置
│   │   ├── deepseek.test.ts
│   │   └── prompts.ts                # 提示词模板
│   ├── db/
│   │   ├── schema.ts                 # Drizzle Schema
│   │   ├── schema.test.ts
│   │   ├── migrations/
│   │   └── index.ts
│   └── utils/
│       ├── cn.ts
│       └── format.ts
├── stores/
│   ├── projectStore.ts               # 项目状态
│   ├── projectStore.test.ts
│   ├── canvasStore.ts                # 画布状态
│   └── canvasStore.test.ts
├── types/
│   └── index.ts                      # 类型定义
├── tests/
│   ├── helpers.ts                    # 测试辅助函数
│   ├── mocks/                        # Mock 数据
│   └── setup.ts                      # 测试配置
├── data/
│   └── app.db                        # SQLite 数据库
├── .env.local
├── .env.example
├── components.json                   # shadcn/ui 配置
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 8. 初始化步骤

```bash
# 1. 创建项目
cd /Users/macbook/aiagent/aixsss
npx assistant-ui@latest create manga-creator-beta

# 2. 进入项目
cd manga-creator-beta

# 3. 安装核心依赖
npm install @blocknote/core @blocknote/mantine @blocknote/react
npm install @langchain/langgraph @langchain/langgraph-checkpoint-sqlite
npm install better-sqlite3 drizzle-orm
npm install zustand zod

# 4. 安装开发依赖
npm install -D drizzle-kit @types/better-sqlite3
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm install -D @vitejs/plugin-react jsdom

# 5. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 添加 DEEPSEEK_API_KEY

# 6. 初始化数据库
npx drizzle-kit generate
npx drizzle-kit migrate

# 7. 启动开发服务器
npm run dev
```

---

## 9. 开发里程碑

### Phase 1: 基础框架 (Week 1)

- [ ] 项目初始化
- [ ] 三栏布局实现
- [ ] assistant-UI Thread 集成
- [ ] BlockNote 编辑器集成
- [ ] 基础测试框架搭建

### Phase 2: Agent 核心 (Week 2)

- [ ] LangGraph.js 状态管理
- [ ] 工具定义实现
- [ ] DeepSeek API 集成
- [ ] Checkpoint 持久化
- [ ] 工具单元测试

### Phase 3: 工作流实现 (Week 3)

- [ ] 基础信息收集流程
- [ ] 分镜生成流程
- [ ] 分镜细化流程
- [ ] 导出功能
- [ ] 集成测试

### Phase 4: UI 完善 (Week 4)

- [ ] tool-UI 组件完善
- [ ] 自定义块组件优化
- [ ] 响应式适配
- [ ] 用户体验优化
- [ ] E2E 测试

---

## 10. 注意事项

### 10.1 与 MVP 版本隔离

- Beta 版本在独立目录，不共享代码
- 数据存储完全独立
- 可以参考 MVP 的业务逻辑，但需重新实现

### 10.2 Agent 状态一致性

- 所有状态变更必须通过工具调用
- 画布编辑需同步回 Agent 状态
- Checkpoint 需在关键节点保存

### 10.3 测试要求

- 新功能必须先写测试
- 测试覆盖率不得低于阈值
- CI 失败则禁止合并

### 10.4 文档维护

- 使用 Context7 获取最新库文档
- 重要决策记录在代码注释中
- API 变更需同步更新类型定义

---

## 附录 A: 环境变量

```bash
# .env.example

# DeepSeek API
DEEPSEEK_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 数据库路径
DATABASE_URL="./data/app.db"

# 开发模式
NODE_ENV="development"
```

## 附录 B: 常用 Context7 查询

```typescript
// LangGraph.js 状态持久化
mcp_context7_get-library-docs({
  context7CompatibleLibraryID: "/langchain-ai/langgraphjs",
  topic: "state persistence memory checkpoints"
})

// Vercel AI SDK 工具调用
mcp_context7_get-library-docs({
  context7CompatibleLibraryID: "/vercel/ai",
  topic: "tools function calling"
})

// BlockNote 自定义块
mcp_context7_get-library-docs({
  context7CompatibleLibraryID: "/websites/blocknotejs",
  topic: "custom blocks schema"
})
```

## 附录 C: assistant-UI 文档

```typescript
// 获取 assistant-UI 文档
mcp_assistant-ui_assistantUIDocs({
  paths: ["getting-started", "api-reference/primitives/Thread"]
})

// 获取示例
mcp_assistant-ui_assistantUIExamples({
  example: "with-ai-sdk"
})
```
