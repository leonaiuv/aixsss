// ==========================================
// 核心数据类型定义
// ==========================================

// ==========================================
// 画风配置类型
// ==========================================

/**
 * 画风配置结构
 * 包含四个维度的专业描述，用于精确指导绘图AI
 */
export interface ArtStyleConfig {
  /** 预设ID（如 'anime_cel', 'cyberpunk'），自定义时为 'custom' */
  presetId: string;
  /** 整体风格（如：cel shaded, anime style） */
  baseStyle: string;
  /** 渲染技法（如：heavy impasto brushstrokes, watercolor wash） */
  technique: string;
  /** 色彩倾向（如：muted palette, high contrast, neon colors） */
  colorPalette: string;
  /** 文化/时代特征（如：Oriental, Victorian, Futuristic） */
  culturalFeature: string;
  /** 合成后的完整英文提示词（供绘图AI使用） */
  fullPrompt: string;
}

/**
 * 画风预设定义
 */
export interface ArtStylePreset {
  id: string;
  label: string;
  description: string;
  config: Omit<ArtStyleConfig, 'presetId'>;
}

/**
 * 8个专业画风预设
 */
export const ART_STYLE_PRESETS: ArtStylePreset[] = [
  {
    id: 'anime_cel',
    label: '日式赛璐珞动漫',
    description: '经典日系动画风格，清晰线条与平涂色块',
    config: {
      baseStyle: 'anime style, cel shaded, clean lineart',
      technique: 'flat color blocking, sharp outlines, gradient shading',
      colorPalette: 'vibrant saturated colors, high contrast shadows',
      culturalFeature: 'Japanese animation aesthetics, expressive eyes',
      fullPrompt: 'anime style, cel shaded, clean lineart, flat color blocking, sharp outlines, gradient shading, vibrant saturated colors, high contrast shadows, Japanese animation aesthetics, expressive eyes',
    },
  },
  {
    id: 'ink_oriental',
    label: '东方水墨风',
    description: '传统水墨意境，留白与笔触飘逸',
    config: {
      baseStyle: 'Chinese ink wash painting, sumi-e style',
      technique: 'fluid brushstrokes, ink splatter, wet-on-wet technique',
      colorPalette: 'monochrome ink tones, subtle color washes, negative space',
      culturalFeature: 'Oriental aesthetics, traditional Chinese/Japanese art',
      fullPrompt: 'Chinese ink wash painting, sumi-e style, fluid brushstrokes, ink splatter, wet-on-wet technique, monochrome ink tones, subtle color washes, negative space, Oriental aesthetics, traditional East Asian art',
    },
  },
  {
    id: 'comic_western',
    label: '美式漫画',
    description: '欧美超英风格，粗线条与动感构图',
    config: {
      baseStyle: 'American comic book style, superhero aesthetics',
      technique: 'bold outlines, halftone dots, dynamic action lines',
      colorPalette: 'primary colors, high contrast, dramatic lighting',
      culturalFeature: 'Western comic art, Marvel/DC inspired',
      fullPrompt: 'American comic book style, superhero aesthetics, bold outlines, halftone dots, dynamic action lines, primary colors, high contrast, dramatic lighting, Western comic art',
    },
  },
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    description: '霓虹未来都市，高科技与颓废美学',
    config: {
      baseStyle: 'cyberpunk style, sci-fi noir, futuristic',
      technique: 'neon glow effects, holographic overlays, digital glitch',
      colorPalette: 'cyan and magenta dominance, neon lights, dark shadows',
      culturalFeature: 'dystopian future, Asian street markets, tech noir',
      fullPrompt: 'cyberpunk style, sci-fi noir, futuristic, neon glow effects, holographic overlays, digital glitch, cyan and magenta dominance, neon lights, dark shadows, dystopian future, Asian street markets, tech noir',
    },
  },
  {
    id: 'cinematic_realistic',
    label: '写实电影风',
    description: '电影级画质，真实光影与细腻质感',
    config: {
      baseStyle: 'cinematic, photorealistic, film still',
      technique: 'volumetric lighting, depth of field, film grain',
      colorPalette: 'natural color grading, cinematic teal and orange',
      culturalFeature: 'Hollywood cinematography, ARRI camera look',
      fullPrompt: 'cinematic, photorealistic, film still, volumetric lighting, depth of field, film grain, natural color grading, cinematic teal and orange tones, Hollywood cinematography, ARRI camera look, 8k resolution',
    },
  },
  {
    id: 'fantasy_epic',
    label: '奇幻史诗',
    description: '魔法世界，宏大叙事与史诗场景',
    config: {
      baseStyle: 'epic fantasy art, digital painting',
      technique: 'detailed brushwork, atmospheric perspective, dramatic composition',
      colorPalette: 'rich jewel tones, golden highlights, ethereal glow',
      culturalFeature: 'medieval fantasy, mythical creatures, magical elements',
      fullPrompt: 'epic fantasy art, digital painting, detailed brushwork, atmospheric perspective, dramatic composition, rich jewel tones, golden highlights, ethereal glow, medieval fantasy, mythical creatures, magical elements',
    },
  },
  {
    id: 'ghibli_watercolor',
    label: '吉卜力水彩',
    description: '宫崎骏风格，柔和水彩与自然意境',
    config: {
      baseStyle: 'Studio Ghibli style, watercolor illustration',
      technique: 'soft edges, watercolor washes, hand-painted texture',
      colorPalette: 'pastel tones, warm natural colors, soft gradients',
      culturalFeature: 'Hayao Miyazaki inspired, whimsical nature scenes',
      fullPrompt: 'Studio Ghibli style, watercolor illustration, soft edges, watercolor washes, hand-painted texture, pastel tones, warm natural colors, soft gradients, Hayao Miyazaki inspired, whimsical nature scenes',
    },
  },
  {
    id: 'pixel_retro',
    label: '像素复古',
    description: '复古游戏像素风，有限色板与方块美学',
    config: {
      baseStyle: 'pixel art, retro game aesthetics, 16-bit style',
      technique: 'limited color palette, dithering, blocky shapes',
      colorPalette: 'CRT color palette, vibrant primary colors, no anti-aliasing',
      culturalFeature: '80s-90s video game nostalgia, arcade game style',
      fullPrompt: 'pixel art, retro game aesthetics, 16-bit style, limited color palette, dithering, blocky shapes, CRT color palette, vibrant primary colors, no anti-aliasing, 80s-90s video game nostalgia, arcade game style',
    },
  },
];

