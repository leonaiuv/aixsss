// ==========================================
// 分镜详情弹窗 - 专业级编辑器
// ==========================================
// 采用三栏布局：
// - 左侧：场景锚点 + 关键帧提示词 + 运动提示词
// - 中间：分镜脚本编辑器（地点/角色/镜头等）
// - 右侧：台词/备注 + 差量对比
// ==========================================

import { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  GeneratedImageKeyframe,
  Scene,
  SceneStatus,
  WorldViewElement,
} from '@/types';
import type {
  LocaleText,
  ParsedKeyframePrompts,
  ParsedMotionPromptText,
} from '@/lib/ai/promptParsers';
import { GENERATED_IMAGE_KEYFRAMES, StoryboardGroupsJsonSchema } from '@aixsss/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PanelScriptEditor } from './PanelScriptEditor';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Quote,
  Sparkles,
  Trash2,
  User,
  Video,
  X,
  Layers,
  FileText,
  Move3D,
  Eye,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// 台词行类型
interface DialogueLine {
  id: string;
  characterName?: string;
  content: string;
  type: 'dialogue' | 'monologue' | 'narration' | 'thought';
  emotion?: string;
  notes?: string;
  order: number;
}

// 差量项
interface DeltaItem {
  label: string;
  before: string;
  after: string;
}

interface SceneDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  prevScene: Scene | null;
  characters: Character[];
  worldViewElements: WorldViewElement[];
  isRefining: boolean;
  isGeneratingImages: boolean;
  isStoryboardRunning: boolean;
  storyboardProgress?: { message?: string | null; pct?: number | null };
  refineProgress?: { message?: string | null; pct?: number | null };
  isBatchBlocked: boolean;
  aiProfileId?: string | null;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onRefineScene: (sceneId: string) => void;
  onGenerateImages: (sceneId: string) => void;
  onGenerateStoryboardSceneBible: (sceneId: string) => void;
  onGenerateStoryboardPlan: (sceneId: string, cameraMode?: 'A' | 'B') => void;
  onGenerateStoryboardGroup: (sceneId: string, groupId: string, cameraMode?: 'A' | 'B') => void;
  onTranslateStoryboardPanels: (sceneId: string) => void;
  onBackTranslateStoryboardPanels: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onCopyImg2ImgPack: () => Promise<void>;
  parsedKeyframes: ParsedKeyframePrompts;
  parsedMotion: ParsedMotionPromptText;
  onCopyKeyframe: (kfKey: string, lang: 'zh' | 'en') => Promise<void>;
  onCopyKeyframeAvoid: (lang: 'zh' | 'en') => Promise<void>;
  onCopyMotion: (
    key: 'motionShort' | 'motionBeats' | 'constraints',
    lang: 'zh' | 'en',
  ) => Promise<void>;
  onCopySceneAnchor: (lang: 'zh' | 'en') => Promise<void>;
  onCopyDialogues: (dialogues: DialogueLine[]) => Promise<void>;
  sceneAnchorCopyText: { zh: string; en: string };
  getSceneStatusLabel: (status: SceneStatus) => string;
}

// 可折叠区块组件
function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
  actions,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-medium">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {isOpen && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

// 复制按钮组
function CopyButtonGroup({
  hasZh,
  hasEn,
  onCopyZh,
  onCopyEn,
  size = 'sm',
}: {
  hasZh: boolean;
  hasEn: boolean;
  onCopyZh: () => void;
  onCopyEn: () => void;
  size?: 'sm' | 'xs';
}) {
  const btnClass = size === 'xs' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-xs';

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className={cn(btnClass, 'gap-1.5')}
        disabled={!hasZh}
        onClick={onCopyZh}
      >
        <Copy className="h-3 w-3" />
        ZH
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn(btnClass, 'gap-1.5')}
        disabled={!hasEn}
        onClick={onCopyEn}
      >
        <Copy className="h-3 w-3" />
        EN
      </Button>
    </div>
  );
}

// 关键帧卡片
function KeyframeCard({
  label,
  kfKey,
  index,
  keyframe,
  onCopy,
}: {
  label: string;
  kfKey: string;
  index: number;
  keyframe: LocaleText;
  onCopy: (kfKey: string, lang: 'zh' | 'en') => void;
}) {
  const hasZh = Boolean(keyframe.zh);
  const hasEn = Boolean(keyframe.en);
  const previewText = keyframe.zh || keyframe.en || '（未解析到）';

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary">
            {index}
          </div>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <CopyButtonGroup
          hasZh={hasZh}
          hasEn={hasEn}
          onCopyZh={() => onCopy(kfKey, 'zh')}
          onCopyEn={() => onCopy(kfKey, 'en')}
          size="xs"
        />
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
        {previewText.slice(0, 120)}
        {previewText.length > 120 && '...'}
      </p>
    </div>
  );
}

// 运动提示词卡片
function MotionCard({
  label,
  dataKey,
  data,
  icon,
  onCopy,
}: {
  label: string;
  dataKey: 'motionShort' | 'motionBeats' | 'constraints';
  data: { zh?: string; en?: string };
  icon: React.ReactNode;
  onCopy: (key: 'motionShort' | 'motionBeats' | 'constraints', lang: 'zh' | 'en') => void;
}) {
  const hasZh = Boolean(data.zh);
  const hasEn = Boolean(data.en);
  const previewText = data.zh || data.en || '（未解析到）';

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <CopyButtonGroup
          hasZh={hasZh}
          hasEn={hasEn}
          onCopyZh={() => onCopy(dataKey, 'zh')}
          onCopyEn={() => onCopy(dataKey, 'en')}
          size="xs"
        />
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {previewText.slice(0, 80)}
        {previewText.length > 80 && '...'}
      </p>
    </div>
  );
}

