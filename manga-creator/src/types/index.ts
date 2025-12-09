// ==========================================
// 核心数据类型定义
// ==========================================

// 工作流状态
export type WorkflowState =
  | 'IDLE'
  | 'DATA_COLLECTING'
  | 'DATA_COLLECTED'
  | 'WORLD_VIEW_BUILDING'
  | 'CHARACTER_MANAGING'
  | 'SCENE_LIST_GENERATING'
  | 'SCENE_LIST_EDITING'
  | 'SCENE_LIST_CONFIRMED'
  | 'SCENE_PROCESSING'
  | 'ALL_SCENES_COMPLETE'
  | 'EXPORTING';

// 分镜处理步骤
export type SceneStep = 
  | 'scene_description'
  | 'keyframe_prompt'
  | 'motion_prompt';

// 分镜状态
export type SceneStatus = 
  | 'pending'
  | 'scene_generating'
  | 'scene_confirmed'
  | 'keyframe_generating'
  | 'keyframe_confirmed'
  | 'motion_generating'
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
  /** @deprecated 保留用于向后兼容 */
  actionDescription: string;
  /** 关键帧提示词 - 静态图片描述，用于绘图AI */
  shotPrompt: string;
  /** 时空提示词 - 动作/镜头/变化，用于视频AI */
  motionPrompt: string;
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
  | 'generate_keyframe_prompt'
  | 'generate_motion_prompt'
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

// ==========================================
// 新增功能类型定义
// ==========================================

// 主题类型
export type ThemeMode = 'light' | 'dark' | 'system';

// 世界观要素
export interface WorldViewElement {
  id: string;
  projectId: string;
  type: 'era' | 'geography' | 'society' | 'technology' | 'magic' | 'custom';
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// 角色实体
export interface Character {
  id: string;
  projectId: string;
  name: string;
  avatar?: string;
  appearance: string;
  personality: string;
  background: string;
  relationships: CharacterRelationship[];
  appearances: SceneAppearance[];
  themeColor?: string;
  createdAt: string;
  updatedAt: string;
}

// 角色关系
export interface CharacterRelationship {
  targetCharacterId: string;
  relationshipType: string;
  description: string;
}

// 角色出场记录
export interface SceneAppearance {
  sceneId: string;
  role: 'main' | 'supporting' | 'background';
  notes: string;
}

// 版本历史
export interface Version {
  id: string;
  projectId: string;
  type: 'project' | 'scene';
  targetId: string;
  snapshot: unknown;
  diff?: unknown;
  label?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

// 提示词模板
export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  template: string;
  variables: string[];
  style?: string;
  isBuiltIn: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// 批量操作
export interface BatchOperation {
  type: 'generate' | 'edit' | 'delete' | 'export';
  targetIds: string[];
  params?: Record<string, unknown>;
}

// AI生成参数
export interface AIGenerationParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

// 搜索过滤器
export interface SearchFilter {
  query: string;
  status?: SceneStatus[];
  dateRange?: {
    start: string;
    end: string;
  };
  tags?: string[];
}

// 统计数据
export interface Statistics {
  projectCount: number;
  sceneCount: number;
  completedSceneCount: number;
  totalTokens: number;
  estimatedCost: number;
  averageSceneTime: number;
  generationSuccessRate: number;
  creationTimeData: {
    date: string;
    count: number;
  }[];
}

// 快捷键配置
export interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  keys: string[];
  action: string;
  enabled: boolean;
}

// 导出格式
export type ExportFormat = 'markdown' | 'json' | 'pdf' | 'txt' | 'zip';

// 导出选项
export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  includeImages: boolean;
  compression: boolean;
}

// 上下文压缩策略
export type CompressionStrategy = 'aggressive' | 'balanced' | 'conservative';

// 级联更新配置
export interface CascadeUpdateConfig {
  autoUpdate: boolean;
  affectedScenes: string[];
  updateType: 'scene' | 'action' | 'prompt';
}

// 流式响应状态
export interface StreamingState {
  isStreaming: boolean;
  content: string;
  progress: number;
  canCancel: boolean;
}
