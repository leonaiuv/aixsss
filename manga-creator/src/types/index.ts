// ==========================================
// 核心数据类型定义
// ==========================================

// 工作流状态
export type WorkflowState =
  | 'IDLE'
  | 'DATA_COLLECTING'
  | 'DATA_COLLECTED'
  | 'SCENE_LIST_GENERATING'
  | 'SCENE_LIST_EDITING'
  | 'SCENE_LIST_CONFIRMED'
  | 'SCENE_PROCESSING'
  | 'ALL_SCENES_COMPLETE'
  | 'EXPORTING';

// 分镜处理步骤
export type SceneStep = 
  | 'scene_description'
  | 'action_description'
  | 'shot_prompt';

// 分镜状态
export type SceneStatus = 
  | 'pending'
  | 'scene_generating'
  | 'scene_confirmed'
  | 'action_generating'
  | 'action_confirmed'
  | 'prompt_generating'
  | 'completed'
  | 'needs_update';

// 项目上下文缓存
export interface ProjectContextCache {
  styleKeywords: string;
  protagonistCore: string;
  storyCore: string;
  lastUpdated: string;
}

// 项目实体
export interface Project {
  id: string;
  title: string;
  summary: string;
  style: string;
  protagonist: string;
  contextCache?: ProjectContextCache;
  workflowState: WorkflowState;
  currentSceneOrder: number;
  currentSceneStep?: SceneStep;
  createdAt: string;
  updatedAt: string;
}

// 分镜上下文摘要
export interface SceneContextSummary {
  mood: string;
  keyElement: string;
  transition: string;
}

// 分镜实体
export interface Scene {
  id: string;
  projectId: string;
  order: number;
  summary: string;
  sceneDescription: string;
  actionDescription: string;
  shotPrompt: string;
  contextSummary?: SceneContextSummary;
  status: SceneStatus;
  notes: string;
}

// ==========================================
// AI相关类型
// ==========================================

// AI供应商类型
export type ProviderType = 'deepseek' | 'kimi' | 'gemini' | 'openai-compatible';

// 用户API配置
export interface UserConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL?: string;
  model: string;
}

// 聊天消息
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// AI响应
export interface AIResponse {
  content: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// 上下文类型
export type ContextType = 
  | 'project_essence'
  | 'current_scene'
  | 'current_scene_summary'
  | 'prev_scene_summary'
  | 'confirmed_content'
  | 'scene_list_overview';

// 生成任务类型
export type TaskType = 
  | 'generate_scene_list'
  | 'generate_scene_desc'
  | 'generate_action_desc'
  | 'generate_shot_prompt'
  | 'regenerate';

// 生成任务
export interface GenerationTask {
  id: string;
  type: TaskType;
  projectId: string;
  sceneId?: string;
  sceneOrder?: number;
  retryCount: number;
  createdAt: string;
}

// 生成结果
export interface GenerationResult {
  success: boolean;
  content?: string;
  error?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ==========================================
// LocalStorage数据结构
// ==========================================

export interface LocalStorageSchema {
  'aixs_version': string;
  'aixs_projects': Project[];
  'aixs_scenes': Record<string, Scene[]>;
  'aixs_config': string; // 加密后的UserConfig
}

// ==========================================
// Agent Skill相关
// ==========================================

export interface OutputFormat {
  type: 'text' | 'json';
  maxLength?: number;
}

export interface Skill {
  name: string;
  description: string;
  requiredContext: ContextType[];
  promptTemplate: string;
  outputFormat: OutputFormat;
  maxTokens: number;
}

export interface Context {
  projectEssence?: {
    style: string;
    protagonistCore: string;
    storyCore: string;
  };
  currentScene?: Scene;
  currentSceneSummary?: string;
  prevSceneSummary?: string;
  confirmedContent?: string;
  sceneListOverview?: string;
}
