// ==========================================
// 角色管理组件
// ==========================================
// 功能：
// 1. 角色创建、编辑、删除
// 2. 一键生成完整角色卡（外观/性格/背景）
// 3. 定妆照提示词生成（MJ/SD/通用格式）
// 4. 画风自动传递
// 5. 级联更新影响分析
// ==========================================

import { useState, useEffect, useCallback } from 'react';
import { useCharacterStore } from '@/stores/characterStore';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { useCustomStyleStore } from '@/stores/customStyleStore';
import { AIFactory } from '@/lib/ai/factory';
import { logAICall, updateLogWithResponse, updateLogWithError } from '@/lib/ai/debugLogger';
import { PortraitPrompts, ART_STYLE_PRESETS, migrateOldStyleToConfig, Project, Character, isCustomStyleId } from '@/types';
import {
  analyzeCharacterImpact,
  CharacterChange,
  CharacterAppearance,
  generateUpdateSummary,
  markScenesNeedUpdate,
} from '@/lib/ai/cascadeUpdater';
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
  AlertTriangle,
} from 'lucide-react';

// AI生成状态类型
type GeneratingState = 'idle' | 'generating_basic' | 'generating_portrait';

// 角色生成任务接口
interface CharacterGenerationTask {
  characterId?: string;  // 编辑时的角色ID
  briefDescription: string;
  taskId?: string;  // aiProgressStore 中的任务ID
  status: GeneratingState;
  error?: string;
}

// 批量生成状态接口
interface BatchGenerationState {
  isProcessing: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalCount: number;
  completedIds: string[];
  failedIds: string[];
  queue: Array<{ characterId: string; briefDescription: string }>;
}

/**
 * 获取当前项目的完整画风提示词
 */
function getProjectStylePrompt(currentProject: Project | null): string {
  if (!currentProject) return '';
  
  // 优先使用新版 artStyleConfig
  if (currentProject.artStyleConfig?.fullPrompt) {
    return currentProject.artStyleConfig.fullPrompt;
  }
  
  // 回退：从旧版 style 迁移
  if (currentProject.style) {
    const migratedConfig = migrateOldStyleToConfig(currentProject.style);
    return migratedConfig.fullPrompt;
  }
  
  return '';
}

/**
 * 获取画风标签名称
 */
