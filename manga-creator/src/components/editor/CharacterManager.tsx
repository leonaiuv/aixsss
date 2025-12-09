// ==========================================
// 角色管理组件
// ==========================================
// 功能：
// 1. 角色创建、编辑、删除
// 2. 一键生成完整角色卡（外观/性格/背景）
// 3. 定妆照提示词生成（MJ/SD/通用格式）
// 4. 画风自动传递
// ==========================================

import { useState, useEffect } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { AIFactory } from '@/lib/ai/factory';
import { PortraitPrompts } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Users,
  Sparkles,
  Link2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Camera,
  Wand2,
} from 'lucide-react';

// AI生成状态类型
type GeneratingState = 'idle' | 'generating_basic' | 'generating_portrait';

// 画风预设映射
const STYLE_LABELS: Record<string, string> = {
  anime: '日式动漫风格，赛璐珞着色，高饱和度色彩',
  realistic: '写实风格，真实光影，细腻质感，电影级画质',
  ink: '水墨国风，留白意境，笔触飘逸，东方美学',
  comic: '美式漫画风格，粗线条，网点阴影，动感构图',
  cyberpunk: '赛博朋克风格，霓虹光效，高科技，未来都市',
  fantasy: '奇幻风格，魔法元素，史诗场景，宏大叙事',
};

interface CharacterManagerProps {
  projectId: string;
}