// 台词卡片
function DialogueCard({ line }: { line: DialogueLine }) {
  const typeConfig: Record<
    string,
    { icon: React.ReactNode; bg: string; border: string; label: string; iconColor: string }
  > = {
    dialogue: {
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
      label: '对白',
      iconColor: 'text-blue-500',
    },
    monologue: {
      icon: <Quote className="h-3.5 w-3.5" />,
      bg: 'bg-purple-500/5',
      border: 'border-purple-500/20',
      label: '独白',
      iconColor: 'text-purple-500',
    },
    narration: {
      icon: <Mic className="h-3.5 w-3.5" />,
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      label: '旁白',
      iconColor: 'text-amber-500',
    },
    thought: {
      icon: <Brain className="h-3.5 w-3.5" />,
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/20',
      label: '心理',
      iconColor: 'text-emerald-500',
    },
  };
  const config = typeConfig[line.type] || typeConfig.dialogue;

  return (
    <div className={cn('rounded-lg border p-3', config.border, config.bg)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('flex items-center gap-1.5', config.iconColor)}>
          {config.icon}
          <span className="text-xs font-medium uppercase tracking-wide">{config.label}</span>
        </div>
        {line.characterName && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium">{line.characterName}</span>
            </div>
          </>
        )}
        {line.emotion && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
              {line.emotion}
            </Badge>
          </>
        )}
      </div>
      <div className="pl-5">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {line.type === 'narration' ? (
            <span className="italic text-muted-foreground">{line.content}</span>
          ) : (
            <>
              <span className="text-muted-foreground/70">"</span>
              {line.content}
              <span className="text-muted-foreground/70">"</span>
            </>
          )}
        </p>
      </div>
      {line.notes && (
        <div className="mt-2 pl-5 text-xs text-muted-foreground border-l-2 border-muted ml-0.5">
          <span className="ml-2">备注：{line.notes}</span>
        </div>
      )}
    </div>
  );
}

