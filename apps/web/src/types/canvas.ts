/**
 * AgentCanvas 画布系统 V2 类型定义
 * 全面重构版本，支持新节点体系、撤销/重做、节点状态机
 */

// ==========================================
// 节点类型枚举 (V2)
// ==========================================

/**
 * 画布节点类型 V2
 * 映射 EpisodeWorkflow 的工作流步骤
 */
export type AgentCanvasNodeTypeV2 =
  // 全局设定 (global)
  | 'project_settings' // 项目设定：标题、梗概、画风、主角
  | 'world_view' // 世界观要素管理
  | 'characters' // 角色库管理
  // 叙事因果 (causal)
  | 'narrative_causal_chain' // 叙事因果链：冲突引擎、信息层、节拍流
  // 剧集规划 (plan)
  | 'episode_plan' // 剧集规划：生成 N 集概要
  // 单集创作 (episode)
  | 'episode' // 单集：选择/管理单个剧集
  | 'core_expression' // 核心表达：主题、情感曲线、视觉母题
  | 'scene_list' // 分镜列表生成
  | 'scene_anchor' // 场景锚点：场景描述生成
  | 'action_plan' // 动作拆解：ActionPlan/beats
  | 'keyframe_groups' // 关键帧组：9 组关键帧
  | 'batch_refine' // 批量细化分镜
  | 'dialogue' // 对白生成
  // 导出 (export)
  | 'export' // Markdown/JSON 导出
  // 通用节点
  | 'llm' // LLM 通用节点：对话/润色/结构化
  | 'condition' // 条件分支节点
  | 'group'; // 分组容器节点

// ==========================================
// 节点执行状态
// ==========================================

/**
 * 节点执行状态机
 */
export type NodeExecutionState =
  | 'idle' // 初始状态，未执行
  | 'ready' // 依赖满足，可执行
  | 'running' // 执行中
  | 'success' // 执行成功
  | 'error' // 执行失败
  | 'warning'; // 需要注意（如数据过期）

// ==========================================
// 节点元数据
// ==========================================

/**
 * 节点执行元数据
 */
export interface NodeMetadataV2 {
  /** 输入数据校验和，用于检测数据变更 */
  checksum?: string;
  /** Token 消耗量 */
  tokenUsage?: number;
  /** 数据版本号 */
  version?: number;
  /** 关联的 Job ID */
  jobId?: string;
}

// ==========================================
// 节点定义 (V2)
// ==========================================

/**
 * 画布节点 V2
 */
export interface AgentCanvasNodeV2<TData = Record<string, unknown>> {
  /** 节点唯一 ID */
  id: string;
  /** 节点类型 */
  type: AgentCanvasNodeTypeV2;
  /** 画布位置 */
  position: { x: number; y: number };
  /** 节点数据 */
  data: TData;
  /** 节点宽度 */
  width?: number;
  /** 节点高度 */
  height?: number;
  /** 执行状态 */
  state: NodeExecutionState;
  /** 上次执行时间 (ISO 字符串) */
  lastRunAt?: string;
  /** 上次执行耗时 (毫秒) */
  lastRunDuration?: number;
  /** 最后错误信息 */
  lastError?: string;
  /** 执行进度 (0-100) */
  progress?: number;
  /** 元数据 */
  metadata?: NodeMetadataV2;
  /** 是否锁定 */
  locked?: boolean;
  /** 所属分组 ID */
  groupId?: string;
}

// ==========================================
// 边类型定义 (V2)
// ==========================================

/**
 * 边类型
 */
export type EdgeTypeV2 = 'default' | 'data' | 'control';

/**
 * 画布边 V2
 */
export interface AgentCanvasEdgeV2 {
  /** 边唯一 ID */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
  /** 源节点句柄 */
  sourceHandle?: string;
  /** 目标节点句柄 */
  targetHandle?: string;
  /** 边类型 */
  type?: EdgeTypeV2;
  /** 边标签 */
  label?: string;
  /** 是否显示动画 */
  animated?: boolean;
}

// ==========================================
// 视口状态
// ==========================================

/**
 * 画布视口状态 V2
 */
export interface AgentCanvasViewportV2 {
  /** X 偏移 */
  x: number;
  /** Y 偏移 */
  y: number;
  /** 缩放级别 */
  zoom: number;
}

// ==========================================
// 分组定义
// ==========================================

/**
 * 节点分组 V2
 */
export interface AgentCanvasGroupV2 {
  /** 分组 ID */
  id: string;
  /** 分组名称 */
  name: string;
  /** 分组颜色 */
  color?: string;
  /** 是否折叠 */
  collapsed?: boolean;
}

