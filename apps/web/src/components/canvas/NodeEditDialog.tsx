/**
 * 节点编辑弹窗组件
 * 点击节点时弹出，根据节点类型动态渲染不同的编辑表单
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
  Play,
  Clock,
  Zap,
} from 'lucide-react';
import { useCanvasStore, selectEditingNode } from '@/stores/canvasStore';
import type { AgentCanvasNodeTypeV2 } from '@/types/canvas';
import { NODE_STATE_LABELS, getNodeLibraryItem } from '@/types/canvas';

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
// 表单组件
// ==========================================

interface FormProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

/** 项目设定表单 */
function ProjectSettingsForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="项目设定"
        />
      </div>
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          项目设定节点读取当前项目的基础信息（标题、梗概、画风、主角）。
          请在项目设置中修改这些内容。
        </p>
      </div>
    </div>
  );
}

/** 世界观表单 */
function WorldViewForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="世界观"
        />
      </div>
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          世界观节点管理项目的世界观要素。请在项目的世界观设置中添加和编辑要素。
        </p>
      </div>
    </div>
  );
}

/** 角色库表单 */
function CharactersForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="角色库"
        />
      </div>
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          角色库节点管理项目的角色。请在项目的角色设置中添加和编辑角色。
        </p>
      </div>
    </div>
  );
}

/** 叙事因果链表单 */
function NarrativeCausalChainForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="叙事因果链"
        />
      </div>
      <div className="space-y-2">
        <Label>幕式结构</Label>
        <Select
          value={(data.actMode as string) ?? 'three_act'}
          onValueChange={(value) => onChange({ ...data, actMode: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择幕式结构" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="three_act">三幕式</SelectItem>
            <SelectItem value="five_act">五幕式</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          叙事因果链生成包括：核心冲突引擎、信息能见度层、节拍流。
          需要先完成项目设定、世界观和角色库。
        </p>
      </div>
    </div>
  );
}

/** 剧集规划表单 */
function EpisodePlanForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="剧集规划"
        />
      </div>
      <div className="space-y-2">
        <Label>目标集数</Label>
        <Input
          type="number"
          min={1}
          max={100}
          value={(data.targetEpisodeCount as number) ?? 1}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            const next = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 1;
            onChange({ ...data, targetEpisodeCount: next });
          }}
        />
        <p className="text-xs text-muted-foreground">建议 1-100 集</p>
      </div>
    </div>
  );
}

/** 单集表单 */
function EpisodeForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="单集"
        />
      </div>
      <div className="space-y-2">
        <Label>剧集 ID</Label>
        <Input
          value={(data.episodeId as string) ?? ''}
          onChange={(e) => onChange({ ...data, episodeId: e.target.value })}
          placeholder="选择或输入剧集 ID"
        />
        <p className="text-xs text-muted-foreground">运行后会自动关联到对应的剧集</p>
      </div>
    </div>
  );
}

/** 核心表达表单 */
function CoreExpressionForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="核心表达"
        />
      </div>
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm text-muted-foreground">
          核心表达包括：主题、情感曲线（起承转合）、视觉母题、核心冲突。 需要先选择对应的剧集。
        </p>
      </div>
    </div>
  );
}

/** 分镜列表表单 */
function SceneListForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="分镜列表"
        />
      </div>
      <div className="space-y-2">
        <Label>分镜条数提示</Label>
        <Input
          type="number"
          min={6}
          max={24}
          value={(data.sceneCountHint as number) ?? 12}
          onChange={(e) => onChange({ ...data, sceneCountHint: parseInt(e.target.value) || 12 })}
        />
        <p className="text-xs text-muted-foreground">建议 6-24 条</p>
      </div>
    </div>
  );
}