// 差量对比面板
function DeltaComparisonPanel({
  prevScene,
  deltaItems,
}: {
  prevScene: Scene | null;
  deltaItems: DeltaItem[];
}) {
  if (!prevScene) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Eye className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">这是第 1 格，没有上一格可对比</p>
      </div>
    );
  }

  if (deltaItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Check className="h-6 w-6 mx-auto text-emerald-500/60 mb-2" />
        <p className="text-xs text-muted-foreground">未检测到差量变化</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>对比上一格</span>
        <Badge variant="secondary" className="h-5">
          #{prevScene.order}
        </Badge>
      </div>
      <div className="space-y-2">
        {deltaItems.map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="text-xs font-medium text-primary">{item.label}</div>
            <div className="grid gap-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-red-600">
                  前
                </span>
                <span className="text-muted-foreground whitespace-pre-wrap line-clamp-2">
                  {item.before || '（空）'}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600">
                  后
                </span>
                <span className="text-muted-foreground whitespace-pre-wrap line-clamp-2">
                  {item.after || '（空）'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SceneDetailModal({
  open,
  onOpenChange,
  scene,
  prevScene,
  characters,
  worldViewElements,
  isRefining,
  isGeneratingImages,
  isStoryboardRunning,
  storyboardProgress,
  refineProgress,
  isBatchBlocked,
  aiProfileId,
  onUpdateScene,
  onRefineScene,
  onGenerateImages,
  onGenerateStoryboardSceneBible,
  onGenerateStoryboardPlan,
  onGenerateStoryboardGroup,
  onTranslateStoryboardPanels,
  onBackTranslateStoryboardPanels,
  onDeleteScene,
  onCopyImg2ImgPack,
  parsedKeyframes,
  parsedMotion,
  onCopyKeyframe,
  onCopyKeyframeAvoid,
  onCopyMotion,
  onCopySceneAnchor,
  onCopyDialogues,
  sceneAnchorCopyText,
  getSceneStatusLabel,
}: SceneDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'prompts' | 'script' | 'dialogue'>('prompts');
  const { toast } = useToast();
  const sceneId = scene?.id;

  const storyboardGroups = useMemo(() => {
    if (!scene) return null;
    const parsed = StoryboardGroupsJsonSchema.safeParse(scene.storyboardGroupsJson ?? null);
    return parsed.success ? parsed.data : null;
  }, [scene]);

  const storyboardGroupsSorted = useMemo(() => {
    if (!storyboardGroups) return [];
    const byId = new Map(storyboardGroups.groups.map((g) => [g.group_id, g] as const));
    return GENERATED_IMAGE_KEYFRAMES.map((id) => byId.get(id)).filter(
      Boolean,
    ) as typeof storyboardGroups.groups;
  }, [storyboardGroups]);

  const storyboardDefaultCameraMode: 'A' | 'B' =
    storyboardGroups?.settings?.camera_mode === 'A' ? 'A' : 'B';
  const [storyboardCameraMode, setStoryboardCameraMode] = useState<'A' | 'B'>(
    storyboardDefaultCameraMode,
  );
  useEffect(() => {
    if (!sceneId) return;
    setStoryboardCameraMode(storyboardDefaultCameraMode);
  }, [sceneId, storyboardDefaultCameraMode]);

  const storyboardHasZh = useMemo(() => {
    if (!storyboardGroups) return false;
    for (const g of storyboardGroups.groups) {
      const panels = g.group?.panels ?? [];
      for (const p of panels) {
        if (typeof p.zh === 'string' && p.zh.trim()) return true;
      }
    }
    return false;
  }, [storyboardGroups]);

  const [storyboardViewLang, setStoryboardViewLang] = useState<'zh' | 'en'>(
    storyboardHasZh ? 'zh' : 'en',
  );
  useEffect(() => {
    if (!sceneId) return;
    setStoryboardViewLang(storyboardHasZh ? 'zh' : 'en');
  }, [sceneId, storyboardHasZh]);

  const [expandedStoryboardGroupId, setExpandedStoryboardGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!sceneId) return;
    setExpandedStoryboardGroupId(null);
  }, [sceneId]);

  const allStoryboardGroupsReady = useMemo(() => {
    if (!storyboardGroups || storyboardGroupsSorted.length !== GENERATED_IMAGE_KEYFRAMES.length)
      return false;
    return storyboardGroupsSorted.every((g) => g.status === 'ready' && Boolean(g.group));
  }, [storyboardGroups, storyboardGroupsSorted]);

  const storyboardDirtyCount = useMemo(() => {
    if (!storyboardGroups) return 0;
    let count = 0;
    for (const g of storyboardGroups.groups) {
      for (const p of g.group?.panels ?? []) {
        if (p.dirtyZh === true) count += 1;
      }
    }
    return count;
  }, [storyboardGroups]);

  const canGenerateStoryboardGroup = useMemo(() => {
    const byId = new Map(storyboardGroupsSorted.map((g) => [g.group_id, g] as const));
    return (groupId: string): boolean => {
      if (!scene?.storyboardSceneBibleJson || !scene?.storyboardPlanJson) return false;
      if (!storyboardGroups) return false;
      const idx = GENERATED_IMAGE_KEYFRAMES.indexOf(
        groupId as (typeof GENERATED_IMAGE_KEYFRAMES)[number],
      );
      if (idx < 0) return false;
      if (idx === 0) return true;
      const prevId = GENERATED_IMAGE_KEYFRAMES[idx - 1];
      const prev = byId.get(prevId);
      return Boolean(prev && prev.status === 'ready' && prev.group);
    };
  }, [
    scene?.storyboardSceneBibleJson,
    scene?.storyboardPlanJson,
    storyboardGroups,
    storyboardGroupsSorted,
  ]);

  const updateStoryboardPanelZh = (groupId: string, panelIndex: number, zh: string) => {
    if (!scene || !storyboardGroups) return;
    const next = {
      ...storyboardGroups,
      groups: storyboardGroups.groups.map((g) => {
        if (g.group_id !== groupId || !g.group) return g;
        return {
          ...g,
          group: {
            ...g.group,
            panels: (g.group.panels ?? []).map((p) =>
              p.index === panelIndex ? { ...p, zh, dirtyZh: true } : p,
            ),
          },
        };
      }),
    };
    onUpdateScene(scene.id, { storyboardGroupsJson: next });
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: '已复制', description: label });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      toast({ title: '复制失败', description: detail, variant: 'destructive' });
    }
  };

  const buildStoryboardRenderJsonExport = () => {
    if (!scene || !storyboardGroups) return '';
    const items = storyboardGroupsSorted
      .map((g) => ({
        group_id: g.group_id,
        shot_range: g.shot_range,
        render_json: g.group?.render?.render_json ?? null,
      }))
      .filter((x) => x.render_json !== null);
    return JSON.stringify({ sceneId: scene.id, items }, null, 2);
  };

  const buildStoryboardShotListExport = () => {
    if (!scene || !storyboardGroups) return '';
    const shots: Array<{
      shot: number;
      group_id: string;
      panel_index: number;
      en: string;
      zh: string | null;
    }> = [];

    for (let gIdx = 0; gIdx < storyboardGroupsSorted.length; gIdx += 1) {
      const g = storyboardGroupsSorted[gIdx];
      const panels = (g.group?.panels ?? []).slice().sort((a, b) => a.index - b.index);
      for (const p of panels) {
        const shot = gIdx * 9 + p.index;
        shots.push({
          shot,
          group_id: g.group_id,
          panel_index: p.index,
          en: p.en ?? '',
          zh: typeof p.zh === 'string' ? p.zh : null,
        });
      }
    }

    return JSON.stringify({ sceneId: scene.id, shots }, null, 2);
  };

  // 计算差量
  const deltaItems = useMemo<DeltaItem[]>(() => {
    if (!scene || !prevScene) return [];
    const items: DeltaItem[] = [];

    const compareField = (label: string, current?: string, prev?: string) => {
      const c = current?.trim() ?? '';
      const p = prev?.trim() ?? '';
      if (c !== p) {
        items.push({ label, before: p, after: c });
      }
    };

    compareField('场景锚点', scene.sceneDescription, prevScene.sceneDescription);
    compareField('关键帧提示词', scene.shotPrompt, prevScene.shotPrompt);
    compareField('运动提示词', scene.motionPrompt, prevScene.motionPrompt);

    return items;
  }, [scene, prevScene]);

  // 解析台词数据 - 支持结构化数组和纯文本格式
  const dialogues = useMemo<DialogueLine[]>(() => {
    if (!scene) return [];

    const rawDialogues: unknown = scene.dialogues;

    if (!rawDialogues) return [];

    // 如果是结构化 DialogueLine[] 格式
    if (Array.isArray(rawDialogues) && rawDialogues.length > 0) {
      const first = rawDialogues[0];
      // 检查是否是对象格式（有 id 和 content 字段）
      if (typeof first === 'object' && first !== null && 'content' in first) {
        // 特殊处理：如果只有一条记录，且 content 包含多条台词格式，需要进一步解析
        const items = rawDialogues as DialogueLine[];

        // 检查是否有记录的 content 包含 `- [` 格式的多条台词
        const needsFurtherParsing = items.some(
          (item) => item.content && item.content.includes('- [') && item.content.includes('\n'),
        );

        if (needsFurtherParsing) {
          // 将所有 content 合并解析
          const allContent = items.map((item) => item.content).join('\n');
          return parseDialogueText(allContent);
        }

        return items.slice().sort((a, b) => a.order - b.order);
      }
      // 如果是字符串数组，拼接后解析
      if (typeof first === 'string') {
        const combinedText = (rawDialogues as string[]).join('\n');
        return parseDialogueText(combinedText);
      }
    }

    // 如果是单个字符串格式，尝试解析
    if (typeof rawDialogues === 'string' && rawDialogues.trim()) {
      return parseDialogueText(rawDialogues);
    }

    // 如果是包含 raw 文本的对象（某些 JSON 存储格式）
    if (typeof rawDialogues === 'object' && rawDialogues !== null && !Array.isArray(rawDialogues)) {
      // 尝试将对象转为 JSON 字符串后解析
      const jsonStr = JSON.stringify(rawDialogues);
      if (jsonStr && jsonStr !== '{}') {
        return parseDialogueText(jsonStr);
      }
    }

    return [];
  }, [scene]);

  const generatedImageMap = useMemo(() => {
    const map = new Map<GeneratedImageKeyframe, NonNullable<Scene['generatedImages']>[number]>();
    if (!scene?.generatedImages) return map;
    for (const image of scene.generatedImages) {
      if (image?.keyframe && image?.url) {
        map.set(image.keyframe, image);
      }
    }
    return map;
  }, [scene?.generatedImages]);

  // 解析纯文本台词格式
  // 格式: - [类型|情绪] 角色: 内容
  // 可能用换行符或空格 + - 分隔
  function parseDialogueText(text: string): DialogueLine[] {
    // 首先尝试按换行符分隔
    let lines = text.split('\n').filter((line) => line.trim());

    // 如果只有一行但包含多个 "[类型|情绪]" 模式，则需要分隔
    // 检测包含多个 "- [" 或 "[" 开头的台词
    if (lines.length === 1) {
      const dialoguePattern = /(?:^|\s)-\s*\[/g;
      const matches = text.match(dialoguePattern);
      if (matches && matches.length >= 1) {
        // 使用更健壮的分隔方式：在每个 " - [" 前分隔
        // 先将 " - [" 替换为特殊分隔符，然后分隔
        const separator = '\u0000SPLIT\u0000';
        const splitText = text.replace(/\s+-\s*\[/g, () => separator + '- [');
        lines = splitText
          .split(separator)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    const result: DialogueLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // 匹配格式: - [类型|情绪] 角色: 内容
      const match = line.match(/^-?\s*\[([^\]|]+)\|([^\]]+)\]\s*([^:：]+)[：:]\s*(.+)$/);

      if (match) {
        const typeMap: Record<string, DialogueLine['type']> = {
          对白: 'dialogue',
          独白: 'monologue',
          旁白: 'narration',
          心理: 'thought',
        };

        result.push({
          id: `parsed-${i}`,
          type: typeMap[match[1]] || 'dialogue',
          emotion: match[2],
          characterName: match[3].trim(),
          content: match[4].trim(),
          order: i,
        });
      } else if (line.length > 0) {
        // 无法解析的行作为旁白处理
        result.push({
          id: `parsed-${i}`,
          type: 'narration',
          content: line.replace(/^-\s*/, ''),
          order: i,
        });
      }
    }

    return result;
  }

  if (!scene) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1800px] h-[94vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* 顶部标题栏 */}
        <div className="shrink-0 border-b bg-gradient-to-r from-muted/50 to-transparent px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
                  {scene.order}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getSceneStatusLabel(scene.status)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">分镜 #{scene.order}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1 max-w-[400px] mt-0.5">
                    {scene.summary || '（无概要）'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => void onCopyImg2ImgPack()}
                disabled={isBatchBlocked}
                className="gap-2 h-9"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">复制生图包</span>
              </Button>
              <Button
                onClick={() => onRefineScene(scene.id)}
                disabled={!aiProfileId || isRefining || isBatchBlocked}
                className="gap-2 h-9 bg-primary hover:bg-primary/90"
              >
                {isRefining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>一键细化</span>
              </Button>
            </div>
          </div>

          {/* 细化进度条 */}
          {isRefining && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{refineProgress?.message || '正在细化...'}</span>
                {typeof refineProgress?.pct === 'number' && (
                  <span>{Math.round(refineProgress.pct)}%</span>
                )}
              </div>
              <Progress
                value={typeof refineProgress?.pct === 'number' ? refineProgress.pct : 0}
                className="h-1.5"
              />
            </div>
          )}
        </div>

        {/* 主内容区 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左侧导航标签 */}
          <div className="w-14 shrink-0 border-r bg-muted/30 flex flex-col items-center py-4 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('prompts')}
              className={cn(
                'flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all',
                activeTab === 'prompts'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title="提示词"
            >
              <Palette className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('script')}
              className={cn(
                'flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all',
                activeTab === 'script'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title="分镜脚本"
            >
              <FileText className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dialogue')}
              className={cn(
                'flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all',
                activeTab === 'dialogue'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title="台词"
            >
              <MessageSquare className="h-5 w-5" />
            </button>
          </div>

          {/* 内容面板 */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* 提示词面板 */}
            {activeTab === 'prompts' && (
              <div className="h-full flex">
                {/* 主编辑区 */}
                <ScrollArea className="flex-1 min-w-0">
                  <div className="p-6 space-y-6">
                    {/* 场景锚点 */}
                    <CollapsibleSection
                      title="场景锚点"
                      icon={<MapPin className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Scene Anchor
                        </Badge>
                      }
                      actions={
                        <CopyButtonGroup
                          hasZh={Boolean(sceneAnchorCopyText.zh)}
                          hasEn={Boolean(sceneAnchorCopyText.en)}
                          onCopyZh={() => void onCopySceneAnchor('zh')}
                          onCopyEn={() => void onCopySceneAnchor('en')}
                        />
                      }
                    >
                      <Textarea
                        value={scene.sceneDescription}
                        onChange={(e) =>
                          onUpdateScene(scene.id, { sceneDescription: e.target.value })
                        }
                        className="min-h-[140px] font-mono text-sm leading-relaxed resize-none"
                        placeholder="描述场景的视觉锚点，如：俯视角下，废弃的工厂区，锈迹斑斑的管道纵横交错..."
                      />
                    </CollapsibleSection>

                    {/* 分镜组（81镜头） */}
                    <CollapsibleSection
                      title="分镜组（81镜头）"
                      icon={<Layers className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Storyboard 9×9
                        </Badge>
                      }
                    >
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={scene.storyboardSceneBibleJson ? 'default' : 'secondary'}
                              className="text-xs gap-1.5"
                            >
                              {scene.storyboardSceneBibleJson ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              SceneBible
                            </Badge>
                            <Badge
                              variant={scene.storyboardPlanJson ? 'default' : 'secondary'}
                              className="text-xs gap-1.5"
                            >
                              {scene.storyboardPlanJson ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              Plan
                            </Badge>
                            <Badge
                              variant={allStoryboardGroupsReady ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              Groups{' '}
                              {(storyboardGroups?.groups ?? []).filter(
                                (g) => g.status === 'ready' && Boolean(g.group),
                              ).length ?? 0}
                              /9
                            </Badge>
                            {storyboardDirtyCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                dirty {storyboardDirtyCount}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1 rounded-md border bg-muted/20 p-1">
                              <Button
                                type="button"
                                variant={storyboardCameraMode === 'B' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setStoryboardCameraMode('B')}
                              >
                                B
                              </Button>
                              <Button
                                type="button"
                                variant={storyboardCameraMode === 'A' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setStoryboardCameraMode('A')}
                              >
                                A
                              </Button>
                            </div>
                            <div className="flex items-center gap-1 rounded-md border bg-muted/20 p-1">
                              <Button
                                type="button"
                                variant={storyboardViewLang === 'zh' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setStoryboardViewLang('zh')}
                                disabled={!storyboardHasZh && storyboardViewLang !== 'zh'}
                                aria-label="分镜组视图：中文"
                              >
                                ZH
                              </Button>
                              <Button
                                type="button"
                                variant={storyboardViewLang === 'en' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setStoryboardViewLang('en')}
                                aria-label="分镜组视图：英文"
                              >
                                EN
                              </Button>
                            </div>
                          </div>
                        </div>

                        {isStoryboardRunning && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{storyboardProgress?.message || '正在生成分镜组...'}</span>
                              {typeof storyboardProgress?.pct === 'number' && (
                                <span>{Math.round(storyboardProgress.pct)}%</span>
                              )}
                            </div>
                            <Progress
                              value={
                                typeof storyboardProgress?.pct === 'number'
                                  ? storyboardProgress.pct
                                  : 0
                              }
                              className="h-1.5"
                            />
                          </div>
                        )}

                        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                              流程：SceneBible → Plan → KF0..KF8（逐组）→ 翻译 →（编辑中文）→ 回译
                            </span>
                            <span className="text-[11px]">
                              生图只使用英文 render.prompt_en；中文仅用于阅读/编辑
                            </span>
                          </div>
                          {storyboardGroups?.running_summary && (
                            <div className="mt-2 whitespace-pre-wrap">
                              <span className="font-medium text-foreground">running_summary：</span>
                              {storyboardGroups.running_summary}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={!aiProfileId || isStoryboardRunning || isBatchBlocked}
                            onClick={() => onGenerateStoryboardSceneBible(scene.id)}
                          >
                            <Sparkles className="h-4 w-4" />
                            生成 SceneBible
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={
                              !aiProfileId ||
                              isStoryboardRunning ||
                              isBatchBlocked ||
                              !scene.storyboardSceneBibleJson
                            }
                            onClick={() => onGenerateStoryboardPlan(scene.id, storyboardCameraMode)}
                          >
                            <Sparkles className="h-4 w-4" />
                            生成 Plan（初始化 KF0-KF8）
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={
                              !aiProfileId ||
                              isStoryboardRunning ||
                              isBatchBlocked ||
                              !storyboardGroups
                            }
                            onClick={() => {
                              const next = storyboardGroupsSorted.find(
                                (g) =>
                                  g.status !== 'ready' && canGenerateStoryboardGroup(g.group_id),
                              );
                              if (!next) {
                                toast({
                                  title: '无可生成分镜组',
                                  description: '请先生成 Plan，或检查上一组是否已完成。',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              onGenerateStoryboardGroup(
                                scene.id,
                                next.group_id,
                                storyboardCameraMode,
                              );
                            }}
                          >
                            <Sparkles className="h-4 w-4" />
                            生成下一组
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={
                              !aiProfileId ||
                              isStoryboardRunning ||
                              isBatchBlocked ||
                              !storyboardGroups ||
                              !allStoryboardGroupsReady
                            }
                            onClick={() => onTranslateStoryboardPanels(scene.id)}
                          >
                            <Sparkles className="h-4 w-4" />
                            翻译到中文（panels.zh）
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={
                              !aiProfileId ||
                              isStoryboardRunning ||
                              isBatchBlocked ||
                              !storyboardGroups ||
                              storyboardDirtyCount === 0
                            }
                            onClick={() => onBackTranslateStoryboardPanels(scene.id)}
                          >
                            <Sparkles className="h-4 w-4" />
                            回译 dirty（zh→en）
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={!storyboardGroups}
                            onClick={() => {
                              const text = buildStoryboardRenderJsonExport();
                              if (!text) {
                                toast({
                                  title: '暂无可导出内容',
                                  description: '请至少生成 1 个分镜组后再导出 render_json。',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              void copyText('render_json × 9（可批量生图）', text);
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            复制 9 组 render_json
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={!storyboardGroups}
                            onClick={() => {
                              const text = buildStoryboardShotListExport();
                              if (!text) {
                                toast({
                                  title: '暂无可导出内容',
                                  description: '请至少生成 1 个分镜组后再导出 81 镜头清单。',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              void copyText('81 镜头清单（按 1..81 汇总）', text);
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            复制 81 镜头清单
                          </Button>
                        </div>

                        {!storyboardGroups ? (
                          <div className="text-xs text-muted-foreground">
                            还未初始化分镜组。先生成 SceneBible 与 Plan，然后可逐组生成 KF0-KF8。
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {storyboardGroupsSorted.map((g, idx) => {
                              const isExpanded = expandedStoryboardGroupId === g.group_id;
                              const canGen = canGenerateStoryboardGroup(g.group_id);
                              const laterReady = storyboardGroupsSorted
                                .slice(idx + 1)
                                .some((x) => x.status === 'ready' && Boolean(x.group));

                              const statusVariant =
                                g.status === 'ready'
                                  ? 'default'
                                  : g.status === 'needs_fix'
                                    ? 'destructive'
                                    : g.status === 'generating'
                                      ? 'outline'
                                      : 'secondary';
                              const statusLabel =
                                g.status === 'ready'
                                  ? '已就绪'
                                  : g.status === 'needs_fix'
                                    ? '需修复'
                                    : g.status === 'generating'
                                      ? '生成中'
                                      : '待生成';

                              const panels = (g.group?.panels ?? [])
                                .slice()
                                .sort((a, b) => a.index - b.index);
                              const endState = g.group?.continuity?.end_state;

                              return (
                                <div key={g.group_id} className="rounded-lg border bg-muted/10 p-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="font-mono text-sm font-semibold shrink-0">
                                        {g.group_id}
                                      </div>
                                      <div className="text-xs text-muted-foreground shrink-0">
                                        镜头 {g.shot_range}
                                      </div>
                                      <Badge variant={statusVariant} className="text-xs shrink-0">
                                        {statusLabel}
                                      </Badge>
                                      {g.group?.render?.template_version !== undefined && (
                                        <Badge variant="outline" className="text-xs shrink-0">
                                          v{g.group.render.template_version}
                                        </Badge>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs gap-1.5"
                                        disabled={
                                          !aiProfileId ||
                                          isStoryboardRunning ||
                                          isBatchBlocked ||
                                          !canGen
                                        }
                                        title={
                                          canGen
                                            ? '生成/重试本组'
                                            : '需先生成上一组（确保连续性承接）'
                                        }
                                        onClick={() => {
                                          if (laterReady) {
                                            const ok = window.confirm(
                                              `重新生成 ${g.group_id} 可能导致后续分镜组不连贯，建议同时重做后续组。继续？`,
                                            );
                                            if (!ok) return;
                                          }
                                          onGenerateStoryboardGroup(
                                            scene.id,
                                            g.group_id,
                                            storyboardCameraMode,
                                          );
                                        }}
                                      >
                                        {g.status === 'ready' ? (
                                          <Trash2 className="h-3.5 w-3.5" />
                                        ) : (
                                          <Sparkles className="h-3.5 w-3.5" />
                                        )}
                                        {g.status === 'ready'
                                          ? '重新生成'
                                          : g.status === 'needs_fix'
                                            ? '修复/重试'
                                            : '生成本组'}
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs gap-1.5"
                                        disabled={!g.group?.render?.render_json}
                                        onClick={() => {
                                          const payload = g.group?.render?.render_json ?? null;
                                          if (!payload) return;
                                          void copyText(
                                            `${g.group_id} render_json`,
                                            JSON.stringify(payload, null, 2),
                                          );
                                        }}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                        render_json
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs gap-1.5"
                                        onClick={() =>
                                          setExpandedStoryboardGroupId(
                                            isExpanded ? null : g.group_id,
                                          )
                                        }
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5" />
                                        )}
                                        {isExpanded ? '收起' : '展开'}
                                      </Button>
                                    </div>
                                  </div>

                                  {g.last_error && (
                                    <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive whitespace-pre-wrap">
                                      {g.last_error}
                                    </div>
                                  )}

                                  {isExpanded && (
                                    <div className="mt-3 space-y-3">
                                      {!g.group ? (
                                        <div className="text-xs text-muted-foreground">
                                          （本组尚未生成）
                                        </div>
                                      ) : (
                                        <>
                                          <div className="grid gap-2">
                                            {panels.map((p) => {
                                              const cameraText = p.camera
                                                ? `${p.camera.shot_size}|${p.camera.angle}|${p.camera.lens}|${p.camera.motion}`
                                                : '';
                                              return (
                                                <div
                                                  key={p.index}
                                                  className="rounded-md border bg-background p-3 space-y-2"
                                                >
                                                  <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                      <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-xs font-bold text-primary shrink-0">
                                                        {p.index}
                                                      </div>
                                                      {cameraText && (
                                                        <span className="text-xs font-mono text-muted-foreground truncate">
                                                          {cameraText}
                                                        </span>
                                                      )}
                                                      {p.dirtyZh && (
                                                        <Badge
                                                          variant="outline"
                                                          className="text-xs"
                                                        >
                                                          dirty
                                                        </Badge>
                                                      )}
                                                    </div>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-7 px-2 text-xs gap-1.5"
                                                      onClick={() =>
                                                        void copyText(
                                                          `${g.group_id}#${p.index} ${storyboardViewLang.toUpperCase()}`,
                                                          storyboardViewLang === 'zh'
                                                            ? (p.zh ?? '')
                                                            : (p.en ?? ''),
                                                        )
                                                      }
                                                    >
                                                      <Copy className="h-3.5 w-3.5" />
                                                      复制
                                                    </Button>
                                                  </div>

                                                  {storyboardViewLang === 'zh' ? (
                                                    <div className="space-y-2">
                                                      <Textarea
                                                        value={typeof p.zh === 'string' ? p.zh : ''}
                                                        onChange={(e) =>
                                                          updateStoryboardPanelZh(
                                                            g.group_id,
                                                            p.index,
                                                            e.target.value,
                                                          )
                                                        }
                                                        className="min-h-[70px] text-sm leading-relaxed resize-none"
                                                        placeholder="中文（可编辑；编辑后标记 dirty，可回译覆盖英文）"
                                                      />
                                                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                                                        EN: {p.en}
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                                                      {p.en}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>

                                          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <div className="text-xs text-muted-foreground">
                                                continuity.end_state.next_intent_hint：
                                                <span className="ml-1 text-foreground">
                                                  {endState?.next_intent_hint?.trim()
                                                    ? endState.next_intent_hint
                                                    : '（无）'}
                                                </span>
                                              </div>
                                              <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-xs gap-1.5"
                                                  disabled={!endState}
                                                  onClick={() =>
                                                    void copyText(
                                                      `${g.group_id} end_state`,
                                                      JSON.stringify(endState ?? {}, null, 2),
                                                    )
                                                  }
                                                >
                                                  <Copy className="h-3.5 w-3.5" />
                                                  end_state
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-7 px-2 text-xs gap-1.5"
                                                  disabled={!g.group?.render?.prompt_en}
                                                  onClick={() =>
                                                    void copyText(
                                                      `${g.group_id} prompt_en`,
                                                      g.group?.render?.prompt_en ?? '',
                                                    )
                                                  }
                                                >
                                                  <Copy className="h-3.5 w-3.5" />
                                                  prompt_en
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </CollapsibleSection>

                    {/* 关键帧提示词 */}
                    <CollapsibleSection
                      title="关键帧提示词"
                      icon={<Film className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Shot Prompt
                        </Badge>
                      }
                    >
                      <div className="space-y-4">
                        {/* 快速复制区 */}
                        {parsedKeyframes.isStructured && (
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                              {GENERATED_IMAGE_KEYFRAMES.map((kfKey, index) => {
                                const segment = Math.floor(index / 3) + 1;
                                const phase = ['起', '中', '终'][index % 3] ?? '';
                                const label = `${kfKey}（段${segment}${phase}）`;
                                return (
                                  <KeyframeCard
                                    key={kfKey}
                                    label={label}
                                    kfKey={kfKey}
                                    index={index}
                                    keyframe={parsedKeyframes.keyframes[index] ?? {}}
                                    onCopy={onCopyKeyframe}
                                  />
                                );
                              })}
                            </div>
                            {parsedKeyframes.avoid && (
                              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-destructive">
                                    <X className="h-4 w-4" />
                                    <span className="text-xs font-medium">AVOID（负面提示词）</span>
                                  </div>
                                  <CopyButtonGroup
                                    hasZh={Boolean(parsedKeyframes.avoid.zh)}
                                    hasEn={Boolean(parsedKeyframes.avoid.en)}
                                    onCopyZh={() => void onCopyKeyframeAvoid('zh')}
                                    onCopyEn={() => void onCopyKeyframeAvoid('en')}
                                    size="xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <Textarea
                          value={scene.shotPrompt}
                          onChange={(e) => onUpdateScene(scene.id, { shotPrompt: e.target.value })}
                          className="min-h-[200px] font-mono text-sm leading-relaxed resize-none"
                          placeholder="支持 JSON 或行标签格式：KF0_ZH: ...&#10;KF0_EN: ...&#10;...&#10;KF8_ZH: ...&#10;KF8_EN: ..."
                        />
                      </div>
                    </CollapsibleSection>

                    {/* 关键帧图片 */}
                    <CollapsibleSection
                      title="关键帧图片"
                      icon={<ImageIcon className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Keyframe Images
                        </Badge>
                      }
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onGenerateImages(scene.id)}
                          disabled={!aiProfileId || isGeneratingImages || isBatchBlocked}
                          className="gap-2"
                        >
                          {isGeneratingImages ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              一键生成图片
                            </>
                          )}
                        </Button>
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        {GENERATED_IMAGE_KEYFRAMES.map((label, index) => {
                          const image = generatedImageMap.get(label);
                          const segment = Math.floor(index / 3) + 1;
                          const phase = ['起', '中', '终'][index % 3] ?? '';
                          return (
                            <div key={label} className="space-y-2">
                              <div className="text-xs font-medium text-muted-foreground">
                                {label}（段{segment}
                                {phase}）
                              </div>
                              {image ? (
                                <div className="overflow-hidden rounded-lg border">
                                  <img
                                    src={image.url}
                                    alt={`${label} keyframe`}
                                    className="h-40 w-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                                  未生成
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>

                    {/* 运动提示词 */}
                    <CollapsibleSection
                      title="时空/运动提示词"
                      icon={<Move3D className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Motion Prompt
                        </Badge>
                      }
                    >
                      <div className="space-y-4">
                        {/* 快速复制区 */}
                        {parsedMotion.isStructured && (
                          <div className="grid gap-3 sm:grid-cols-3">
                            <MotionCard
                              label="SHORT"
                              dataKey="motionShort"
                              data={parsedMotion.motionShort}
                              icon={<Video className="h-3.5 w-3.5" />}
                              onCopy={onCopyMotion}
                            />
                            <MotionCard
                              label="BEATS"
                              dataKey="motionBeats"
                              data={parsedMotion.motionBeats}
                              icon={<Layers className="h-3.5 w-3.5" />}
                              onCopy={onCopyMotion}
                            />
                            <MotionCard
                              label="CONSTRAINTS"
                              dataKey="constraints"
                              data={parsedMotion.constraints}
                              icon={<Eye className="h-3.5 w-3.5" />}
                              onCopy={onCopyMotion}
                            />
                          </div>
                        )}
                        <Textarea
                          value={scene.motionPrompt}
                          onChange={(e) =>
                            onUpdateScene(scene.id, { motionPrompt: e.target.value })
                          }
                          className="min-h-[200px] font-mono text-sm leading-relaxed resize-none"
                          placeholder="SHORT_ZH: ...&#10;SHORT_EN: ...&#10;BEATS_ZH: ...&#10;..."
                        />
                      </div>
                    </CollapsibleSection>

                    {/* 备注 */}
                    <CollapsibleSection
                      title="备注"
                      icon={<FileText className="h-4 w-4" />}
                      defaultOpen={false}
                    >
                      <Textarea
                        value={scene.notes}
                        onChange={(e) => onUpdateScene(scene.id, { notes: e.target.value })}
                        className="min-h-[100px] text-sm leading-relaxed resize-none"
                        placeholder="添加任何补充说明..."
                      />
                    </CollapsibleSection>
                  </div>
                </ScrollArea>

                {/* 右侧差量对比面板 */}
                <div className="w-80 shrink-0 border-l bg-muted/20">
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                        差量对比
                      </div>
                      <Separator />
                      <DeltaComparisonPanel prevScene={prevScene} deltaItems={deltaItems} />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}

            {/* 分镜脚本面板 */}
            {activeTab === 'script' && (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <PanelScriptEditor
                    scene={scene}
                    characters={characters}
                    worldViewElements={worldViewElements}
                    onUpdateScene={(updates) => onUpdateScene(scene.id, updates)}
                  />
                </div>
              </ScrollArea>
            )}

            {/* 台词面板 */}
            {activeTab === 'dialogue' && (
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-medium">台词</h3>
                      <Badge variant="secondary" className="text-xs">
                        Dialogue
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void onCopyDialogues(dialogues)}
                      disabled={dialogues.length === 0}
                      className="gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      复制 JSON
                    </Button>
                  </div>

                  <Separator />

                  {dialogues.length > 0 ? (
                    <div className="space-y-3 max-w-3xl">
                      {dialogues.map((line) => (
                        <DialogueCard key={line.id} line={line} />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-12 text-center max-w-2xl mx-auto">
                      <Mic className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                      <h4 className="text-lg font-medium text-muted-foreground mb-2">暂无台词</h4>
                      <p className="text-sm text-muted-foreground/70">
                        点击「一键细化」按钮可自动生成台词
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="shrink-0 border-t bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
              onClick={() => {
                onDeleteScene(scene.id);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" />
              删除分镜
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