function getStyleLabel(currentProject: Project | null): string {
  if (!currentProject) return '';
  
  if (currentProject.artStyleConfig) {
    const presetId = currentProject.artStyleConfig.presetId;
    // 检查是否为自定义画风
    if (isCustomStyleId(presetId)) {
      const customStyle = useCustomStyleStore.getState().getCustomStyleById(presetId);
      return customStyle ? customStyle.name : '自定义画风';
    }
    const preset = ART_STYLE_PRESETS.find(p => p.id === presetId);
    return preset ? preset.label : '自定义画风';
  }
  
  if (currentProject.style) {
    const migratedConfig = migrateOldStyleToConfig(currentProject.style);
    const preset = ART_STYLE_PRESETS.find(p => p.id === migratedConfig.presetId);
    return preset ? preset.label : currentProject.style;
  }
  
  return '';
}

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
  const { scenes, updateScene: updateSceneInStore } = useStoryboardStore();
  
  // AI进度追踪 Store
  const { 
    addTask, 
    updateProgress, 
    completeTask, 
    failTask,
    showPanel,
  } = useAIProgressStore();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    briefDescription: '',
    appearance: '',
    personality: '',
    background: '',
    themeColor: '#6366f1',
    primaryColor: '',
    secondaryColor: '',
    portraitPrompts: undefined as PortraitPrompts | undefined,
  });
  const [generatingState, setGeneratingState] = useState<GeneratingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [dialogStep, setDialogStep] = useState<'basic' | 'portrait'>('basic');
  
  // 批量生成状态
  const [batchGeneration, setBatchGeneration] = useState<BatchGenerationState>({
    isProcessing: false,
    isPaused: false,
    currentIndex: 0,
    totalCount: 0,
    completedIds: [],
    failedIds: [],
    queue: [],
  });
  
  // 当前生成任务ID（用于追踪和取消）
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  
  // 级联更新相关状态
  const [cascadeDialogOpen, setCascadeDialogOpen] = useState(false);
  const [cascadeImpactSummary, setCascadeImpactSummary] = useState('');
  const [pendingCascadeUpdate, setPendingCascadeUpdate] = useState<{
    characterId: string;
    affectedSceneIds: string[];
  } | null>(null);
  
  // 获取当前项目画风的完整描述（英文提示词）
  const getStyleDescription = () => {
    return getProjectStylePrompt(currentProject);
  };
  
  // 获取画风标签（中文名称）
  const getStyleLabelText = () => {
    return getStyleLabel(currentProject);
  };

  const projectCharacters = characters.filter((c) => c.projectId === projectId);

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    if (editingCharacter) {
      // 获取原角色数据，用于比较变更
      const originalCharacter = projectCharacters.find(c => c.id === editingCharacter);
      
      updateCharacter(projectId, editingCharacter, {
        ...formData,
        briefDescription: formData.briefDescription,
        portraitPrompts: formData.portraitPrompts,
      });

      // 分析级联影响
      if (originalCharacter && scenes.length > 0) {
        const changedFields: CharacterChange['field'][] = [];
        if (originalCharacter.appearance !== formData.appearance) changedFields.push('appearance');
        if (originalCharacter.personality !== formData.personality) changedFields.push('personality');
        if (originalCharacter.name !== formData.name) changedFields.push('name');
        if (originalCharacter.primaryColor !== formData.primaryColor) changedFields.push('primaryColor');
        if (originalCharacter.secondaryColor !== formData.secondaryColor) changedFields.push('secondaryColor');

        if (changedFields.length > 0) {
          // 构建角色出场关系（简化版：假设角色在所有分镜中可能出现）
          const appearances: CharacterAppearance[] = scenes.map(s => ({
            sceneId: s.id,
            characterId: editingCharacter,
          }));

          // 只分析第一个变更的字段（简化）
          const change: CharacterChange = {
            characterId: editingCharacter,
            field: changedFields[0],
          };

          const impact = analyzeCharacterImpact(change, scenes, appearances);

          if (impact.affectedScenes.length > 0) {
            const summary = generateUpdateSummary(impact);
            setCascadeImpactSummary(summary);
            setPendingCascadeUpdate({
              characterId: editingCharacter,
              affectedSceneIds: impact.affectedScenes.map(s => s.id),
            });
            setCascadeDialogOpen(true);
          }
        }
      }
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

  // 确认级联更新
  const handleConfirmCascadeUpdate = () => {
    if (pendingCascadeUpdate) {
      // 标记受影响的分镜为需要更新
      const updatedScenes = markScenesNeedUpdate(scenes, pendingCascadeUpdate.affectedSceneIds);
      updatedScenes.forEach(scene => {
        if (pendingCascadeUpdate.affectedSceneIds.includes(scene.id)) {
          updateSceneInStore(projectId, scene.id, { status: 'needs_update' });
        }
      });
    }
    setCascadeDialogOpen(false);
    setPendingCascadeUpdate(null);
  };

  // 跳过级联更新
  const handleSkipCascadeUpdate = () => {
    setCascadeDialogOpen(false);
    setPendingCascadeUpdate(null);
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
        primaryColor: character.primaryColor || '',
        secondaryColor: character.secondaryColor || '',
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
      primaryColor: '',
      secondaryColor: '',
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

  // 一键生成基础信息（外观+性格+背景）- 集成进度追踪
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
    
    // 创建AI任务并显示开发者面板
    const taskId = addTask({
      type: 'character_basic_info',
      title: `生成角色信息: ${formData.briefDescription.slice(0, 20)}...`,
      description: `根据简短描述生成完整角色卡（外观/性格/背景）`,
      status: 'running',
      priority: 'normal',
      progress: 0,
      projectId,
      maxRetries: 3,
    });
    setCurrentTaskId(taskId);
    showPanel();

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

      // 记录日志
      const logId = logAICall('character_basic_info', {
        promptTemplate: prompt,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId,
          briefDescription: formData.briefDescription,
          style: styleDesc,
        },
        config: {
          provider: config.provider,
          model: config.model,
        },
      });
      
      updateProgress(taskId, 30, '正在调用AI生成...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
      updateProgress(taskId, 80, '正在解析响应...');

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
        
        // 更新日志和任务状态
        updateLogWithResponse(logId, { content: response.content });
        completeTask(taskId, { content: response.content });
      } else {
        throw new Error('AI返回格式错误，请重试');
      }
    } catch (err) {
      console.error('生成角色信息失败:', err);
      const errorMsg = err instanceof Error ? err.message : '生成角色信息失败，请重试';
      setError(errorMsg);
      failTask(taskId, {
        message: errorMsg,
        retryable: true,
      });
    } finally {
      setGeneratingState('idle');
      setCurrentTaskId(null);
    }
  };

  // 生成定妆照提示词（多格式）- 集成进度追踪
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
    
    // 创建AI任务并显示开发者面板
    const taskId = addTask({
      type: 'character_portrait',
      title: `生成定妆照: ${formData.name || '未命名角色'}`,
      description: `为角色生成MJ/SD/通用格式的定妆照提示词`,
      status: 'running',
      priority: 'normal',
      progress: 0,
      projectId,
      maxRetries: 3,
    });
    setCurrentTaskId(taskId);
    showPanel();

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

      // 记录日志
      const logId = logAICall('character_portrait', {
        promptTemplate: prompt,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId,
          characterName: formData.name,
          appearance: formData.appearance,
          style: styleDesc,
        },
        config: {
          provider: config.provider,
          model: config.model,
        },
      });
      
      updateProgress(taskId, 30, '正在调用AI生成提示词...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);
      
      updateProgress(taskId, 80, '正在解析响应...');

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
        
        // 更新日志和任务状态
        updateLogWithResponse(logId, { content: response.content });
        completeTask(taskId, { content: response.content });
      } else {
        throw new Error('AI返回格式错误，请重试');
      }
    } catch (err) {
      console.error('生成定妆照提示词失败:', err);
      const errorMsg = err instanceof Error ? err.message : '生成定妆照提示词失败，请重试';
      setError(errorMsg);
      failTask(taskId, {
        message: errorMsg,
        retryable: true,
      });
    } finally {
      setGeneratingState('idle');
      setCurrentTaskId(null);
    }
  };

  // 批量生成多个角色的定妆照提示词
  const handleBatchGeneratePortraits = useCallback(async (characterIds: string[]) => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }
    
    const charactersToProcess = projectCharacters.filter(
      c => characterIds.includes(c.id) && c.appearance && !c.portraitPrompts
    );
    
    if (charactersToProcess.length === 0) {
      setError('没有需要生成定妆照的角色');
      return;
    }
    
    setBatchGeneration({
      isProcessing: true,
      isPaused: false,
      currentIndex: 0,
      totalCount: charactersToProcess.length,
      completedIds: [],
      failedIds: [],
      queue: charactersToProcess.map(c => ({
        characterId: c.id,
        briefDescription: c.briefDescription || c.name,
      })),
    });
    showPanel();
    
    const client = AIFactory.createClient(config);
    const styleDesc = getStyleDescription();
    
    for (let i = 0; i < charactersToProcess.length; i++) {
      const character = charactersToProcess[i];
      
      setBatchGeneration(prev => ({
        ...prev,
        currentIndex: i + 1,
      }));
      
      const taskId = addTask({
        type: 'character_portrait',
        title: `批量生成定妆照 [${i + 1}/${charactersToProcess.length}]: ${character.name}`,
        description: `为角色 ${character.name} 生成定妆照提示词`,
        status: 'running',
        priority: 'normal',
        progress: 0,
        projectId,
        maxRetries: 2,
      });
      
      try {
        const prompt = `你是一位专业的AI绘图提示词专家。请根据以下角色信息，生成「角色定妆照」提示词。

## 角色信息
名称：${character.name}
外观：${character.appearance}
性格：${character.personality || '未设定'}

## 画风要求
${styleDesc}

## 定妆照要求
- 全身照，纯白背景
- 突出角色外观特征、服装细节、表情神态

请按以下JSON格式输出（不要有任何其他内容）：
{
  "midjourney": "Midjourney格式提示词 --ar 2:3 --v 6",
  "stableDiffusion": "Stable Diffusion格式提示词",
  "general": "通用中文描述"
}`;
        
        const logId = logAICall('character_portrait', {
          promptTemplate: prompt,
          filledPrompt: prompt,
          messages: [{ role: 'user', content: prompt }],
          context: { projectId, characterName: character.name },
          config: { provider: config.provider, model: config.model },
        });
        
        updateProgress(taskId, 30, '正在调用AI...');
        
        const response = await client.chat([{ role: 'user', content: prompt }]);
        
        updateProgress(taskId, 80, '正在解析...');
        
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const prompts: PortraitPrompts = {
            midjourney: parsed.midjourney || '',
            stableDiffusion: parsed.stableDiffusion || '',
            general: parsed.general || '',
          };
          
          updateCharacter(projectId, character.id, { portraitPrompts: prompts });
          updateLogWithResponse(logId, { content: response.content });
          completeTask(taskId, { content: response.content });
          
          setBatchGeneration(prev => ({
            ...prev,
            completedIds: [...prev.completedIds, character.id],
          }));
        } else {
          throw new Error('AI返回格式错误');
        }
      } catch (err) {
        console.error(`批量生成失败 [${character.name}]:`, err);
        failTask(taskId, {
          message: err instanceof Error ? err.message : '生成失败',
          retryable: true,
        });
        setBatchGeneration(prev => ({
          ...prev,
          failedIds: [...prev.failedIds, character.id],
        }));
      }
      
      // 批量操作间添加短暂延迟，避免请求过快
      if (i < charactersToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setBatchGeneration(prev => ({
      ...prev,
      isProcessing: false,
    }));
  }, [config, projectCharacters, projectId, addTask, updateProgress, completeTask, failTask, updateCharacter, showPanel]);

  // 为所有缺少定妆照的角色批量生成
  const handleBatchGenerateAllMissingPortraits = useCallback(() => {
    const missingPortraitIds = projectCharacters
      .filter(c => c.appearance && !c.portraitPrompts)
      .map(c => c.id);
    
    if (missingPortraitIds.length > 0) {
      handleBatchGeneratePortraits(missingPortraitIds);
    } else {
      setError('所有角色都已有定妆照提示词');
    }
  }, [projectCharacters, handleBatchGeneratePortraits]);

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
          
          {/* 批量生成定妆照按钮 */}
          {projectCharacters.filter(c => c.appearance && !c.portraitPrompts).length > 0 && (
            <Button
              variant="outline"
              onClick={handleBatchGenerateAllMissingPortraits}
              disabled={batchGeneration.isProcessing || !config}
              className="ml-2"
            >
              {batchGeneration.isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  批量生成中 ({batchGeneration.currentIndex}/{batchGeneration.totalCount})
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  批量生成定妆照 ({projectCharacters.filter(c => c.appearance && !c.portraitPrompts).length})
                </>
              )}
            </Button>
          )}
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
                        当前画风：<span className="text-foreground font-medium">{getStyleLabelText()}</span>
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

                  {/* 角色色彩设置 */}
                  <div className="space-y-4">
                    <Label className="text-base font-medium">角色色彩</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {/* 主色 */}
                      <div className="space-y-2">
                        <Label htmlFor="primaryColor" className="text-sm">主色</Label>
                        <div className="flex gap-2">
                          <Input
                            id="primaryColor"
                            type="color"
                            value={formData.primaryColor || '#6366f1'}
                            onChange={(e) =>
                              setFormData({ ...formData, primaryColor: e.target.value })
                            }
                            className="w-12 h-9 p-1"
                          />
                          <Input
                            value={formData.primaryColor}
                            onChange={(e) =>
                              setFormData({ ...formData, primaryColor: e.target.value })
                            }
                            placeholder="#6366f1"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">角色的主要色彩（服装/发色）</p>
                      </div>
                      {/* 辅色 */}
                      <div className="space-y-2">
                        <Label htmlFor="secondaryColor" className="text-sm">辅色</Label>
                        <div className="flex gap-2">
                          <Input
                            id="secondaryColor"
                            type="color"
                            value={formData.secondaryColor || '#a855f7'}
                            onChange={(e) =>
                              setFormData({ ...formData, secondaryColor: e.target.value })
                            }
                            className="w-12 h-9 p-1"
                          />
                          <Input
                            value={formData.secondaryColor}
                            onChange={(e) =>
                              setFormData({ ...formData, secondaryColor: e.target.value })
                            }
                            placeholder="#a855f7"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">角色的辅助色彩（配饰/点缀）</p>
                      </div>
                    </div>
                    {/* 色彩预览 */}
                    {(formData.primaryColor || formData.secondaryColor) && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                        <span className="text-xs text-muted-foreground">预览:</span>
                        <div className="flex gap-1">
                          {formData.primaryColor && (
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: formData.primaryColor }}
                              title="主色"
                            />
                          )}
                          {formData.secondaryColor && (
                            <div
                              className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: formData.secondaryColor }}
                              title="辅色"
                            />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          色彩将传递给AI生成一致的角色外观
                        </span>
                      </div>
                    )}
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

      {/* 级联更新提示对话框 */}
      <AlertDialog open={cascadeDialogOpen} onOpenChange={setCascadeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              角色修改影响分析
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>您修改了角色的关键信息，这可能会影响已生成的分镜内容。</p>
              <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap">
                {cascadeImpactSummary}
              </div>
              <p className="text-xs text-muted-foreground">
                选择“标记更新”将受影响的分镜标记为“需要更新”状态，您可以稍后在分镜细化页面重新生成。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipCascadeUpdate}>
              跳过
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCascadeUpdate}>
              标记更新
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
