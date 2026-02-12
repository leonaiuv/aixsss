// ==========================================
// 分镜详情弹窗 - 专业级编辑器
// ==========================================
// 采用三栏布局：
// - 左侧：场景锚点 + 关键帧提示词 + 运动提示词
// - 中间：分镜脚本编辑器（地点/角色/镜头等）
// - 右侧：台词/备注 + 差量对比
// ==========================================

import { useMemo, useState } from 'react';
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
import { GENERATED_IMAGE_KEYFRAMES } from '@aixsss/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PanelScriptEditor } from './PanelScriptEditor';
import { SoundDesignPanel } from './SoundDesignPanel';
import { DurationEstimateBar } from './DurationEstimateBar';
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
  Volume2,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  isGeneratingVideo: boolean;
  refineProgress?: { message?: string | null; pct?: number | null };
  isBatchBlocked: boolean;
  isGeneratingSoundDesign?: boolean;
  isEstimatingDuration?: boolean;
  aiProfileId?: string | null;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onRefineScene: (sceneId: string) => void;
  onGenerateImages: (sceneId: string) => void;
  onGenerateSingleKeyframeImage?: (sceneId: string, keyframeKey: GeneratedImageKeyframe) => void;
  onGenerateVideo: (sceneId: string) => void;
  onGenerateKeyframePrompt?: (sceneId: string) => void;
  onGenerateSingleKeyframePrompt?: (sceneId: string, keyframeKey: GeneratedImageKeyframe) => void;
  onGenerateSoundDesign?: (sceneId: string) => void;
  onEstimateDuration?: (sceneId: string) => void;
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
  isGeneratingKeyframePrompt?: boolean;
  generatingSingleKeyframeKey?: GeneratedImageKeyframe | null;
  generatingSingleImageKey?: GeneratedImageKeyframe | null;
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
      <div className="flex w-full items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-medium">{title}</span>
          {badge}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label={isOpen ? `折叠${title}` : `展开${title}`}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
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
  onGenerate,
  isGenerating = false,
  disabled = false,
}: {
  label: string;
  kfKey: GeneratedImageKeyframe;
  index: number;
  keyframe: LocaleText;
  onCopy: (kfKey: string, lang: 'zh' | 'en') => void;
  onGenerate?: (kfKey: GeneratedImageKeyframe) => void;
  isGenerating?: boolean;
  disabled?: boolean;
}) {
  const hasZh = Boolean(keyframe.zh);
  const hasEn = Boolean(keyframe.en);
  const hasContent = hasZh || hasEn;
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
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1.5"
            onClick={() => onGenerate?.(kfKey)}
            disabled={disabled || !onGenerate}
            aria-label={`${hasContent ? '重生成' : '生成'} ${kfKey}`}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {isGenerating ? '生成中' : hasContent ? '重生成' : '生成'}
          </Button>
          <CopyButtonGroup
            hasZh={hasZh}
            hasEn={hasEn}
            onCopyZh={() => onCopy(kfKey, 'zh')}
            onCopyEn={() => onCopy(kfKey, 'en')}
            size="xs"
          />
        </div>
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
  isGeneratingVideo,
  refineProgress,
  isBatchBlocked,
  isGeneratingSoundDesign = false,
  isEstimatingDuration = false,
  aiProfileId,
  onUpdateScene,
  onRefineScene,
  onGenerateImages,
  onGenerateSingleKeyframeImage,
  onGenerateVideo,
  onGenerateKeyframePrompt,
  onGenerateSingleKeyframePrompt,
  onGenerateSoundDesign,
  onEstimateDuration,
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
  isGeneratingKeyframePrompt = false,
  generatingSingleKeyframeKey = null,
  generatingSingleImageKey = null,
}: SceneDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'prompts' | 'script' | 'dialogue' | 'sound'>(
    'prompts',
  );
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);

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

  const generatedVideos = useMemo(() => {
    const raw = scene?.generatedVideos;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (v) =>
        v &&
        typeof v === 'object' &&
        typeof (v as unknown as Record<string, unknown>).url === 'string',
    ) as NonNullable<Scene['generatedVideos']>;
  }, [scene?.generatedVideos]);

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
        <DialogTitle className="sr-only">分镜详情</DialogTitle>
        <DialogDescription className="sr-only">
          查看并编辑分镜内容、提示词与生成结果
        </DialogDescription>
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
            <button
              type="button"
              onClick={() => setActiveTab('sound')}
              className={cn(
                'flex flex-col items-center justify-center w-10 h-10 rounded-lg transition-all',
                activeTab === 'sound'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title="声音与时长"
            >
              <Volume2 className="h-5 w-5" />
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

                    {/* 关键帧提示词 */}
                    <CollapsibleSection
                      title="关键帧提示词"
                      icon={<Film className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Shot Prompt
                        </Badge>
                      }
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onGenerateKeyframePrompt?.(scene.id)}
                          disabled={
                            !onGenerateKeyframePrompt ||
                            !aiProfileId ||
                            isBatchBlocked ||
                            isRefining ||
                            isGeneratingKeyframePrompt
                          }
                          className="gap-2"
                        >
                          {isGeneratingKeyframePrompt ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              {scene.shotPrompt?.trim()
                                ? '重新生成关键帧提示词'
                                : '生成关键帧提示词'}
                            </>
                          )}
                        </Button>
                      }
                    >
                      <div className="space-y-4">
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
                                  onGenerate={(key) =>
                                    onGenerateSingleKeyframePrompt?.(scene.id, key)
                                  }
                                  disabled={
                                    !aiProfileId ||
                                    isBatchBlocked ||
                                    isRefining ||
                                    isGeneratingKeyframePrompt
                                  }
                                  isGenerating={
                                    isGeneratingKeyframePrompt &&
                                    generatingSingleKeyframeKey === kfKey
                                  }
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
                        <div className="flex items-center gap-2">
                          {!scene.shotPrompt?.trim() && (
                            <span className="text-xs text-muted-foreground">
                              需先生成关键帧提示词
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onGenerateImages(scene.id)}
                            disabled={
                              !aiProfileId ||
                              isGeneratingImages ||
                              isBatchBlocked ||
                              !scene.shotPrompt?.trim()
                            }
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
                        </div>
                      }
                    >
                      <div className="grid gap-4 sm:grid-cols-3">
                        {GENERATED_IMAGE_KEYFRAMES.map((label, index) => {
                          const image = generatedImageMap.get(label);
                          const segment = Math.floor(index / 3) + 1;
                          const phase = ['起', '中', '终'][index % 3] ?? '';
                          const isGeneratingThis =
                            isGeneratingImages && generatingSingleImageKey === label;
                          return (
                            <div key={label} className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-medium text-muted-foreground">
                                  {label}（段{segment}
                                  {phase}）
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs gap-1.5"
                                  disabled={
                                    !onGenerateSingleKeyframeImage ||
                                    !aiProfileId ||
                                    isBatchBlocked ||
                                    !scene.shotPrompt?.trim() ||
                                    isGeneratingImages
                                  }
                                  onClick={() => onGenerateSingleKeyframeImage?.(scene.id, label)}
                                  aria-label={`${image ? '重生成' : '生成'}图片 ${label}`}
                                >
                                  {isGeneratingThis ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  {isGeneratingThis ? '生成中' : image ? '重生成' : '生成'}
                                </Button>
                              </div>
                              {image ? (
                                <div className="overflow-hidden rounded-lg border">
                                  <img
                                    src={image.url}
                                    alt={`${label} keyframe`}
                                    className="h-40 w-full cursor-zoom-in object-cover"
                                    onDoubleClick={() =>
                                      setPreviewImage({
                                        url: image.url,
                                        label,
                                      })
                                    }
                                  />
                                </div>
                              ) : (
                                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                                  未生成
                                </div>
                              )}
                              {image ? (
                                <div className="text-[10px] text-muted-foreground">
                                  双击图片可放大
                                </div>
                              ) : null}
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

                    {/* 视频 */}
                    <CollapsibleSection
                      title="生成视频"
                      icon={<Video className="h-4 w-4" />}
                      badge={
                        <Badge variant="secondary" className="text-xs">
                          Video
                        </Badge>
                      }
                      actions={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onGenerateVideo(scene.id)}
                          disabled={
                            !aiProfileId ||
                            isGeneratingVideo ||
                            isBatchBlocked ||
                            !scene.motionPrompt?.trim()
                          }
                          className="gap-2"
                        >
                          {isGeneratingVideo ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              一键生成视频
                            </>
                          )}
                        </Button>
                      }
                    >
                      {generatedVideos.length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {generatedVideos.map((v, idx) => (
                            <div key={`${v.url}_${idx}`} className="space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {v.model ? `model=${v.model}` : '视频'}
                                {v.createdAt ? ` · ${v.createdAt}` : ''}
                              </div>
                              <div className="overflow-hidden rounded-lg border">
                                <video
                                  src={v.url}
                                  controls
                                  className="h-48 w-full bg-black object-contain"
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigator.clipboard.writeText(v.url)}
                                  className="gap-2"
                                >
                                  <Copy className="h-4 w-4" />
                                  复制链接
                                </Button>
                                <Button variant="outline" size="sm" asChild>
                                  <a href={v.url} target="_blank" rel="noreferrer">
                                    打开
                                  </a>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                          未生成
                        </div>
                      )}
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

            {activeTab === 'sound' && (
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-medium">声音与时长</h3>
                      <Badge variant="secondary" className="text-xs">
                        Sound / Duration
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {onGenerateSoundDesign ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onGenerateSoundDesign(scene.id)}
                          disabled={isGeneratingSoundDesign || !aiProfileId || isBatchBlocked}
                        >
                          {isGeneratingSoundDesign ? '生成中...' : '生成声音'}
                        </Button>
                      ) : null}
                      {onEstimateDuration ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEstimateDuration(scene.id)}
                          disabled={isEstimatingDuration || !aiProfileId || isBatchBlocked}
                          className="gap-2"
                        >
                          <Timer className="h-4 w-4" />
                          {isEstimatingDuration ? '估算中...' : '估算时长'}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <SoundDesignPanel scene={scene} />
                    <DurationEstimateBar scene={scene} />
                  </div>
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

        {previewImage ? (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            onClick={() => setPreviewImage(null)}
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-4 top-4"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" />
              关闭预览
            </Button>
            <img
              src={previewImage.url}
              alt={`${previewImage.label} 预览大图`}
              className="max-h-[85vh] w-auto max-w-[95vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
