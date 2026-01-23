/**
 * 节点库面板组件
 * 展示可添加的节点类型，支持拖拽添加到画布
 */

import { useCallback } from 'react';
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
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvasStore';
import type { AgentCanvasNodeTypeV2, NodeCategory, NodeLibraryItem } from '@/types/canvas';
import { NODE_LIBRARY_V2 } from '@/types/canvas';
import { useState } from 'react';

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
// 分类配置
// ==========================================

const CATEGORY_CONFIG: Record<NodeCategory, { label: string; icon: React.ReactNode }> = {
  global: { label: '全局设定', icon: <Settings className="h-4 w-4" /> },
  causal: { label: '叙事因果', icon: <GitBranch className="h-4 w-4" /> },
  plan: { label: '剧集规划', icon: <ListOrdered className="h-4 w-4" /> },
  episode: { label: '单集创作', icon: <Film className="h-4 w-4" /> },
  export: { label: '导出', icon: <Download className="h-4 w-4" /> },
  utility: { label: '通用工具', icon: <Bot className="h-4 w-4" /> },
};

const CATEGORY_ORDER: NodeCategory[] = ['global', 'causal', 'plan', 'episode', 'export', 'utility'];

// ==========================================
// 节点项组件
// ==========================================

interface NodeItemProps {
  item: NodeLibraryItem;
  onAdd: (type: AgentCanvasNodeTypeV2) => void;
}

function NodeItem({ item, onAdd }: NodeItemProps) {
  const Icon = NODE_ICONS[item.type] ?? Bot;

  const handleClick = useCallback(() => {
    onAdd(item.type);
  }, [item.type, onAdd]);

  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      event.dataTransfer.setData('application/reactflow', item.type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [item.type],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex cursor-grab items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm transition-colors',
              'hover:border-primary hover:bg-accent active:cursor-grabbing',
              item.requiresApi && 'border-dashed',
            )}
            draggable
            onDragStart={handleDragStart}
            onClick={handleClick}
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{item.label}</span>
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px]">
          <p className="font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
          {item.requiresApi && <p className="mt-1 text-xs text-yellow-500">需要 API 模式</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ==========================================
// 分类组组件
// ==========================================

interface CategoryGroupProps {
  category: NodeCategory;
  items: NodeLibraryItem[];
  onAdd: (type: AgentCanvasNodeTypeV2) => void;
  defaultOpen?: boolean;
}

function CategoryGroup({ category, items, onAdd, defaultOpen = true }: CategoryGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = CATEGORY_CONFIG[category];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {config.icon}
          <span className="flex-1 text-left">{config.label}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-6 pt-1">
        {items.map((item) => (
          <NodeItem key={item.type} item={item} onAdd={onAdd} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ==========================================
// NodePalette 组件
// ==========================================

export function NodePalette() {
  const addNode = useCanvasStore((s) => s.addNode);

  const handleAddNode = useCallback(
    (type: AgentCanvasNodeTypeV2) => {
      // 计算新节点位置（画布中心偏移）
      const position = { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 };
      addNode(type, position);
    },
    [addNode],
  );

  // 按分类分组
  const groupedItems = CATEGORY_ORDER.reduce(
    (acc, category) => {
      const items = NODE_LIBRARY_V2.filter((item) => item.category === category);
      if (items.length > 0) {
        acc[category] = items;
      }
      return acc;
    },
    {} as Record<NodeCategory, NodeLibraryItem[]>,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="text-sm font-semibold">节点库</h3>
        <p className="text-xs text-muted-foreground">拖拽或点击添加节点</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-2">
          {CATEGORY_ORDER.map((category) => {
            const items = groupedItems[category];
            if (!items || items.length === 0) return null;
            return (
              <CategoryGroup
                key={category}
                category={category}
                items={items}
                onAdd={handleAddNode}
                defaultOpen={category === 'global' || category === 'episode'}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
