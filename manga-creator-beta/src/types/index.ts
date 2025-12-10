// =====================
// 工作流状态类型
// =====================
export type WorkflowState =
  | 'IDLE'                    // 空闲状态
  | 'COLLECTING_BASIC_INFO'   // 收集基础信息
  | 'BASIC_INFO_COMPLETE'     // 基础信息完成
  | 'GENERATING_SCENES'       // 生成分镜中
  | 'SCENE_LIST_EDITING'      // 分镜列表编辑中
  | 'SCENE_LIST_CONFIRMED'    // 分镜列表已确认
  | 'REFINING_SCENES'         // 细化分镜中
  | 'ALL_SCENES_COMPLETE'     // 所有分镜完成
  | 'EXPORTING'               // 导出中
  | 'EXPORTED';               // 已导出

// =====================
// 分镜状态类型
// =====================
export type SceneStatus =
  | 'pending'         // 待处理
  | 'in_progress'     // 处理中（正在生成）
  | 'scene_confirmed' // 场景已确认
  | 'keyframe_confirmed' // 关键帧已确认
  | 'completed'       // 已完成
  | 'error';          // 出错

// =====================
// 对话类型
// =====================
export interface Dialogue {
  id: string;
  character: string;
  content: string;
  order: number;
}

// =====================
// 分镜类型
// =====================
export interface Scene {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
  sceneDescription?: string;
  keyframePrompt?: string;
  spatialPrompt?: string;
  dialogues: Dialogue[];
}

// =====================
// 角色类型
// =====================
export interface Character {
  id: string;
  name: string;
  description: string;
  portraitPrompt?: string;
}

// =====================
// 项目状态类型
// =====================
export interface ProjectState {
  // 基础信息
  projectId: string;
  title: string;
  summary: string;
  artStyle: string;
  protagonist: string;

  // 工作流状态
  workflowState: WorkflowState;

  // 分镜数据
  scenes: Scene[];
  currentSceneIndex: number;

  // 画布内容 (BlockNote blocks)
  canvasContent: unknown[];

  // 角色数据
  characters: Character[];

  // 元数据
  createdAt: Date;
  updatedAt: Date;
}

// =====================
// UI 状态类型
// =====================
export interface ProjectUIState {
  // UI 状态
  isLoading: boolean;
  currentThreadId: string | null;
  selectedSceneIndex: number;
  isGenerating: boolean;
  generatingStep: string | null;
  error: string | null;

  // Agent 状态镜像
  projectState: ProjectState | null;
}

// =====================
// 基础信息块类型
// =====================
export interface BasicInfoBlockProps {
  type: 'basic_info';
  props: {
    title: string;
    summary: string;
    artStyle: string;
    protagonist: string;
  };
}

// =====================
// 分镜块类型
// =====================
export interface SceneBlockProps {
  type: 'scene';
  props: {
    sceneId: string;
    order: number;
    summary: string;
    status: SceneStatus;
    sceneDescription?: string;
    keyframePrompt?: string;
    spatialPrompt?: string;
    dialogues?: Dialogue[];
  };
}

// =====================
// 工具调用结果类型
// =====================
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// =====================
// API 响应类型
// =====================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
