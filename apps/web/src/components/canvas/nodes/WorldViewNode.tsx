import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectStore } from '@/stores/projectStore';
import { useWorldViewStore } from '@/stores/worldViewStore';

type WorldViewNodeData = {
  label?: string;
};

const WORLD_VIEW_TYPES = [
  { value: 'era', label: '时代背景' },
  { value: 'geography', label: '地理设定' },
  { value: 'society', label: '社会制度' },
  { value: 'technology', label: '科技水平' },
  { value: 'magic', label: '魔法体系' },
  { value: 'custom', label: '其他' },
] as const;

type WorldViewType = (typeof WORLD_VIEW_TYPES)[number]['value'];

function isWorldViewType(value: string): value is WorldViewType {
  return WORLD_VIEW_TYPES.some((t) => t.value === value);
}

export type WorldViewFlowNode = Node<WorldViewNodeData, 'world_view'>;

export function WorldViewNode({ data }: NodeProps<WorldViewFlowNode>) {
  const projectId = useProjectStore((s) => s.currentProject?.id ?? null);

  const elements = useWorldViewStore((s) => s.elements);
  const isLoading = useWorldViewStore((s) => s.isLoading);
  const loadElements = useWorldViewStore((s) => s.loadElements);
  const addElement = useWorldViewStore((s) => s.addElement);
  const deleteElement = useWorldViewStore((s) => s.deleteElement);

  useEffect(() => {
    if (!projectId) return;
    loadElements(projectId);
  }, [projectId, loadElements]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<WorldViewType>('era');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const canCreate = Boolean(projectId && title.trim());

  const resetForm = () => {
    setType('era');
    setTitle('');
    setContent('');
  };

  const create = () => {
    if (!projectId) return;
    if (!title.trim()) return;
    const order = elements.length + 1;
    addElement(projectId, {
      projectId,
      type,
      title: title.trim(),
      content: content.trim(),
      order,
    });
    setDialogOpen(false);
    resetForm();
  };

  const groupedCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const el of elements) map.set(el.type, (map.get(el.type) ?? 0) + 1);
    return WORLD_VIEW_TYPES.map((t) => ({ ...t, count: map.get(t.value) ?? 0 })).filter(
      (t) => t.count > 0,
    );
  }, [elements]);

  return (
    <>
      <NodeFrame
        title={
          <span className="inline-flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {data.label ?? '世界观'}
          </span>
        }
        description="结构化世界观要素：将被注入到后续规划/分镜生成。"
        headerRight={
          <Button size="sm" variant="secondary" onClick={() => setDialogOpen(true)} disabled={!projectId}>
            <Plus className="mr-1 h-4 w-4" />
            新增
          </Button>
        }
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>共 {elements.length} 条</span>
            {isLoading ? <span>加载中...</span> : null}
          </div>

          {groupedCount.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {groupedCount.map((t) => (
                <Badge key={t.value} variant="secondary" className="text-[11px]">
                  {t.label} · {t.count}
                </Badge>
              ))}
            </div>
          ) : null}

          <ScrollArea className="h-[180px] rounded-md border bg-background/60">
            <div className="p-2">
              {elements.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">
                  暂无世界观要素。建议先补齐 3-5 条关键规则/地理/社会设定。
                </div>
              ) : (
                <div className="space-y-2">
                  {elements.slice(0, 20).map((el) => (
                    <div key={el.id} className="rounded-md border bg-background p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium">{el.title}</div>
                          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {el.content}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => projectId && deleteElement(projectId, el.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {elements.length > 20 ? (
                    <div className="px-2 pb-1 text-[11px] text-muted-foreground">
                      仅展示前 20 条（请在后续版本加入筛选/分页）。
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </NodeFrame>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新增世界观要素</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">类型</div>
              <Select
                value={type}
                onValueChange={(value) => {
                  if (isWorldViewType(value)) setType(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {WORLD_VIEW_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">标题</div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：霓虹城邦的阶层制度" />
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">内容</div>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="写清楚规则/限制/代价，方便 AI 保持一致性"
                className="min-h-[120px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={create} disabled={!canCreate}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
