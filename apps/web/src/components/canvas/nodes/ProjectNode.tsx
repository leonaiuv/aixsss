import { useEffect, useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { BookOpen, Copy, Save } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/stores/projectStore';

type ProjectNodeData = {
  label?: string;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export type ProjectFlowNode = Node<ProjectNodeData, 'project'>;

export function ProjectNode({ data }: NodeProps<ProjectFlowNode>) {
  const project = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);

  const styleFullPrompt = useMemo(() => {
    return project?.artStyleConfig?.fullPrompt ?? '';
  }, [project?.artStyleConfig?.fullPrompt]);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [protagonist, setProtagonist] = useState('');

  useEffect(() => {
    setTitle(project?.title ?? '');
    setSummary(project?.summary ?? '');
    setProtagonist(project?.protagonist ?? '');
  }, [project?.id, project?.title, project?.summary, project?.protagonist]);

  const canSave = Boolean(project?.id);

  const save = () => {
    if (!project?.id) return;
    updateProject(project.id, {
      title: safeString(title),
      summary: safeString(summary),
      protagonist: safeString(protagonist),
    });
  };

  const copyStyle = async () => {
    const text = styleFullPrompt.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          {data.label ?? '全局设定'}
        </span>
      }
      description="项目标题/梗概/主角，以及画风（用于后续所有节点的上下文）。"
      headerRight={
        <Button size="sm" variant="secondary" onClick={save} disabled={!canSave}>
          <Save className="mr-1 h-4 w-4" />
          保存
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">标题</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="作品标题" />
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">故事梗概</div>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="尽量 ≥ 100 字，AI 质量会明显提升"
            className="min-h-[110px] resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">主角（可选）</div>
          <Input
            value={protagonist}
            onChange={(e) => setProtagonist(e.target.value)}
            placeholder="主角名字/一句话标签"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">画风 Full Prompt（只读）</div>
            <Button size="sm" variant="ghost" onClick={copyStyle} disabled={!styleFullPrompt.trim()}>
              <Copy className="mr-1 h-4 w-4" />
              复制
            </Button>
          </div>
          <Textarea
            value={styleFullPrompt}
            readOnly
            className="min-h-[84px] resize-none text-xs"
            placeholder="在「AI 设置/画风」里配置后，这里会展示 fullPrompt"
          />
        </div>
      </div>
    </NodeFrame>
  );
}