// ==========================================
// 历史快照
// ==========================================

/**
 * 画布历史快照
 */
export interface CanvasHistorySnapshot {
  /** 快照 ID */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 操作描述 */
  label: string;
  /** 节点快照 */
  nodes: AgentCanvasNodeV2[];
  /** 边快照 */
  edges: AgentCanvasEdgeV2[];
}

// ==========================================
// 画布图定义 (V2)
// ==========================================

/**
 * 画布图 V2
 */
export interface AgentCanvasGraphV2 {
  /** 版本号 */
  version: 2;
  /** 节点列表 */
  nodes: AgentCanvasNodeV2[];
  /** 边列表 */
  edges: AgentCanvasEdgeV2[];
  /** 视口状态 */
  viewport?: AgentCanvasViewportV2;
  /** 分组列表 */
  groups?: AgentCanvasGroupV2[];
}

// ==========================================
// 节点库定义
// ==========================================

/**
 * 节点库分类
 */
export type NodeCategory =
  | 'global' // 全局设定
  | 'causal' // 叙事因果
  | 'plan' // 剧集规划
  | 'episode' // 单集创作
  | 'export' // 导出
  | 'utility'; // 通用工具

/**
 * 节点库项
 */
export interface NodeLibraryItem {
  /** 节点类型 */
  type: AgentCanvasNodeTypeV2;
  /** 显示标签 */
  label: string;
  /** 描述 */
  description: string;
  /** 分类 */
  category: NodeCategory;
  /** 图标名称 (lucide-react) */
  icon: string;
  /** 默认数据 */
  defaultData?: Record<string, unknown>;
  /** 是否可添加多个 */
  allowMultiple?: boolean;
  /** 是否需要 API 模式 */
  requiresApi?: boolean;
}

/**
 * 节点库
 */
export const NODE_LIBRARY_V2: NodeLibraryItem[] = [
  // 全局设定
  {
    type: 'project_settings',
    label: '项目设定',
    description: '标题、梗概、画风、主角',
    category: 'global',
    icon: 'Settings',
    allowMultiple: false,
  },
  {
    type: 'world_view',
    label: '世界观',
    description: '世界观要素管理',
    category: 'global',
    icon: 'Globe',
    allowMultiple: false,
  },
  {
    type: 'characters',
    label: '角色库',
    description: '角色创建与管理',
    category: 'global',
    icon: 'Users',
    allowMultiple: false,
  },
  // 叙事因果
  {
    type: 'narrative_causal_chain',
    label: '叙事因果链',
    description: '冲突引擎、信息层、节拍流',
    category: 'causal',
    icon: 'GitBranch',
    allowMultiple: false,
    requiresApi: true,
  },
  // 剧集规划
  {
    type: 'episode_plan',
    label: '剧集规划',
    description: '生成 N 集概要',
    category: 'plan',
    icon: 'ListOrdered',
    allowMultiple: false,
    requiresApi: true,
  },
  // 单集创作
  {
    type: 'episode',
    label: '单集',
    description: '选择/管理单个剧集',
    category: 'episode',
    icon: 'Film',
    allowMultiple: true,
  },
  {
    type: 'core_expression',
    label: '核心表达',
    description: '主题、情感曲线、视觉母题',
    category: 'episode',
    icon: 'Sparkles',
    requiresApi: true,
  },
  {
    type: 'scene_list',
    label: '分镜列表',
    description: '生成分镜列表',
    category: 'episode',
    icon: 'LayoutGrid',
    requiresApi: true,
  },
  {
    type: 'scene_anchor',
    label: '场景锚点',
    description: '场景描述生成',
    category: 'episode',
    icon: 'Anchor',
    requiresApi: true,
  },
  {
    type: 'action_plan',
    label: '动作拆解',
    description: 'ActionPlan/beats 生成',
    category: 'episode',
    icon: 'Clapperboard',
    requiresApi: true,
  },
  {
    type: 'keyframe_groups',
    label: '关键帧组',
    description: '9 组关键帧生成',
    category: 'episode',
    icon: 'Image',
    requiresApi: true,
  },
  {
    type: 'batch_refine',
    label: '批量细化',
    description: '批量细化全部分镜',
    category: 'episode',
    icon: 'Layers',
    requiresApi: true,
  },
  {
    type: 'dialogue',
    label: '对白生成',
    description: '角色对白生成',
    category: 'episode',
    icon: 'MessageSquare',
    requiresApi: true,
  },
  // 导出
  {
    type: 'export',
    label: '导出',
    description: 'Markdown/JSON 导出',
    category: 'export',
    icon: 'Download',
  },
  // 通用工具
  {
    type: 'llm',
    label: 'LLM 节点',
    description: '通用对话/润色/结构化',
    category: 'utility',
    icon: 'Bot',
    allowMultiple: true,
  },
  {
    type: 'condition',
    label: '条件节点',
    description: '条件分支逻辑',
    category: 'utility',
    icon: 'GitFork',
    allowMultiple: true,
  },
  {
    type: 'group',
    label: '分组容器',
    description: '将节点分组聚合',
    category: 'utility',
    icon: 'FolderOpen',
    allowMultiple: true,
  },
];

