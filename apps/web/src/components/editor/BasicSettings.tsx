import { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useCustomStyleStore } from '@/stores/customStyleStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowRight,
  Sparkles,
  Globe,
  Users,
  Palette,
  Brush,
  Layers,
  MapPin,
  Copy,
  Check,
  Plus,
  Edit2,
  Trash2,
  Save,
  BookOpen,
  Lightbulb,
  History,
  Wand2,
} from 'lucide-react';
import { WorldViewBuilder } from './WorldViewBuilder';
import { CharacterManager } from './CharacterManager';
import { useToast } from '@/hooks/use-toast';
import {
  useKeyboardShortcut,
  GLOBAL_SHORTCUTS,
  getPlatformShortcut,
} from '@/hooks/useKeyboardShortcut';
import {
  ART_STYLE_PRESETS,
  ArtStyleConfig,
  getArtStyleConfig,
  composeStyleFullPrompt,
  migrateOldStyleToConfig,
  isCustomStyleId,
  CustomArtStyle,
} from '@/types';

export type BasicSettingsProps = {
  proceedText?: string;
  onProceed?: () => void;
  minSummaryLength?: number;
  minProtagonistLength?: number;
};

export function BasicSettings(props: BasicSettingsProps = {}) {
  const { currentProject, updateProject } = useProjectStore();
  const { toast } = useToast();
  const {
    customStyles,
    loadCustomStyles,
    isLoaded: customStylesLoaded,
    createCustomStyle,
    updateCustomStyle,
    deleteCustomStyle,
    getCustomStyleById,
  } = useCustomStyleStore();

  // 初始化画风配置
  const getInitialStyleConfig = (): ArtStyleConfig => {
    if (currentProject?.artStyleConfig) {
      return currentProject.artStyleConfig;
    }
    if (currentProject?.style) {
      return migrateOldStyleToConfig(currentProject.style);
    }
    return getArtStyleConfig('anime_cel')!;
  };

  const [formData, setFormData] = useState({
    summary: currentProject?.summary || '',
    protagonist: currentProject?.protagonist || '',
  });
  const [styleConfig, setStyleConfig] = useState<ArtStyleConfig>(getInitialStyleConfig());
  const [activeTab, setActiveTab] = useState('basic');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // 自定义画风管理状态
  const [showCustomStyleDialog, setShowCustomStyleDialog] = useState(false);
  const [editingCustomStyle, setEditingCustomStyle] = useState<CustomArtStyle | null>(null);
  const [customStyleForm, setCustomStyleForm] = useState({
    name: '',
    description: '',
    baseStyle: '',
    technique: '',
    colorPalette: '',
    culturalFeature: '',
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [styleToDelete, setStyleToDelete] = useState<string | null>(null);

  // 加载自定义画风
  useEffect(() => {
    if (!customStylesLoaded) {
      loadCustomStyles();
    }
  }, [customStylesLoaded, loadCustomStyles]);

  useEffect(() => {
    if (currentProject) {
      setFormData({
        summary: currentProject.summary || '',
        protagonist: currentProject.protagonist || '',
      });
      setStyleConfig(getInitialStyleConfig());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const minSummaryLength = props.minSummaryLength ?? 50;
  const minProtagonistLength = props.minProtagonistLength ?? 20;
  const maxSummaryLength = 300;
  const maxProtagonistLength = 150;
  const emotionArcPointCount = Array.isArray(currentProject?.contextCache?.emotionArc)
    ? currentProject.contextCache.emotionArc.length
    : 0;

  const canProceed =
    formData.summary.length >= minSummaryLength &&
    styleConfig.fullPrompt &&
    formData.protagonist.length >= minProtagonistLength;

  const draftPayload = useMemo(
    () => ({
      summary: formData.summary,
      protagonist: formData.protagonist,
      // 向后兼容：旧字段里存 presetId
      style: styleConfig.presetId,
      artStyleConfig: styleConfig,
    }),
    [formData.protagonist, formData.summary, styleConfig],
  );

  const hasDraftChanges = useMemo(() => {
    if (!currentProject) return false;
    return (
      (currentProject.summary || '') !== draftPayload.summary ||
      (currentProject.protagonist || '') !== draftPayload.protagonist ||
      (currentProject.style || '') !== draftPayload.style ||
      JSON.stringify(currentProject.artStyleConfig || null) !==
        JSON.stringify(draftPayload.artStyleConfig || null)
    );
  }, [
    currentProject,
    draftPayload.artStyleConfig,
    draftPayload.protagonist,
    draftPayload.style,
    draftPayload.summary,
  ]);

  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 自动保存草稿：用户停顿 800ms 后写入（不改变 workflowState）
  useEffect(() => {
    if (!currentProject) return;
    if (!hasDraftChanges) return;

    const timer = window.setTimeout(() => {
      updateProject(currentProject.id, draftPayload);
      setLastSavedAt(
        new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      );
    }, 800);

    return () => window.clearTimeout(timer);
  }, [currentProject, draftPayload, hasDraftChanges, updateProject]);

  const handleSaveDraft = () => {
    if (!currentProject) return;
    updateProject(currentProject.id, draftPayload);
    setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    toast({
      title: '已保存草稿',
      description: '你的基础设定已保存到本地',
    });
  };

  const handleProceed = () => {
    if (!currentProject) return;
    if (!canProceed) return;

    updateProject(currentProject.id, {
      ...draftPayload,
      workflowState: 'DATA_COLLECTED',
    });
    if (props.onProceed) {
      props.onProceed();
    } else {
      // 触发进入下一步的事件（旧版编辑器）
      window.dispatchEvent(new CustomEvent('workflow:next-step'));
    }
  };

  // 快捷键：Ctrl/Cmd + S 保存草稿
  useKeyboardShortcut(getPlatformShortcut(GLOBAL_SHORTCUTS.SAVE, GLOBAL_SHORTCUTS.SAVE_MAC), () => {
    if (!currentProject) return;
    if (!hasDraftChanges) return;
    handleSaveDraft();
  });

  if (!currentProject) {
    return null;
  }

  // 处理预设选择（支持内置和自定义）
  const handlePresetChange = (presetId: string) => {
    // 检查是否为自定义画风
    if (isCustomStyleId(presetId)) {
      const customStyle = getCustomStyleById(presetId);
      if (customStyle) {
        setStyleConfig({
          presetId: customStyle.id,
          ...customStyle.config,
        });
      }
    } else {
      const newConfig = getArtStyleConfig(presetId);
      if (newConfig) {
        setStyleConfig(newConfig);
      }
    }
  };

  // 处理单个维度修改
  const handleStyleFieldChange = (
    field: keyof Omit<ArtStyleConfig, 'presetId' | 'fullPrompt'>,
    value: string,
  ) => {
    const newConfig = {
      ...styleConfig,
      presetId: 'custom', // 修改后变为自定义
      [field]: value,
    };
    // 重新合成 fullPrompt
    newConfig.fullPrompt = composeStyleFullPrompt(newConfig);
    setStyleConfig(newConfig);
  };

  // 复制完整提示词
  const handleCopyFullPrompt = async () => {
    await navigator.clipboard.writeText(styleConfig.fullPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // 打开创建自定义画风对话框
  const handleOpenCreateDialog = () => {
    setEditingCustomStyle(null);
    setCustomStyleForm({
      name: '',
      description: '',
      baseStyle: styleConfig.baseStyle || '',
      technique: styleConfig.technique || '',
      colorPalette: styleConfig.colorPalette || '',
      culturalFeature: styleConfig.culturalFeature || '',
    });
    setShowCustomStyleDialog(true);
  };

  // 打开编辑自定义画风对话框
  const handleOpenEditDialog = (style: CustomArtStyle) => {
    setEditingCustomStyle(style);
    setCustomStyleForm({
      name: style.name,
      description: style.description,
      baseStyle: style.config.baseStyle,
      technique: style.config.technique,
      colorPalette: style.config.colorPalette,
      culturalFeature: style.config.culturalFeature,
    });
    setShowCustomStyleDialog(true);
  };

  // 保存自定义画风
  const handleSaveCustomStyle = () => {
    const config = {
      baseStyle: customStyleForm.baseStyle,
      technique: customStyleForm.technique,
      colorPalette: customStyleForm.colorPalette,
      culturalFeature: customStyleForm.culturalFeature,
      fullPrompt: composeStyleFullPrompt({
        baseStyle: customStyleForm.baseStyle,
        technique: customStyleForm.technique,
        colorPalette: customStyleForm.colorPalette,
        culturalFeature: customStyleForm.culturalFeature,
      }),
    };

    if (editingCustomStyle) {
      // 更新现有画风
      updateCustomStyle(editingCustomStyle.id, {
        name: customStyleForm.name,
        description: customStyleForm.description,
        config,
      });
      // 如果当前正在使用该画风，更新配置
      if (styleConfig.presetId === editingCustomStyle.id) {
        setStyleConfig({
          presetId: editingCustomStyle.id,
          ...config,
        });
      }
    } else {
      // 创建新画风
      const newStyle = createCustomStyle({
        name: customStyleForm.name,
        description: customStyleForm.description,
        config,
      });
      // 自动选中新创建的画风
      setStyleConfig({
        presetId: newStyle.id,
        ...newStyle.config,
      });
    }
    setShowCustomStyleDialog(false);
  };

  // 确认删除自定义画风
  const handleConfirmDelete = () => {
    if (styleToDelete) {
      deleteCustomStyle(styleToDelete);
      // 如果删除的是当前使用的画风，切换到默认
      if (styleConfig.presetId === styleToDelete) {
        const defaultConfig = getArtStyleConfig('anime_cel')!;
        setStyleConfig(defaultConfig);
      }
    }
    setDeleteConfirmOpen(false);
    setStyleToDelete(null);
  };

  // 将当前配置保存为自定义画风
  const handleSaveCurrentAsCustom = () => {
    setEditingCustomStyle(null);
    setCustomStyleForm({
      name: '',
      description: '',
      baseStyle: styleConfig.baseStyle || '',
      technique: styleConfig.technique || '',
      colorPalette: styleConfig.colorPalette || '',
      culturalFeature: styleConfig.culturalFeature || '',
    });
    setShowCustomStyleDialog(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">全局设定</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            定义故事的核心基调、世界观与主要角色，为智能创作注入灵魂。
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            {/* Status Indicator */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                canProceed
                  ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                  : 'bg-muted text-muted-foreground border-border',
              )}
            >
              {canProceed ? <Check className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              {canProceed ? '准备就绪' : '待完善'}
            </div>

            {/* Main Action Button */}
            <Button
              size="default"
              className={cn(
                'font-semibold shadow-md transition-all',
                canProceed ? 'shadow-primary/25 hover:shadow-primary/40' : '',
              )}
              onClick={handleProceed}
              disabled={!canProceed}
            >
              {props.proceedText ?? '确认并生成分镜'} <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>

          {/* Save Status Line */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  hasDraftChanges ? 'bg-amber-500 animate-pulse' : 'bg-green-500',
                )}
              />
              {hasDraftChanges ? '未保存修改' : '已保存'}
            </span>
            <span className="text-border/50">|</span>
            <button
              className="hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSaveDraft}
              disabled={!hasDraftChanges}
            >
              <Save className="w-3 h-3" /> 手动保存
            </button>
            {lastSavedAt && (
              <>
                <span className="text-border/50">|</span>
                <span className="flex items-center gap-1 opacity-70">
                  <History className="w-3 h-3" /> {lastSavedAt}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="bg-muted/30 p-1.5 rounded-xl border inline-flex">
          <TabsList className="bg-transparent h-10 w-full justify-start p-0">
            <TabsTrigger
              value="basic"
              className="px-6 h-10 rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
            >
              <Wand2 className="w-4 h-4 mr-2" /> 基础信息
            </TabsTrigger>
            <TabsTrigger
              value="worldview"
              className="px-6 h-10 rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
            >
              <Globe className="w-4 h-4 mr-2" /> 世界观
            </TabsTrigger>
            <TabsTrigger
              value="characters"
              className="px-6 h-10 rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all"
            >
              <Users className="w-4 h-4 mr-2" /> 角色管理
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="basic" className="space-y-8 focus-visible:outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Input Forms */}
            <div className="lg:col-span-8 space-y-8">
              {/* Story Synopsis Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="summary"
                    className="text-xl font-semibold flex items-center gap-2 text-foreground"
                  >
                    <BookOpen className="w-5 h-5 text-primary" /> 剧本梗概
                  </Label>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
                      formData.summary.length >= minSummaryLength &&
                        formData.summary.length <= maxSummaryLength
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
                    )}
                  >
                    {formData.summary.length} / {maxSummaryLength}
                  </span>
                </div>

                <Card className="border-muted shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden group">
                  <CardContent className="p-0">
                    <Textarea
                      id="summary"
                      placeholder="示例: 在未来都市,黑客少女发现了政府隐藏的真相。她潜入数据中心,解开层层加密,最终揭露了控制人类意识的阴谋。在追击中,她必须在信任同伴与独自逃亡之间做出抉择..."
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      className="min-h-[180px] border-0 focus-visible:ring-0 resize-none p-6 text-base leading-relaxed bg-background group-hover:bg-accent/5 transition-colors"
                    />
                  </CardContent>
                  <div className="border-t bg-muted/20 px-4 py-2 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 将基于此生成初步的场景规划</span>
                    </div>
                    {formData.summary.length < minSummaryLength && (
                      <span className="text-amber-600 font-medium">
                        还需 {minSummaryLength - formData.summary.length} 字
                      </span>
                    )}
                  </div>
                </Card>
              </section>

              {/* Art Style Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="style"
                    className="text-xl font-semibold flex items-center gap-2 text-foreground"
                  >
                    <Palette className="w-5 h-5 text-primary" /> 美术风格
                  </Label>
                </div>

                <Card className="border-muted shadow-sm">
                  <CardContent className="p-6 space-y-6">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <Label className="text-sm text-muted-foreground mb-2 block">
                          选择画风预设
                        </Label>
                        <Select value={styleConfig.presetId} onValueChange={handlePresetChange}>
                          <SelectTrigger id="style" className="h-12 w-full text-base">
                            <SelectValue placeholder="选择画风预设..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              内置预设
                            </div>
                            {ART_STYLE_PRESETS.map((preset) => (
                              <SelectItem key={preset.id} value={preset.id}>
                                <span className="font-medium">{preset.label}</span>
                                <span className="ml-2 text-muted-foreground text-xs">
                                  - {preset.description}
                                </span>
                              </SelectItem>
                            ))}
                            {customStyles.length > 0 && (
                              <>
                                <div className="h-px bg-border my-1" />
                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                  自定义画风
                                </div>
                                {customStyles.map((style) => (
                                  <SelectItem key={style.id} value={style.id}>
                                    {style.name}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            <div className="h-px bg-border my-1" />
                            <SelectItem value="custom" className="text-primary font-medium">
                              ✨ 当前自定义配置
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-12 w-12 shrink-0"
                          onClick={handleOpenCreateDialog}
                          title="创建新画风"
                        >
                          <Plus className="h-5 w-5" />
                        </Button>

                        {isCustomStyleId(styleConfig.presetId) && (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-12 w-12 shrink-0"
                              onClick={() => {
                                const style = getCustomStyleById(styleConfig.presetId);
                                if (style) handleOpenEditDialog(style);
                              }}
                              title="编辑画风"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-12 w-12 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => {
                                setStyleToDelete(styleConfig.presetId);
                                setDeleteConfirmOpen(true);
                              }}
                              title="删除画风"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        {styleConfig.presetId === 'custom' && (
                          <Button
                            variant="outline"
                            className="h-12 gap-2 text-primary border-primary/20 bg-primary/5"
                            onClick={handleSaveCurrentAsCustom}
                          >
                            <Save className="h-4 w-4" /> 保存预设
                          </Button>
                        )}
                      </div>
                    </div>

                    <Accordion type="single" collapsible className="border rounded-lg bg-muted/10">
                      <AccordionItem value="style-details" className="border-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/20 rounded-t-lg">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Brush className="h-4 w-4 text-primary" />
                            <span>高级参数微调</span>
                            {styleConfig.presetId === 'custom' && (
                              <Badge variant="outline" className="ml-2 text-[10px] h-5">
                                已修改
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-2 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Layers className="h-3 w-3" /> 整体风格
                              </Label>
                              <Input
                                value={styleConfig.baseStyle}
                                onChange={(e) =>
                                  handleStyleFieldChange('baseStyle', e.target.value)
                                }
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Brush className="h-3 w-3" /> 渲染技法
                              </Label>
                              <Input
                                value={styleConfig.technique}
                                onChange={(e) =>
                                  handleStyleFieldChange('technique', e.target.value)
                                }
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Palette className="h-3 w-3" /> 色彩倾向
                              </Label>
                              <Input
                                value={styleConfig.colorPalette}
                                onChange={(e) =>
                                  handleStyleFieldChange('colorPalette', e.target.value)
                                }
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> 文化/时代
                              </Label>
                              <Input
                                value={styleConfig.culturalFeature}
                                onChange={(e) =>
                                  handleStyleFieldChange('culturalFeature', e.target.value)
                                }
                                className="h-9 font-mono text-xs"
                              />
                            </div>
                          </div>

                          <div className="mt-2 pt-2 border-t border-dashed">
                            <div className="flex items-center justify-between mb-1.5">
                              <Label className="text-xs font-medium">Prompt Preview</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs gap-1"
                                onClick={handleCopyFullPrompt}
                              >
                                {copiedPrompt ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copiedPrompt ? '已复制' : '复制'}
                              </Button>
                            </div>
                            <div className="bg-muted p-2 rounded text-xs font-mono text-muted-foreground break-all leading-relaxed">
                              {styleConfig.fullPrompt}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </section>

              {/* Character Description Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="protagonist"
                    className="text-xl font-semibold flex items-center gap-2 text-foreground"
                  >
                    <Users className="w-5 h-5 text-primary" /> 主角描述
                  </Label>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
                      formData.protagonist.length >= minProtagonistLength &&
                        formData.protagonist.length <= maxProtagonistLength
                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
                    )}
                  >
                    {formData.protagonist.length} / {maxProtagonistLength}
                  </span>
                </div>

                <Card className="border-muted shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden group">
                  <CardContent className="p-0">
                    <Textarea
                      id="protagonist"
                      placeholder="示例: 18岁少女,银色短发,紫色赛博义眼。穿黑色机能夹克、破洞牛仔裤、高帮军靴。性格冷静理智但内心孤独,精通编程和黑客技术,右臂有发光电路纹身..."
                      value={formData.protagonist}
                      onChange={(e) => setFormData({ ...formData, protagonist: e.target.value })}
                      className="min-h-[140px] border-0 focus-visible:ring-0 resize-none p-6 text-base leading-relaxed bg-background group-hover:bg-accent/5 transition-colors"
                    />
                  </CardContent>
                  <div className="border-t bg-muted/20 px-4 py-2 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>描述越具体，角色形象越稳定</span>
                    </div>
                    {formData.protagonist.length < minProtagonistLength && (
                      <span className="text-amber-600 font-medium">
                        还需 {minProtagonistLength - formData.protagonist.length} 字
                      </span>
                    )}
                  </div>
                </Card>
              </section>
            </div>

            {/* Right Column: Sidebar (Sticky) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="sticky top-6 space-y-6">
                {/* Guidelines Card */}
                <Card className="border-muted/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <Lightbulb className="w-4 h-4 text-amber-500" /> 创作小贴士
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-3 pl-4">
                    <div className="relative pl-4 border-l-2 border-primary/20">
                      <p className="font-medium text-foreground text-xs mb-0.5">剧本梗概</p>
                      <p className="text-xs leading-relaxed">
                        包含起因、发展、高潮、结局的基本框架。冲突越明确，AI生成的场景越有张力。
                      </p>
                    </div>
                    <div className="relative pl-4 border-l-2 border-primary/20">
                      <p className="font-medium text-foreground text-xs mb-0.5">画风选择</p>
                      <p className="text-xs leading-relaxed">
                        画风决定了视觉基调。推荐使用"自定义画风"来固定角色的特定配色方案。
                      </p>
                    </div>
                    <div className="relative pl-4 border-l-2 border-primary/20">
                      <p className="font-medium text-foreground text-xs mb-0.5">一致性原则</p>
                      <p className="text-xs leading-relaxed">
                        此处的所有描述将被提取为"项目上下文"，贯穿整个创作流程，请务必准确。
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-muted/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <History className="w-4 h-4 text-primary" /> 专业工作流状态
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>情绪弧线节点</span>
                      <Badge variant="outline">{emotionArcPointCount}</Badge>
                    </div>
                    <p>后续可在「单集创作 {'>'} 分场脚本」中生成/编辑情绪弧线与角色关系图谱。</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="worldview" className="mt-0">
          <WorldViewBuilder />
        </TabsContent>

        <TabsContent value="characters" className="mt-0">
          <CharacterManager projectId={currentProject.id} />
        </TabsContent>
      </Tabs>

      {/* 自定义画风创建/编辑对话框 */}
      <Dialog open={showCustomStyleDialog} onOpenChange={setShowCustomStyleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomStyle ? '编辑自定义画风' : '创建自定义画风'}</DialogTitle>
            <DialogDescription>配置四维画风参数，系统将自动合成完整的提示词</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>画风名称 *</Label>
                <Input
                  value={customStyleForm.name}
                  onChange={(e) => setCustomStyleForm({ ...customStyleForm, name: e.target.value })}
                  placeholder="例如：我的水墨风"
                />
              </div>
              <div className="space-y-2">
                <Label>简要描述</Label>
                <Input
                  value={customStyleForm.description}
                  onChange={(e) =>
                    setCustomStyleForm({ ...customStyleForm, description: e.target.value })
                  }
                  placeholder="例如：我喜欢的水墨风格"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                整体风格 (Base Style)
              </Label>
              <Input
                value={customStyleForm.baseStyle}
                onChange={(e) =>
                  setCustomStyleForm({ ...customStyleForm, baseStyle: e.target.value })
                }
                placeholder="如: anime style, cel shaded, clean lineart"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Brush className="h-3.5 w-3.5" />
                渲染技法 (Technique)
              </Label>
              <Input
                value={customStyleForm.technique}
                onChange={(e) =>
                  setCustomStyleForm({ ...customStyleForm, technique: e.target.value })
                }
                placeholder="如: heavy impasto brushstrokes, watercolor wash"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Palette className="h-3.5 w-3.5" />
                色彩倾向 (Palette)
              </Label>
              <Input
                value={customStyleForm.colorPalette}
                onChange={(e) =>
                  setCustomStyleForm({ ...customStyleForm, colorPalette: e.target.value })
                }
                placeholder="如: vibrant saturated colors, high contrast"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                文化/时代 (Culture/Era)
              </Label>
              <Input
                value={customStyleForm.culturalFeature}
                onChange={(e) =>
                  setCustomStyleForm({ ...customStyleForm, culturalFeature: e.target.value })
                }
                placeholder="如: Oriental aesthetics, Victorian era"
                className="font-mono text-sm"
              />
            </div>

            {/* 预览合成的提示词 */}
            <div className="p-3 rounded-lg bg-muted/50 border border-dashed">
              <Label className="text-xs text-muted-foreground block mb-1">合成提示词预览</Label>
              <p className="text-xs font-mono text-muted-foreground break-all leading-tight">
                {composeStyleFullPrompt({
                  baseStyle: customStyleForm.baseStyle,
                  technique: customStyleForm.technique,
                  colorPalette: customStyleForm.colorPalette,
                  culturalFeature: customStyleForm.culturalFeature,
                }) || '请填写以上字段...'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomStyleDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleSaveCustomStyle}
              disabled={!customStyleForm.name.trim() || !customStyleForm.baseStyle.trim()}
            >
              {editingCustomStyle ? '保存修改' : '创建画风'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除自定义画风</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复。如果有项目正在使用该画风，将自动切换到默认画风。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
