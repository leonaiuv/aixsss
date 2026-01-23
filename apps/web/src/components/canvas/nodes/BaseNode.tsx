/**
 * 画布节点基础组件
 * 提供统一的节点外壳、状态指示、进度条和交互处理
 */

import { memo, useCallback, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Settings,
  Globe,
  Users,
  GitBranch,
  ListOrdered,
  Film,
  Sparkles,
  LayoutGrid,
  Anchor,
  Clapperboard,
  Image,
  Layers,
  MessageSquare,
  Download,
  Bot,
  GitFork,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvasStore';
import type { AgentCanvasNodeV2, AgentCanvasNodeTypeV2, NodeExecutionState } from '@/types/canvas';
import { NODE_STATE_LABELS } from '@/types/canvas';

// ==========================================
// 图标映射
// ==========================================

const NODE_ICONS: Record<AgentCanvasNodeTypeV2, React.ComponentType<{ className?: string }>> = {
  project_settings: Settings,
  world_view: Globe,
  characters: Users,
  narrative_causal_chain: GitBranch,
  episode_plan: ListOrdered,
  episode: Film,
  core_expression: Sparkles,
  scene_list: LayoutGrid,
  scene_anchor: Anchor,
  action_plan: Clapperboard,
  keyframe_groups: Image,
  batch_refine: Layers,
  dialogue: MessageSquare,
  export: Download,
  llm: Bot,
  condition: GitFork,
  group: FolderOpen,
};

// ==========================================
// 状态图标
// ==========================================

function StateIcon({ state }: { state: NodeExecutionState }) {
  switch (state) {
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />;
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'warning':
      return <AlertCircle className="h-3.5 w-3.5 text-orange-500" />;
    case 'ready':
      return <Circle className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ==========================================
// 进度条
// ==========================================

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

// ==========================================
// BaseNode 组件
// ==========================================

export interface BaseNodeProps {
  /** 节点 ID */
  id: string;
  /** 节点类型 */
  type: AgentCanvasNodeTypeV2;
  /** 节点数据 */
  data: Record<string, unknown>;
  /** 执行状态 */
  state: NodeExecutionState;
  /** 是否选中 */
  selected?: boolean;
  /** 进度 (0-100) */
  progress?: number;
  /** 最后错误信息 */
  lastError?: string;
  /** 摘要预览内容 */
  preview?: ReactNode;
  /** 是否显示输入句柄 */
  showTarget?: boolean;
  /** 是否显示输出句柄 */
  showSource?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const BaseNode = memo(function BaseNode({
  id,
  type,
  data,
  state,
  selected,
  progress,
  lastError,
  preview,
  showTarget = true,
  showSource = true,
  className,
}: BaseNodeProps) {
  const openNodeDialog = useCanvasStore((s) => s.openNodeDialog);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const Icon = NODE_ICONS[type] ?? Bot;
  const label = (data.label as string) ?? type;

  const handleDoubleClick = useCallback(() => {
    openNodeDialog(id);
  }, [id, openNodeDialog]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(id, e.shiftKey || e.metaKey);
    },
    [id, selectNode],
  );

  return (
    <div
      className={cn(
        'min-w-[200px] max-w-[280px] rounded-lg border bg-background/95 shadow-md backdrop-blur-sm transition-all',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        state === 'running' && 'border-yellow-500',
        state === 'error' && 'border-red-500',
        state === 'success' && 'border-green-500',
        className,
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* 输入句柄 */}
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}

      {/* 输出句柄 */}
      {showSource && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
        />
      )}

      {/* 头部 */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        <StateIcon state={state} />
      </div>

      {/* 预览内容 */}
      {preview && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          <div className="line-clamp-2">{preview}</div>
        </div>
      )}

      {/* 进度条 */}
      {state === 'running' && progress !== undefined && progress > 0 && (
        <div className="px-3 pb-2">
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* 错误信息 */}
      {state === 'error' && lastError && (
        <div className="border-t px-3 py-1.5">
          <p className="line-clamp-2 text-xs text-red-500">{lastError}</p>
        </div>
      )}

      {/* 底部状态文字 */}
      {state !== 'idle' && state !== 'ready' && (
        <div className="border-t px-3 py-1">
          <p className="text-xs text-muted-foreground">{NODE_STATE_LABELS[state]}</p>
        </div>
      )}
    </div>
  );
});

// ==========================================
// 节点包装器
// ==========================================

/**
 * 创建节点组件的高阶函数
 * 用于将 BaseNode 与 ReactFlow 的 NodeProps 结合
 */
// eslint-disable-next-line react-refresh/only-export-components
export function createNodeComponent(
  type: AgentCanvasNodeTypeV2,
  options?: {
    showTarget?: boolean;
    showSource?: boolean;
    getPreview?: (data: Record<string, unknown>) => ReactNode;
  },
) {
  const { showTarget = true, showSource = true, getPreview } = options ?? {};

  return memo(function NodeComponent(props: NodeProps<AgentCanvasNodeV2>) {
    const { id, data, selected } = props;
    const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id));

    if (!node) return null;

    const preview = getPreview ? getPreview(data as Record<string, unknown>) : undefined;

    return (
      <BaseNode
        id={id}
        type={type}
        data={data as Record<string, unknown>}
        state={node.state}
        selected={selected}
        progress={node.progress}
        lastError={node.lastError}
        preview={preview}
        showTarget={showTarget}
        showSource={showSource}
      />
    );
  });
}

// ==========================================
// 导出常用节点组件
// ==========================================

/** 项目设定节点 */
export const ProjectSettingsNodeV2 = createNodeComponent('project_settings', {
  showTarget: false,
  getPreview: (data) => data.preview as string,
});

/** 世界观节点 */
export const WorldViewNodeV2 = createNodeComponent('world_view', {
  getPreview: (data) => {
    const count = (data.elementCount as number) ?? 0;
    return count > 0 ? `${count} 个世界观要素` : '点击添加世界观要素';
  },
});

/** 角色库节点 */
export const CharactersNodeV2 = createNodeComponent('characters', {
  getPreview: (data) => {
    const count = (data.characterCount as number) ?? 0;
    return count > 0 ? `${count} 个角色` : '点击添加角色';
  },
});

/** 叙事因果链节点 */
export const NarrativeCausalChainNodeV2 = createNodeComponent('narrative_causal_chain', {
  getPreview: (data) => {
    const mode = (data.actMode as string) ?? 'three_act';
    return mode === 'five_act' ? '五幕式结构' : '三幕式结构';
  },
});

/** 剧集规划节点 */
export const EpisodePlanNodeV2 = createNodeComponent('episode_plan', {
  getPreview: (data) => {
    const count = (data.targetEpisodeCount as number) ?? 0;
    return count > 0 ? `规划 ${count} 集` : '设置目标集数';
  },
});

/** 单集节点 */
export const EpisodeNodeV2 = createNodeComponent('episode', {
  getPreview: (data) => {
    const order = (data.episodeOrder as number) ?? 0;
    const title = (data.episodeTitle as string) ?? '';
    return order > 0 ? `第 ${order} 集${title ? `: ${title}` : ''}` : '选择剧集';
  },
});

/** 核心表达节点 */
export const CoreExpressionNodeV2 = createNodeComponent('core_expression');

/** 分镜列表节点 */
export const SceneListNodeV2 = createNodeComponent('scene_list', {
  getPreview: (data) => {
    const count = (data.sceneCount as number) ?? 0;
    return count > 0 ? `${count} 个分镜` : '生成分镜列表';
  },
});

/** 场景锚点节点 */
export const SceneAnchorNodeV2 = createNodeComponent('scene_anchor');

/** 动作拆解节点 */
export const ActionPlanNodeV2 = createNodeComponent('action_plan');

/** 关键帧组节点 */
export const KeyframeGroupsNodeV2 = createNodeComponent('keyframe_groups');

/** 批量细化节点 */
export const BatchRefineNodeV2 = createNodeComponent('batch_refine');

/** 对白节点 */
export const DialogueNodeV2 = createNodeComponent('dialogue');

/** 导出节点 */
export const ExportNodeV2 = createNodeComponent('export', {
  showSource: false,
  getPreview: (data) => {
    const format = (data.format as string) ?? 'markdown';
    return format === 'json' ? 'JSON 格式导出' : 'Markdown 格式导出';
  },
});

/** LLM 通用节点 */
export const LlmNodeV2 = createNodeComponent('llm', {
  getPreview: (data) => (data.systemPrompt as string) ?? '通用 AI 处理节点',
});

/** 条件节点 */
export const ConditionNodeV2 = createNodeComponent('condition', {
  getPreview: (data) => (data.condition as string) ?? '条件分支',
});

/** 分组节点 */
export const GroupNodeV2 = createNodeComponent('group', {
  getPreview: (data) => {
    const count = ((data.childNodeIds as string[]) ?? []).length;
    return count > 0 ? `包含 ${count} 个节点` : '空分组';
  },
});