/** LLM 节点表单 */
function LlmForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="LLM 节点"
        />
      </div>
      <div className="space-y-2">
        <Label>系统提示词</Label>
        <Textarea
          value={(data.systemPrompt as string) ?? ''}
          onChange={(e) => onChange({ ...data, systemPrompt: e.target.value })}
          placeholder="设置 AI 的角色和任务..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>用户提示词</Label>
        <Textarea
          value={(data.userPrompt as string) ?? ''}
          onChange={(e) => onChange({ ...data, userPrompt: e.target.value })}
          placeholder="输入要处理的内容..."
          rows={4}
        />
      </div>
      {Boolean(data.result) && (
        <div className="space-y-2">
          <Label>执行结果</Label>
          <div className="max-h-32 overflow-auto rounded-lg border bg-muted/50 p-2">
            <pre className="whitespace-pre-wrap text-xs">{String(data.result)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** 导出表单 */
function ExportForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="导出"
        />
      </div>
      <div className="space-y-2">
        <Label>导出格式</Label>
        <Select
          value={(data.format as string) ?? 'markdown'}
          onValueChange={(value) => onChange({ ...data, format: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择导出格式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** 通用表单（用于其他节点类型） */
function GenericForm({ data, onChange }: FormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>节点标签</Label>
        <Input
          value={(data.label as string) ?? ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
          placeholder="节点标签"
        />
      </div>
    </div>
  );
}

// ==========================================
// 表单映射
// ==========================================

const FORM_COMPONENTS: Partial<Record<AgentCanvasNodeTypeV2, React.ComponentType<FormProps>>> = {
  project_settings: ProjectSettingsForm,
  world_view: WorldViewForm,
  characters: CharactersForm,
  narrative_causal_chain: NarrativeCausalChainForm,
  episode_plan: EpisodePlanForm,
  episode: EpisodeForm,
  core_expression: CoreExpressionForm,
  scene_list: SceneListForm,
  llm: LlmForm,
  export: ExportForm,
};

// ==========================================
// NodeEditDialog 组件
// ==========================================

export function NodeEditDialog() {
  const isDialogOpen = useCanvasStore((s) => s.isDialogOpen);
  const editingNode = useCanvasStore(selectEditingNode);
  const closeNodeDialog = useCanvasStore((s) => s.closeNodeDialog);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const deleteNode = useCanvasStore((s) => s.deleteNode);

  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // 同步编辑节点数据
  useEffect(() => {
    if (editingNode) {
      setLocalData(editingNode.data as Record<string, unknown>);
      setHasChanges(false);
    }
  }, [editingNode]);

  const handleDataChange = useCallback((newData: Record<string, unknown>) => {
    setLocalData(newData);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!editingNode || !hasChanges) {
      closeNodeDialog();
      return;
    }

    pushHistory(`编辑节点: ${(localData.label as string) ?? editingNode.type}`);
    updateNodeData(editingNode.id, localData);
    setHasChanges(false);
    closeNodeDialog();
  }, [editingNode, localData, hasChanges, pushHistory, updateNodeData, closeNodeDialog]);

  const handleCancel = useCallback(() => {
    setHasChanges(false);
    closeNodeDialog();
  }, [closeNodeDialog]);

  const handleDelete = useCallback(() => {
    if (!editingNode) return;
    closeNodeDialog();
    deleteNode(editingNode.id);
  }, [editingNode, closeNodeDialog, deleteNode]);

  const handleRun = useCallback(() => {
    // TODO: 实现节点执行逻辑
    console.log('Run node:', editingNode?.id);
  }, [editingNode]);

  if (!editingNode) return null;

  const Icon = NODE_ICONS[editingNode.type] ?? Bot;
  const libraryItem = getNodeLibraryItem(editingNode.type);
  const FormComponent = FORM_COMPONENTS[editingNode.type] ?? GenericForm;

  return (
    <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-h-[85vh] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span>{libraryItem?.label ?? editingNode.type}</span>
            <Badge variant="outline" className="ml-2">
              {NODE_STATE_LABELS[editingNode.state]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <FormComponent data={localData} onChange={handleDataChange} />
        </ScrollArea>

        {/* 执行信息 */}
        {(editingNode.lastRunAt || editingNode.lastRunDuration) && (
          <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {editingNode.lastRunAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(editingNode.lastRunAt).toLocaleString()}
              </span>
            )}
            {editingNode.lastRunDuration && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {(editingNode.lastRunDuration / 1000).toFixed(1)}s
              </span>
            )}
            {editingNode.metadata?.tokenUsage && (
              <span>Token: {editingNode.metadata.tokenUsage.toLocaleString()}</span>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            删除
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            保存
          </Button>
          <Button variant="secondary" onClick={handleRun}>
            <Play className="mr-1 h-4 w-4" />
            运行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
