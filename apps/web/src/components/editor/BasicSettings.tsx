import { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useCustomStyleStore } from '@/stores/customStyleStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function BasicSettings() {
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
  }, [currentProject?.id]);

  const canProceed =
    formData.summary.length >= 50 && styleConfig.fullPrompt && formData.protagonist.length >= 20;

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
    // 触发进入下一步的事件
    window.dispatchEvent(new CustomEvent('workflow:next-step'));
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
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">基础设定</h2>
            <p className="text-sm text-muted-foreground">
              输入剧本梗概、选择画风、描述主角,为AI生成分镜做准备
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            <span>AI辅助创作</span>
          </div>
        </div>

        {/* Tabs结构：基本信息/世界观/角色 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="basic" className="gap-2">
              <Sparkles className="h-4 w-4" />
              基本信息
            </TabsTrigger>
            <TabsTrigger value="worldview" className="gap-2">
              <Globe className="h-4 w-4" />
              世界观 (可选)
            </TabsTrigger>
            <TabsTrigger value="characters" className="gap-2">
              <Users className="h-4 w-4" />
              角色 (可选)
            </TabsTrigger>
          </TabsList>

          {/* 基本信息Tab */}
          <TabsContent value="basic">
            {/* 剧本输入 */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="summary" className="text-base font-semibold">
                  剧本梗概 *
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  简述故事情节、冲突、转折点(建议50-300字)
                </p>
                <Textarea
                  id="summary"
                  placeholder="示例: 在未来都市,黑客少女发现了政府隐藏的真相。她潜入数据中心,解开层层加密,最终揭露了控制人类意识的阴谋。在追击中,她必须在信任同伴与独自逃亡之间做出抉择..."
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  className="min-h-[180px] resize-none"
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    {formData.summary.length < 50 && (
                      <span className="text-yellow-500">
                        还需 {50 - formData.summary.length} 字
                      </span>
                    )}
                    {formData.summary.length >= 50 && formData.summary.length < 300 && (
                      <span className="text-green-500">✓ 长度合适</span>
                    )}
                    {formData.summary.length >= 300 && (
                      <span className="text-orange-500">建议精简至300字以内</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{formData.summary.length} / 300</p>
                </div>
              </div>

              {/* 风格选择 - 重构版 */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="style" className="text-base font-semibold">
                    画风选择 *
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    选择预设画风，或创建自定义画风
                  </p>
                  <div className="flex gap-2">
                    <Select value={styleConfig.presetId} onValueChange={handlePresetChange}>
                      <SelectTrigger id="style" className="h-12 flex-1">
                        <SelectValue placeholder="选择画风预设..." />
                      </SelectTrigger>
                      <SelectContent>
                        {/* 内置预设 */}
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          内置预设
                        </div>
                        {ART_STYLE_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            <div className="flex flex-col items-start py-1">
                              <span className="font-medium">{preset.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {preset.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        {/* 自定义画风 */}
                        {customStyles.length > 0 && (
                          <>
                            <div className="h-px bg-border my-1" />
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center justify-between">
                              <span>我的自定义画风</span>
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {customStyles.length}
                              </span>
                            </div>
                            {customStyles.map((style) => (
                              <SelectItem key={style.id} value={style.id}>
                                <div className="flex flex-col items-start py-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{style.name}</span>
                                    <span className="text-xs bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded">
                                      自定义
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {style.description}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {/* 当前臨时自定义 */}
                        {styleConfig.presetId === 'custom' && (
                          <>
                            <div className="h-px bg-border my-1" />
                            <SelectItem value="custom">
                              <div className="flex flex-col items-start py-1">
                                <span className="font-medium">当前自定义配置</span>
                                <span className="text-xs text-muted-foreground">未保存的修改</span>
                              </div>
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12"
                      onClick={handleOpenCreateDialog}
                      title="创建自定义画风"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* 当前选中自定义画风时显示编辑/删除按钮 */}
                  {isCustomStyleId(styleConfig.presetId) && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => {
                          const style = getCustomStyleById(styleConfig.presetId);
                          if (style) handleOpenEditDialog(style);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        编辑画风
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => {
                          setStyleToDelete(styleConfig.presetId);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </Button>
                    </div>
                  )}

                  {/* 当前为临时自定义时显示保存按钮 */}
                  {styleConfig.presetId === 'custom' && (
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-primary"
                        onClick={handleSaveCurrentAsCustom}
                      >
                        <Save className="h-3.5 w-3.5" />
                        保存为自定义画风
                      </Button>
                    </div>
                  )}
                </div>

                {/* 画风细节调整区 - 可展开 */}
                <Accordion type="single" collapsible className="border rounded-lg">
                  <AccordionItem value="style-details" className="border-0">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Palette className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">画风细节调整</span>
                        {styleConfig.presetId === 'custom' && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            已自定义
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      {/* 整体风格 */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5" />
                          整体风格
                        </Label>
                        <Input
                          value={styleConfig.baseStyle}
                          onChange={(e) => handleStyleFieldChange('baseStyle', e.target.value)}
                          placeholder="如: anime style, cel shaded, clean lineart"
                          className="font-mono text-sm"
                        />
                      </div>

                      {/* 渲染技法 */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Brush className="h-3.5 w-3.5" />
                          渲染技法
                        </Label>
                        <Input
                          value={styleConfig.technique}
                          onChange={(e) => handleStyleFieldChange('technique', e.target.value)}
                          placeholder="如: heavy impasto brushstrokes, watercolor wash"
                          className="font-mono text-sm"
                        />
                      </div>

                      {/* 色彩倾向 */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Palette className="h-3.5 w-3.5" />
                          色彩倾向
                        </Label>
                        <Input
                          value={styleConfig.colorPalette}
                          onChange={(e) => handleStyleFieldChange('colorPalette', e.target.value)}
                          placeholder="如: vibrant saturated colors, high contrast"
                          className="font-mono text-sm"
                        />
                      </div>

                      {/* 文化/时代特征 */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />
                          文化/时代特征
                        </Label>
                        <Input
                          value={styleConfig.culturalFeature}
                          onChange={(e) =>
                            handleStyleFieldChange('culturalFeature', e.target.value)
                          }
                          placeholder="如: Oriental aesthetics, Victorian era"
                          className="font-mono text-sm"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* 完整提示词预览 */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">完整画风提示词 (Full Prompt)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyFullPrompt}
                      className="h-7 gap-1.5"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          复制
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed break-all">
                    {styleConfig.fullPrompt}
                  </p>
                </div>
              </div>

              {/* 主角描述 */}
              <div className="space-y-2">
                <Label htmlFor="protagonist" className="text-base font-semibold">
                  主角描述 *
                </Label>
                <p className="text-sm text-muted-foreground mb-2">
                  描述主角的外貌特征、服装、性格(建议20-150字)
                </p>
                <Textarea
                  id="protagonist"
                  placeholder="示例: 18岁少女,银色短发,紫色赛博义眼。穿黑色机能夹克、破洞牛仔裤、高帮军靴。性格冷静理智但内心孤独,精通编程和黑客技术,右臂有发光电路纹身..."
                  value={formData.protagonist}
                  onChange={(e) => setFormData({ ...formData, protagonist: e.target.value })}
                  className="min-h-[140px] resize-none"
                />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    {formData.protagonist.length < 20 && (
                      <span className="text-yellow-500">
                        还需 {20 - formData.protagonist.length} 字
                      </span>
                    )}
                    {formData.protagonist.length >= 20 && (
                      <span className="text-green-500">✓ 描述充分</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formData.protagonist.length} / 150
                  </p>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t">
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleSaveDraft} disabled={!hasDraftChanges}>
                  保存草稿
                </Button>
                <span className="text-xs text-muted-foreground">
                  {lastSavedAt ? `已保存 ${lastSavedAt}` : '支持自动保存'}
                </span>
              </div>
              <Button onClick={handleProceed} disabled={!canProceed} className="gap-2">
                <span>确认并生成分镜</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* 提示信息 */}
            {!canProceed && (
              <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  💡 请完整填写所有必填项(标注*)后才能进入下一步
                </p>
              </div>
            )}
          </TabsContent>

          {/* 世界观Tab */}
          <TabsContent value="worldview">
            <WorldViewBuilder />
          </TabsContent>

          {/* 角色Tab */}
          <TabsContent value="characters">
            <CharacterManager projectId={currentProject.id} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* 示例参考卡片 */}
      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>填写建议</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            • <strong>剧本梗概</strong>: 包含起因、发展、高潮、结局的基本框架
          </li>
          <li>
            • <strong>画风选择</strong>: 考虑故事题材和目标受众
          </li>
          <li>
            • <strong>主角描述</strong>: 越具体越好,包括视觉特征和性格标签
          </li>
          <li>
            • <strong>一致性原则</strong>: 所有描述将被提取为"项目上下文",贯穿整个创作流程
          </li>
        </ul>
      </Card>

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
              <Label className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" />
                整体风格
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
              <Label className="flex items-center gap-2">
                <Brush className="h-3.5 w-3.5" />
                渲染技法
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
              <Label className="flex items-center gap-2">
                <Palette className="h-3.5 w-3.5" />
                色彩倾向
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
              <Label className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" />
                文化/时代特征
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
            <div className="p-3 rounded-lg bg-muted/50">
              <Label className="text-xs text-muted-foreground">合成提示词预览</Label>
              <p className="text-xs font-mono mt-1 break-all">
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
