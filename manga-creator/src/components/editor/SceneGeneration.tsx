import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useStoryboardStore } from '@/stores/storyboardStore';
import { useConfigStore } from '@/stores/configStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  GripVertical, 
  Edit2, 
  Check,
  X,
  RotateCw,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { AIFactory } from '@/lib/ai/factory';
import { logAICall, updateLogWithResponse, updateLogWithError, updateLogProgress } from '@/lib/ai/debugLogger';
import { Scene, migrateOldStyleToConfig } from '@/types';
import { SceneSortable } from './SceneSortable';
import { useConfirm } from '@/hooks/use-confirm';

/**
 * 获取项目的完整画风提示词
 */
function getStyleFullPrompt(project: { style: string; artStyleConfig?: { fullPrompt: string } }): string {
  if (project.artStyleConfig?.fullPrompt) {
    return project.artStyleConfig.fullPrompt;
  }
  if (project.style) {
    return migrateOldStyleToConfig(project.style).fullPrompt;
  }
  return '';
}

export function SceneGeneration() {
  const { currentProject, updateProject } = useProjectStore();
  const { scenes, setScenes, addScene, updateScene, deleteScene, isGenerating, setGenerating, loadScenes } = useStoryboardStore();
  const { config, activeProfileId } = useConfigStore();
  const { confirm, ConfirmDialog } = useConfirm();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState('');
  const [sortDialogOpen, setSortDialogOpen] = useState(false);

  useEffect(() => {
    if (currentProject) {
      loadScenes(currentProject.id);
    }
  }, [currentProject?.id]);

  if (!currentProject) {
    return null;
  }

  // 使用 useMemo 缓存计算结果
  const canGenerate = useMemo(() => 
    currentProject.workflowState === 'DATA_COLLECTED' || 
    currentProject.workflowState === 'SCENE_LIST_EDITING' ||
    currentProject.workflowState === 'SCENE_LIST_CONFIRMED' ||
    currentProject.workflowState === 'SCENE_PROCESSING',
    [currentProject.workflowState]
  );
  
  // 是否已经确认过分镜列表（已进入细化流程）
  const isAlreadyConfirmed = useMemo(() => 
    currentProject.workflowState === 'SCENE_LIST_CONFIRMED' || 
    currentProject.workflowState === 'SCENE_PROCESSING' ||
    currentProject.workflowState === 'ALL_SCENES_COMPLETE',
    [currentProject.workflowState]
  );
  
  const canProceed = useMemo(() => 
    scenes.length >= 6 && 
    (currentProject.workflowState === 'SCENE_LIST_EDITING' || isAlreadyConfirmed),
    [scenes.length, currentProject.workflowState, isAlreadyConfirmed]
  );

  // 生成分镜列表
  const handleGenerate = async () => {
    if (!config) {
      setError('请先配置AI服务');
      return;
    }

    setGenerating(true);
    setError('');
    setGenerationProgress(0);
    let logId = '';

    try {
      const client = AIFactory.createClient(config);

      // 获取完整画风提示词
      const styleFullPrompt = getStyleFullPrompt(currentProject);

      // 调用AI生成分镜列表
      const prompt = `你是一位专业的分镜师。基于以下信息,将故事拆解为8-12个关键分镜节点:

**故事梗概**:
${currentProject.summary}

**画风**: ${styleFullPrompt}
**主角**: ${currentProject.protagonist}

**要求**:
1. 每个分镜用1句话概括(15-30字)
2. 覆盖起承转合的关键节点
3. 包含情绪转折和视觉冲击点
4. 适合单幅图像表现

**输出格式**(纯文本,每行一个分镜):
1. [分镜描述]
2. [分镜描述]
...

请开始生成:`;

      // 记录AI调用日志
      logId = logAICall('scene_list_generation', {
        skillName: 'scene-list-generator',
        promptTemplate: `你是一位专业的分镜师。基于以下信息,将故事拆解为8-12个关键分镜节点:

**故事梗概**:
{{summary}}

**画风**: {{styleFullPrompt}}
**主角**: {{protagonist}}

**要求**:
1. 每个分镜用1句话概括(15-30字)
2. 覆盖起承转合的关键节点
3. 包含情绪转折和视觉冲击点
4. 适合单幅图像表现

**输出格式**(纯文本,每行一个分镜):
1. [分镜描述]
2. [分镜描述]
...

请开始生成:`,
        filledPrompt: prompt,
        messages: [{ role: 'user', content: prompt }],
        context: {
          projectId: currentProject.id,
          projectTitle: currentProject.title,
          style: currentProject.style,
          protagonist: currentProject.protagonist,
          summary: currentProject.summary,
        },
        config: {
          provider: config.provider,
          model: config.model,
          maxTokens: 1000,
          profileId: activeProfileId || undefined,
        },
      });

      setGenerationProgress(20);
      
      // 更新进度
      updateLogProgress(logId, 30, '正在调用AI...');

      const response = await client.chat([
        { role: 'user', content: prompt }
      ]);

      setGenerationProgress(60);
      updateLogProgress(logId, 70, '正在解析响应...');

      // 更新日志响应
      updateLogWithResponse(logId, {
        content: response.content,
        tokenUsage: response.tokenUsage,
      });

      // 解析响应
      const lines = response.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^\d+\.\s+/.test(line))
        .map(line => line.replace(/^\d+\.\s+/, ''));

      if (lines.length < 6) {
        throw new Error('生成的分镜数量不足(少于6个)');
      }

      // 创建分镜对象
      const newScenes: Scene[] = lines.map((summary, index) => ({
        id: `scene_${Date.now()}_${index}`,
        projectId: currentProject.id,
        order: index + 1,
        summary: summary,
        sceneDescription: '',
        actionDescription: '',
        shotPrompt: '',
        motionPrompt: '',
        status: 'pending',
        notes: '',
      }));

      setScenes(currentProject.id, newScenes);
      
      updateProject(currentProject.id, {
        workflowState: 'SCENE_LIST_EDITING',
        updatedAt: new Date().toISOString(),
      });

      setGenerationProgress(100);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
      console.error('生成分镜失败:', err);
      // 记录错误日志
      if (err instanceof Error) {
        if (logId) updateLogWithError(logId, err.message);
      }
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setGenerationProgress(0);
      }, 500);
    }
  };

  // 手动添加分镜
  const handleAddScene = () => {
    addScene(currentProject.id, {
      projectId: currentProject.id,
      order: scenes.length + 1,
      summary: '新分镜',
      sceneDescription: '',
      actionDescription: '',
      shotPrompt: '',
      motionPrompt: '',
      notes: '',
      status: 'pending',
    });

    updateProject(currentProject.id, {
      workflowState: 'SCENE_LIST_EDITING',
      updatedAt: new Date().toISOString(),
    });
  };

  // 编辑分镜
  const startEdit = (scene: Scene) => {
    setEditingId(scene.id);
    setEditValue(scene.summary);
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      updateScene(currentProject.id, editingId, {
        summary: editValue.trim(),
      });
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  // 删除分镜
  const handleDelete = async (sceneId: string) => {
    const ok = await confirm({
      title: '确认删除分镜？',
      description: '此操作无法撤销，将删除该分镜的所有细化内容。',
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;
    deleteScene(currentProject.id, sceneId);
  };

  // 确认分镜列表
  const handleConfirm = () => {
    // 如果已经确认过，直接进入细化步骤，不需要重置状态
    if (isAlreadyConfirmed) {
      window.dispatchEvent(new CustomEvent('workflow:next-step'));
      return;
    }
    
    updateProject(currentProject.id, {
      workflowState: 'SCENE_LIST_CONFIRMED',
      currentSceneOrder: 1,
      updatedAt: new Date().toISOString(),
    });
    
    // 触发进入下一步
    window.dispatchEvent(new CustomEvent('workflow:next-step'));
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      <Card className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">分镜生成</h2>
            <p className="text-sm text-muted-foreground">
              AI将剧本拆解为8-12个关键分镜节点,你可以编辑、调整或手动添加
            </p>
          </div>
          {scenes.length > 0 && (
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              {scenes.length} 个分镜
            </div>
          )}
        </div>

        {/* 生成进度条 */}
        {isGenerating && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI正在分析剧本并生成分镜...</span>
            </div>
            <Progress value={generationProgress} className="h-2" />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* 分镜列表 */}
        {scenes.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-6">
              还没有分镜,点击下方按钮开始生成
            </p>
            <div className="flex gap-3 justify-center">
              <Button 
                onClick={handleGenerate} 
                disabled={!canGenerate || isGenerating}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                <span>AI生成分镜</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={handleAddScene}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>手动添加</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                className="group flex items-start gap-3 p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors"
              >
                {/* 序号 */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                  {index + 1}
                </div>

                {/* 内容区 */}
                <div className="flex-1 min-w-0">
                  {editingId === scene.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="min-h-[60px] resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit}>
                          <Check className="h-4 w-4 mr-1" />
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="h-4 w-4 mr-1" />
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{scene.summary}</p>
                  )}
                </div>

                {/* 操作按钮 */}
                {editingId !== scene.id && (
                  <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(scene)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(scene.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 底部操作栏 */}
        {scenes.length > 0 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="gap-2"
              >
                <RotateCw className="h-4 w-4" />
                <span>重新生成</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setSortDialogOpen(true)}
                disabled={scenes.length < 2 || isGenerating}
                className="gap-2"
              >
                <GripVertical className="h-4 w-4" />
                <span>拖拽排序</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={handleAddScene}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>添加分镜</span>
              </Button>
            </div>

            <Button 
              onClick={handleConfirm}
              disabled={!canProceed}
              className="gap-2"
            >
              <span>{isAlreadyConfirmed ? '继续细化' : '确认分镜列表'}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* 提示信息 */}
        {scenes.length > 0 && scenes.length < 6 && (
          <div className="mt-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              💡 建议至少6个分镜以保证故事完整性(当前{scenes.length}个)
            </p>
          </div>
        )}
      </Card>

      {/* 拖拽排序对话框 */}
      <Dialog open={sortDialogOpen} onOpenChange={setSortDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>拖拽排序分镜</DialogTitle>
          </DialogHeader>
          <SceneSortable
            scenes={scenes}
            onReorder={(nextScenes) => {
              if (!currentProject) return;
              setScenes(currentProject.id, nextScenes);
              setSortDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 操作提示 */}
      <Card className="p-6 bg-muted/30">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>分镜调整技巧</span>
        </h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong>数量建议</strong>: 8-12个分镜适合大多数短篇故事</li>
          <li>• <strong>关键节点</strong>: 确保包含开场、冲突、高潮、结局</li>
          <li>• <strong>视觉导向</strong>: 每个分镜应该是独立的画面,避免动作流程描述</li>
          <li>• <strong>情绪曲线</strong>: 注意分镜之间的情绪起伏和节奏变化</li>
        </ul>
      </Card>
    </div>
  );
}