export function CharacterManager({ projectId }: CharacterManagerProps) {
  const { characters, addCharacter, updateCharacter, deleteCharacter, loadCharacters } =
    useCharacterStore();
  
  // 加载角色数据
  useEffect(() => {
    loadCharacters(projectId);
  }, [projectId, loadCharacters]);
  const { config } = useConfigStore();
  const { currentProject } = useProjectStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    briefDescription: '',
    appearance: '',
    personality: '',
    background: '',
    themeColor: '#6366f1',
    portraitPrompts: undefined as PortraitPrompts | undefined,
  });
  const [generatingState, setGeneratingState] = useState<GeneratingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [dialogStep, setDialogStep] = useState<'basic' | 'portrait'>('basic');
  
  // 获取当前项目画风的完整描述
  const getStyleDescription = () => {
    if (!currentProject?.style) return '';
    return STYLE_LABELS[currentProject.style] || currentProject.style;
  };

  const projectCharacters = characters.filter((c) => c.projectId === projectId);

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    if (editingCharacter) {
      updateCharacter(projectId, editingCharacter, {
        ...formData,
        briefDescription: formData.briefDescription,
        portraitPrompts: formData.portraitPrompts,
      });
    } else {
      addCharacter(projectId, {
        ...formData,
        projectId,
        briefDescription: formData.briefDescription,
        portraitPrompts: formData.portraitPrompts,
        relationships: [],
        appearances: [],
      });
    }

    resetForm();
    setIsDialogOpen(false);
  };

  const handleEdit = (characterId: string) => {
    const character = projectCharacters.find((c) => c.id === characterId);
    if (character) {
      setFormData({
        name: character.name,
        briefDescription: character.briefDescription || '',
        appearance: character.appearance,
        personality: character.personality,
        background: character.background,
        themeColor: character.themeColor || '#6366f1',
        portraitPrompts: character.portraitPrompts,
      });
      setEditingCharacter(characterId);
      setDialogStep(character.portraitPrompts ? 'portrait' : 'basic');
      setIsDialogOpen(true);
    }
  };

  const handleDelete = (characterId: string) => {
    if (confirm('确定要删除这个角色吗？')) {
      deleteCharacter(projectId, characterId);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      briefDescription: '',
      appearance: '',
      personality: '',
      background: '',
      themeColor: '#6366f1',
      portraitPrompts: undefined,
    });
    setEditingCharacter(null);
    setError(null);
    setDialogStep('basic');
    setCopiedFormat(null);
  };

  // 复制提示词到剪贴板
  const handleCopyPrompt = async (format: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 一键生成基础信息（外观+性格+背景）
  const handleGenerateBasicInfo = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.briefDescription.trim()) {
      setError('请先输入角色简短描述');
      return;
    }

    setGeneratingState('generating_basic');
    setError(null);

    try {
      const client = AIFactory.createClient(config);
      const styleDesc = getStyleDescription();
      
      const projectContext = currentProject 
        ? `\n故事背景：${currentProject.summary}\n视觉风格：${styleDesc}\n主角特征：${currentProject.protagonist}`
        : '';

      const prompt = `你是一位专业的角色设计师。请根据以下简短描述，生成完整的角色设定。

角色简述：${formData.briefDescription}
${projectContext}

请按以下JSON格式输出（不要有任何其他内容）：
{
  "name": "角色名称",
  "appearance": "外观描述（100-200字，包含年龄、身材、发型、发色、眼睛、服装、配饰等具体可视化描述）",
  "personality": "性格特点（80-150字，包含主要性格、情感表达、互动模式、独特亮点）",
  "background": "背景故事（150-250字，包含出身、成长、关键事件、动机目标）"
}`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      // 解析JSON响应
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setFormData(prev => ({
          ...prev,
          name: parsed.name || prev.name || formData.briefDescription.split(/[，,]/)[0],
          appearance: parsed.appearance || '',
          personality: parsed.personality || '',
          background: parsed.background || '',
        }));
      } else {
        throw new Error('AI返回格式错误，请重试');
      }
    } catch (err) {
      console.error('生成角色信息失败:', err);
      setError(err instanceof Error ? err.message : '生成角色信息失败，请重试');
    } finally {
      setGeneratingState('idle');
    }
  };

  // 生成定妆照提示词（多格式）
  const handleGeneratePortraitPrompts = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    if (!formData.appearance.trim()) {
      setError('请先生成或填写外观描述');
      return;
    }

    setGeneratingState('generating_portrait');
    setError(null);

    try {
      const client = AIFactory.createClient(config);
      const styleDesc = getStyleDescription();

      const prompt = `你是一位专业的AI绘图提示词专家。请根据以下角色信息，生成「角色定妆照」提示词。

## 角色信息
名称：${formData.name}
外观：${formData.appearance}
性格：${formData.personality || '未设定'}

## 画风要求
${styleDesc}

## 定妆照要求
- 全身照，纯白背景
- 突出角色外观特征、服装细节、表情神态
- 适合作为角色参考图，保持角色一致性

请按以下JSON格式输出三种格式的提示词（不要有任何其他内容）：
{
  "midjourney": "Midjourney格式提示词（英文，包含画风、角色描述、全身照、白色背景、画质参数，末尾加 --ar 2:3 --v 6）",
  "stableDiffusion": "Stable Diffusion格式提示词（英文，正向提示词，包含画风、角色描述、全身照、白色背景、画质词如masterpiece, best quality等）",
  "general": "通用中文描述（可用于其他AI绘图工具，包含画风、完整角色描述、全身照、纯白背景）"
}`;

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      // 解析JSON响应
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setFormData(prev => ({
          ...prev,
          portraitPrompts: {
            midjourney: parsed.midjourney || '',
            stableDiffusion: parsed.stableDiffusion || '',
            general: parsed.general || '',
          },
        }));
        setDialogStep('portrait');
      } else {
        throw new Error('AI返回格式错误，请重试');
      }
    } catch (err) {
      console.error('生成定妆照提示词失败:', err);
      setError(err instanceof Error ? err.message : '生成定妆照提示词失败，请重试');
    } finally {
      setGeneratingState('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">角色管理</h2>
            <p className="text-sm text-muted-foreground">
              管理项目中的所有角色
            </p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              添加角色
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>
                {editingCharacter ? '编辑角色' : '添加新角色'}
              </DialogTitle>
              <DialogDescription>
                {dialogStep === 'basic' 
                  ? '输入角色简短描述，AI将自动生成完整角色卡'
                  : '查看并复制定妆照提示词'
                }
              </DialogDescription>
            </DialogHeader>

            {/* 步骤指示器 */}
            <div className="flex items-center gap-2 mb-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${dialogStep === 'basic' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Wand2 className="h-3 w-3" />
                1. 基础信息
              </div>
              <div className="h-px w-4 bg-border" />
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${dialogStep === 'portrait' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Camera className="h-3 w-3" />
                2. 定妆照提示词
              </div>
            </div>

            <ScrollArea className="max-h-[55vh] pr-4">
              {dialogStep === 'basic' ? (
                <div className="space-y-4">
                  {/* 简短描述输入 */}
                  <div className="space-y-2">
                    <Label htmlFor="briefDescription">角色简短描述 *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="briefDescription"
                        value={formData.briefDescription}
                        onChange={(e) =>
                          setFormData({ ...formData, briefDescription: e.target.value })
                        }
                        placeholder="例如：李明，30岁退役特种兵，沉默寡言"
                        className="flex-1"
                      />
                      <Button
                        onClick={handleGenerateBasicInfo}
                        disabled={generatingState !== 'idle' || !formData.briefDescription.trim()}
                      >
                        {generatingState === 'generating_basic' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4 mr-2" />
                            一键生成
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      输入角色名称和特征，AI将自动生成完整的外观、性格和背景
                    </p>
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}

                  {/* 画风提示 */}
                  {currentProject?.style && (
                    <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-md">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        当前画风：<span className="text-foreground font-medium">{getStyleDescription()}</span>
                      </span>
                    </div>
                  )}

                  <Separator />

                  {/* 角色名称 */}
                  <div className="space-y-2">
                    <Label htmlFor="name">角色名称</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="AI将自动提取或手动输入"
                    />
                  </div>

                  {/* 外观描述 */}
                  <div className="space-y-2">
                    <Label htmlFor="appearance">外观描述</Label>
                    <Textarea
                      id="appearance"
                      value={formData.appearance}
                      onChange={(e) =>
                        setFormData({ ...formData, appearance: e.target.value })
                      }
                      placeholder="年龄、身材、发型、服装等特征..."
                      rows={4}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 性格特点 */}
                  <div className="space-y-2">
                    <Label htmlFor="personality">性格特点</Label>
                    <Textarea
                      id="personality"
                      value={formData.personality}
                      onChange={(e) =>
                        setFormData({ ...formData, personality: e.target.value })
                      }
                      placeholder="性格特征、情感表达、互动模式..."
                      rows={3}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 背景故事 */}
                  <div className="space-y-2">
                    <Label htmlFor="background">背景故事</Label>
                    <Textarea
                      id="background"
                      value={formData.background}
                      onChange={(e) =>
                        setFormData({ ...formData, background: e.target.value })
                      }
                      placeholder="出身、经历、动机、目标..."
                      rows={4}
                      disabled={generatingState === 'generating_basic'}
                    />
                  </div>

                  {/* 主题色 */}
                  <div className="space-y-2">
                    <Label htmlFor="themeColor">主题色</Label>
                    <div className="flex gap-2">
                      <Input
                        id="themeColor"
                        type="color"
                        value={formData.themeColor}
                        onChange={(e) =>
                          setFormData({ ...formData, themeColor: e.target.value })
                        }
                        className="w-20"
                      />
                      <Input
                        value={formData.themeColor}
                        onChange={(e) =>
                          setFormData({ ...formData, themeColor: e.target.value })
                        }
                        placeholder="#6366f1"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* 定妆照提示词步骤 */
                <div className="space-y-4">
                  {/* 角色信息概览 */}
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: formData.themeColor }}
                      >
                        {formData.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-semibold">{formData.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-1">{formData.briefDescription}</p>
                      </div>
                    </div>
                  </div>

                  {/* 错误提示 */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}

                  {/* 生成定妆照按钮 */}
                  {!formData.portraitPrompts && (
                    <div className="flex justify-center py-4">
                      <Button
                        onClick={handleGeneratePortraitPrompts}
                        disabled={generatingState !== 'idle'}
                        size="lg"
                      >
                        {generatingState === 'generating_portrait' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            正在生成定妆照提示词...
                          </>
                        ) : (
                          <>
                            <Camera className="h-4 w-4 mr-2" />
                            生成定妆照提示词
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* 定妆照提示词展示 */}
                  {formData.portraitPrompts && (
                    <Tabs defaultValue="midjourney" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="midjourney">Midjourney</TabsTrigger>
                        <TabsTrigger value="sd">Stable Diffusion</TabsTrigger>
                        <TabsTrigger value="general">通用</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="midjourney" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Midjourney 格式</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyPrompt('mj', formData.portraitPrompts!.midjourney)}
                            >
                              {copiedFormat === 'mj' ? (
                                <><Check className="h-3 w-3 mr-1" />已复制</>
                              ) : (
                                <><Copy className="h-3 w-3 mr-1" />复制</>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm font-mono break-all">
                            {formData.portraitPrompts.midjourney}
                          </div>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="sd" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Stable Diffusion 格式</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyPrompt('sd', formData.portraitPrompts!.stableDiffusion)}
                            >
                              {copiedFormat === 'sd' ? (
                                <><Check className="h-3 w-3 mr-1" />已复制</>
                              ) : (
                                <><Copy className="h-3 w-3 mr-1" />复制</>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm font-mono break-all">
                            {formData.portraitPrompts.stableDiffusion}
                          </div>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="general" className="mt-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">通用格式</Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyPrompt('general', formData.portraitPrompts!.general)}
                            >
                              {copiedFormat === 'general' ? (
                                <><Check className="h-3 w-3 mr-1" />已复制</>
                              ) : (
                                <><Copy className="h-3 w-3 mr-1" />复制</>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-muted rounded-md text-sm">
                            {formData.portraitPrompts.general}
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}

                  {/* 重新生成按钮 */}
                  {formData.portraitPrompts && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGeneratePortraitPrompts}
                        disabled={generatingState !== 'idle'}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        重新生成
                      </Button>
                    </div>
                  )}

                  {/* 画风覆盖提示 */}
                  <div className="p-3 bg-yellow-500/10 rounded-md">
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      💡 如需为此角色使用不同画风，可在保存后编辑角色并手动修改提示词
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-between gap-2 pt-4">
              {dialogStep === 'portrait' && (
                <Button
                  variant="outline"
                  onClick={() => setDialogStep('basic')}
                >
                  返回修改
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setIsDialogOpen(false);
                  }}
                >
                  取消
                </Button>
                {dialogStep === 'basic' ? (
                  <Button
                    onClick={() => {
                      if (formData.appearance.trim()) {
                        setDialogStep('portrait');
                      }
                    }}
                    disabled={!formData.name.trim() || !formData.appearance.trim()}
                  >
                    下一步：生成定妆照
                  </Button>
                ) : (
                  <Button onClick={handleSubmit}>
                    {editingCharacter ? '保存' : '添加角色'}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 角色列表 */}
      {projectCharacters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">还没有角色</h3>
          <p className="text-sm text-muted-foreground mb-4">
            添加角色可以帮助AI更好地理解故事和生成内容
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projectCharacters.map((character) => (
            <div
              key={character.id}
              className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow"
            >
              {/* 角色头部 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: character.themeColor }}
                  >
                    {character.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold">{character.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {character.appearances.length} 次出场
                    </p>
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(character.id)}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(character.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <Separator className="my-3" />

              {/* 角色信息 */}
              <Tabs defaultValue="appearance" className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-8">
                  <TabsTrigger value="appearance" className="text-xs">
                    外观
                  </TabsTrigger>
                  <TabsTrigger value="personality" className="text-xs">
                    性格
                  </TabsTrigger>
                  <TabsTrigger value="background" className="text-xs">
                    背景
                  </TabsTrigger>
                  <TabsTrigger value="portrait" className="text-xs">
                    定妆照
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="appearance" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.appearance || '暂无外观描述'}
                  </p>
                </TabsContent>
                <TabsContent value="personality" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.personality || '暂无性格描述'}
                  </p>
                </TabsContent>
                <TabsContent value="background" className="mt-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {character.background || '暂无背景故事'}
                  </p>
                </TabsContent>
                <TabsContent value="portrait" className="mt-2">
                  {character.portraitPrompts ? (
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleCopyPrompt('mj-' + character.id, character.portraitPrompts!.midjourney)}
                        >
                          {copiedFormat === 'mj-' + character.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          MJ
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleCopyPrompt('sd-' + character.id, character.portraitPrompts!.stableDiffusion)}
                        >
                          {copiedFormat === 'sd-' + character.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          SD
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleCopyPrompt('general-' + character.id, character.portraitPrompts!.general)}
                        >
                          {copiedFormat === 'general-' + character.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                          通用
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {character.portraitPrompts.general}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      暂无定妆照提示词，<button
                        className="text-primary hover:underline"
                        onClick={() => handleEdit(character.id)}
                      >点击编辑生成</button>
                    </p>
                  )}
                </TabsContent>
              </Tabs>

              {/* 关系标签 */}
              {character.relationships.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {character.relationships.map((rel, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      {rel.relationshipType}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