// ==========================================
// 节点数据类型定义
// ==========================================

/** 项目设定节点数据 */
export interface ProjectSettingsNodeData {
  label?: string;
}

/** 世界观节点数据 */
export interface WorldViewNodeData {
  label?: string;
}

/** 角色库节点数据 */
export interface CharactersNodeData {
  label?: string;
}

/** 叙事因果链节点数据 */
export interface NarrativeCausalChainNodeData {
  label?: string;
  actMode?: 'three_act' | 'five_act';
}

/** 剧集规划节点数据 */
export interface EpisodePlanNodeData {
  label?: string;
  targetEpisodeCount?: number;
}

/** 单集节点数据 */
export interface EpisodeNodeData {
  label?: string;
  episodeId?: string;
  episodeOrder?: number;
}

/** 核心表达节点数据 */
export interface CoreExpressionNodeData {
  label?: string;
  episodeId?: string;
}

/** 分镜列表节点数据 */
export interface SceneListNodeData {
  label?: string;
  episodeId?: string;
  sceneCountHint?: number;
}

/** 场景锚点节点数据 */
export interface SceneAnchorNodeData {
  label?: string;
  episodeId?: string;
  sceneId?: string;
}

/** 动作拆解节点数据 */
export interface ActionPlanNodeData {
  label?: string;
  episodeId?: string;
  sceneId?: string;
}

/** 关键帧组节点数据 */
export interface KeyframeGroupsNodeData {
  label?: string;
  episodeId?: string;
  sceneId?: string;
}

/** 批量细化节点数据 */
export interface BatchRefineNodeData {
  label?: string;
  episodeId?: string;
}

/** 对白节点数据 */
export interface DialogueNodeData {
  label?: string;
  episodeId?: string;
  sceneId?: string;
}

/** 导出节点数据 */
export interface ExportNodeData {
  label?: string;
  format?: 'markdown' | 'json';
}

/** LLM 节点数据 */
export interface LlmNodeData {
  label?: string;
  systemPrompt?: string;
  userPrompt?: string;
  result?: string;
}

/** 条件节点数据 */
export interface ConditionNodeData {
  label?: string;
  condition?: string;
}

/** 分组节点数据 */
export interface GroupNodeData {
  label?: string;
  childNodeIds?: string[];
}

// ==========================================
// 工具函数
// ==========================================

/**
 * 生成节点 ID
 */
export function generateNodeId(type: AgentCanvasNodeTypeV2): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${type}_${Date.now()}_${rand}`;
}

/**
 * 生成边 ID
 */
export function generateEdgeId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `edge_${Date.now()}_${rand}`;
}

/**
 * 获取节点库项
 */
export function getNodeLibraryItem(type: AgentCanvasNodeTypeV2): NodeLibraryItem | undefined {
  return NODE_LIBRARY_V2.find((item) => item.type === type);
}

/**
 * 创建默认节点
 */
export function createDefaultNode(
  type: AgentCanvasNodeTypeV2,
  position: { x: number; y: number } = { x: 0, y: 0 },
): AgentCanvasNodeV2 {
  const libraryItem = getNodeLibraryItem(type);
  return {
    id: generateNodeId(type),
    type,
    position,
    data: {
      label: libraryItem?.label ?? type,
      ...(libraryItem?.defaultData ?? {}),
    },
    state: 'idle',
  };
}

/**
 * 节点状态颜色映射
 */
export const NODE_STATE_COLORS: Record<NodeExecutionState, string> = {
  idle: 'bg-muted',
  ready: 'bg-blue-500',
  running: 'bg-yellow-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-orange-500',
};

/**
 * 节点状态文本映射
 */
export const NODE_STATE_LABELS: Record<NodeExecutionState, string> = {
  idle: '未执行',
  ready: '就绪',
  running: '执行中',
  success: '成功',
  error: '错误',
  warning: '警告',
};
