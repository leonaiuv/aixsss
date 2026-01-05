import { useMemo, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Download, FileText, Copy, RefreshCw } from 'lucide-react';
import { NodeFrame } from './NodeFrame';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProjectStore } from '@/stores/projectStore';
import { useWorldViewStore } from '@/stores/worldViewStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useEpisodeStore } from '@/stores/episodeStore';
import { isApiMode } from '@/lib/runtime/mode';
import { apiListScenes } from '@/lib/api/scenes';
import type { Scene } from '@/types';

type ExportNodeData = { label?: string };

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ExportFlowNode = Node<ExportNodeData, 'export'>;

export function ExportNode({ data }: NodeProps<ExportFlowNode>) {
  const project = useProjectStore((s) => s.currentProject);
  const worldView = useWorldViewStore((s) => s.elements);
  const characters = useCharacterStore((s) => s.characters);
  const episodes = useEpisodeStore((s) => s.episodes);

  const [markdown, setMarkdown] = useState<string>('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canBuild = Boolean(project?.id);

  const episodeOrderById = useMemo(() => {
    const map = new Map<string, number>();
    for (const ep of episodes) map.set(ep.id, ep.order);
    return map;
  }, [episodes]);

  const buildMarkdown = async () => {
    if (!project?.id) return;
    setIsBuilding(true);
    setError(null);

    try {
      let scenes: Scene[] = [];
      if (isApiMode()) {
        scenes = (await apiListScenes(project.id)) as Scene[];
      }

      const groupedScenes = new Map<number, Scene[]>();
      for (const s of scenes) {
        const epOrder = s.episodeId ? (episodeOrderById.get(s.episodeId) ?? 1) : 1;
        const list = groupedScenes.get(epOrder) ?? [];
        list.push(s);
        groupedScenes.set(epOrder, list);
      }
      for (const list of groupedScenes.values()) list.sort((a, b) => a.order - b.order);

      let md = `# ${project.title || '未命名项目'}\n\n`;
      md += `## 故事梗概\n\n${project.summary || ''}\n\n`;
      if (project.protagonist?.trim()) md += `- 主角：${project.protagonist.trim()}\n\n`;
      if (project.artStyleConfig?.fullPrompt?.trim()) {
        md += `## 画风（Full Prompt）\n\n`;
        md += '```text\n' + project.artStyleConfig.fullPrompt.trim() + '\n```\n\n';
      }

      md += `## 世界观\n\n`;
      if (worldView.length === 0) {
        md += `（无）\n\n`;
      } else {
        for (const el of [...worldView].sort((a, b) => a.order - b.order)) {
          md += `### ${el.title}\n\n`;
          md += `- 类型：${el.type}\n`;
          md += `- 内容：${el.content}\n\n`;
        }
      }

      md += `## 角色\n\n`;
      if (characters.length === 0) {
        md += `（无）\n\n`;
      } else {
        for (const c of characters) {
          md += `### ${c.name}\n\n`;
          if (c.briefDescription?.trim()) md += `- 简述：${c.briefDescription.trim()}\n`;
          if (c.appearance?.trim()) md += `- 外观：${c.appearance.trim()}\n`;
          if (c.personality?.trim()) md += `- 性格：${c.personality.trim()}\n`;
          if (c.background?.trim()) md += `- 背景：${c.background.trim()}\n`;
          md += `\n`;
        }
      }

      md += `## 剧集与分镜\n\n`;
      if (!isApiMode()) {
        md += `（本导出节点当前以 API 模式数据为主；local 模式后续补齐）\n\n`;
      }

      if (episodes.length === 0) {
        md += `（无 Episode）\n\n`;
      } else {
        for (const ep of [...episodes].sort((a, b) => a.order - b.order)) {
          md += `### 第${ep.order}集${ep.title ? `：${ep.title}` : ''}\n\n`;
          if (ep.summary?.trim()) md += `- 概要：${ep.summary.trim()}\n`;
          md += `- 核心表达：${ep.coreExpression ? '✓' : '—'}\n\n`;
          if (ep.coreExpression) {
            md += `#### 核心表达（JSON）\n\n`;
            md += '```json\n' + safeJson(ep.coreExpression) + '\n```\n\n';
          }

          const sceneList = groupedScenes.get(ep.order) ?? [];
          if (sceneList.length === 0) {
            md += `#### 分镜\n\n（无）\n\n`;
          } else {
            md += `#### 分镜（${sceneList.length}）\n\n`;
            for (const s of sceneList) {
              md += `- Scene ${s.order}: ${s.summary || ''}\n`;
              if (s.sceneDescription?.trim()) md += `  - 描述：${s.sceneDescription.trim()}\n`;
              if (s.shotPrompt?.trim()) md += `  - Keyframe Prompt：${s.shotPrompt.trim()}\n`;
              if (s.motionPrompt?.trim()) md += `  - Motion Prompt：${s.motionPrompt.trim()}\n`;
              if (s.dialogues) md += `  - Dialogues：${safeJson(s.dialogues)}\n`;
            }
            md += `\n`;
          }
        }
      }

      setMarkdown(md);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBuilding(false);
    }
  };

  const copy = async () => {
    if (!markdown.trim()) return;
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore
    }
  };

  const download = () => {
    if (!markdown.trim()) return;
    const name = project?.title?.trim() ? project.title.trim() : 'aixsss-export';
    downloadText(`${name}.md`, markdown);
  };

  return (
    <NodeFrame
      title={
        <span className="inline-flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          {data.label ?? '导出'}
        </span>
      }
      description="将项目内容汇总为 Markdown，便于存档/交付/下游工具链。"
      headerRight={
        <Button size="sm" onClick={buildMarkdown} disabled={!canBuild || isBuilding}>
          <RefreshCw className="mr-1 h-4 w-4" />
          {isBuilding ? '生成中' : '生成'}
        </Button>
      }
      showSource={false}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={copy} disabled={!markdown.trim()}>
            <Copy className="mr-1 h-4 w-4" />
            复制
          </Button>
          <Button size="sm" variant="secondary" onClick={download} disabled={!markdown.trim()}>
            <Download className="mr-1 h-4 w-4" />
            下载
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <ScrollArea className="h-[260px] rounded-md border bg-background/60">
          <pre className="p-2 text-[11px] leading-snug">
            {markdown || '（点击“生成”后会在这里预览）'}
          </pre>
        </ScrollArea>
      </div>
    </NodeFrame>
  );
}