/**
 * 根据预设ID获取完整画风配置
 */
export function getArtStyleConfig(presetId: string): ArtStyleConfig | null {
  const preset = ART_STYLE_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;
  return {
    presetId: preset.id,
    ...preset.config,
  };
}

/**
 * 从旧版简单 style 字符串迁移到新版 ArtStyleConfig
 */
export function migrateOldStyleToConfig(oldStyle: string): ArtStyleConfig {
  // 旧版预设值映射
  const oldToNewMap: Record<string, string> = {
    'anime': 'anime_cel',
    'realistic': 'cinematic_realistic',
    'ink': 'ink_oriental',
    'comic': 'comic_western',
    'cyberpunk': 'cyberpunk',
    'fantasy': 'fantasy_epic',
  };
  
  const newPresetId = oldToNewMap[oldStyle];
  if (newPresetId) {
    const config = getArtStyleConfig(newPresetId);
    if (config) return config;
  }
  
  // 如果无法映射，使用默认的日式动漫风格
  return getArtStyleConfig('anime_cel')!;
}

/**
 * 合成完整画风提示词
 */
export function composeStyleFullPrompt(config: Omit<ArtStyleConfig, 'presetId' | 'fullPrompt'>): string {
  const parts = [
    config.baseStyle,
    config.technique,
    config.colorPalette,
    config.culturalFeature,
  ].filter(Boolean);
  return parts.join(', ');
}

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
  | 'motion_prompt'
  | 'dialogue';  // 台词生成阶段

// ==========================================
// 台词相关类型
// ==========================================

/** 台词类型 */
export type DialogueType = 
  | 'dialogue'   // 对白（角色间对话）
  | 'monologue'  // 独白（单个角色自言自语）
  | 'narration'  // 旁白（画外音）
  | 'thought';   // 心理活动（内心独白）

/** 台词类型中文标签 */
export const DIALOGUE_TYPE_LABELS: Record<DialogueType, string> = {
  dialogue: '对白',
  monologue: '独白',
  narration: '旁白',
  thought: '心理',
};

/** 单条台词 */
export interface DialogueLine {
  id: string;
  type: DialogueType;
  characterName?: string;  // 说话角色名（旁白时可为空）
  content: string;         // 台词内容
  order: number;           // 台词顺序
}

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
  /** @deprecated 保留用于向后兼容，请使用 artStyleConfig */
  style: string;
  /** 新版画风配置，包含完整的专业描述 */
  artStyleConfig?: ArtStyleConfig;
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
  /** 台词列表 - 对白/独白/旁白/心理活动 */
  dialogues?: DialogueLine[];
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

// 角色定妆照提示词（多格式）
export interface PortraitPrompts {
  /** Midjourney 格式 */
  midjourney: string;
  /** Stable Diffusion 格式 */
  stableDiffusion: string;
  /** 通用格式 */
  general: string;
}

// 角色实体
export interface Character {
  id: string;
  projectId: string;
  name: string;
  /** 用户输入的简短描述，用于AI生成完整角色卡 */
  briefDescription?: string;
  avatar?: string;
  appearance: string;
  personality: string;
  background: string;
  /** 角色定妆照提示词（多格式） */
  portraitPrompts?: PortraitPrompts;
  /** 角色专属画风（可选，覆盖项目画风） */
  customStyle?: string;
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
