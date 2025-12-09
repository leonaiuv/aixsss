// ==========================================
// 分镜对比组件
// ==========================================
// 功能：
// 1. 并排对比两个分镜
// 2. 高亮差异
// 3. 合并内容
// 4. 版本对比
// ==========================================

import { useState } from 'react';
import { Scene } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GitCompare, ArrowRight, Check, Copy } from 'lucide-react';

interface SceneComparisonProps {
  scenes: Scene[];
  onMerge?: (targetId: string, sourceContent: Partial<Scene>) => void;
}

export function SceneComparison({ scenes, onMerge }: SceneComparisonProps) {
  const [leftSceneId, setLeftSceneId] = useState<string>(scenes[0]?.id || '');
  const [rightSceneId, setRightSceneId] = useState<string>(
    scenes[1]?.id || ''
  );

  const leftScene = scenes.find((s) => s.id === leftSceneId);
  const rightScene = scenes.find((s) => s.id === rightSceneId);

  const handleCopyToLeft = (field: keyof Scene) => {
    if (leftScene && rightScene && onMerge) {
      onMerge(leftScene.id, { [field]: rightScene[field] });
    }
  };

  const handleCopyToRight = (field: keyof Scene) => {
    if (leftScene && rightScene && onMerge) {
      onMerge(rightScene.id, { [field]: leftScene[field] });
    }
  };

  if (scenes.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitCompare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">需要至少2个分镜</h3>
        <p className="text-sm text-muted-foreground">
          创建更多分镜后才能使用对比功能
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <GitCompare className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">分镜对比</h2>
          <p className="text-sm text-muted-foreground">
            并排对比两个分镜，发现差异并合并内容
          </p>
        </div>
      </div>

      {/* 选择器 */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Select value={leftSceneId} onValueChange={setLeftSceneId}>
            <SelectTrigger>
              <SelectValue placeholder="选择左侧分镜" />
            </SelectTrigger>
            <SelectContent>
              {scenes.map((scene, index) => (
                <SelectItem key={scene.id} value={scene.id}>
                  分镜 {index + 1}: {scene.summary.slice(0, 30)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-shrink-0">
          <ArrowRight className="h-6 w-6 text-muted-foreground" />
        </div>

        <div className="flex-1">
          <Select value={rightSceneId} onValueChange={setRightSceneId}>
            <SelectTrigger>
              <SelectValue placeholder="选择右侧分镜" />
            </SelectTrigger>
            <SelectContent>
              {scenes.map((scene, index) => (
                <SelectItem key={scene.id} value={scene.id}>
                  分镜 {index + 1}: {scene.summary.slice(0, 30)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 对比内容 */}
      {leftScene && rightScene && (
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">概要</TabsTrigger>
            <TabsTrigger value="scene">场景</TabsTrigger>
            <TabsTrigger value="action">动作</TabsTrigger>
            <TabsTrigger value="prompt">提示词</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <ComparisonField
              label="分镜概要"
              leftContent={leftScene.summary}
              rightContent={rightScene.summary}
              onCopyToLeft={() => handleCopyToLeft('summary')}
              onCopyToRight={() => handleCopyToRight('summary')}
            />
          </TabsContent>

          <TabsContent value="scene" className="space-y-4">
            <ComparisonField
              label="场景描述"
              leftContent={leftScene.sceneDescription || '(未生成)'}
              rightContent={rightScene.sceneDescription || '(未生成)'}
              onCopyToLeft={() => handleCopyToLeft('sceneDescription')}
              onCopyToRight={() => handleCopyToRight('sceneDescription')}
            />
          </TabsContent>

          <TabsContent value="action" className="space-y-4">
            <ComparisonField
              label="动作描述"
              leftContent={leftScene.actionDescription || '(未生成)'}
              rightContent={rightScene.actionDescription || '(未生成)'}
              onCopyToLeft={() => handleCopyToLeft('actionDescription')}
              onCopyToRight={() => handleCopyToRight('actionDescription')}
            />
          </TabsContent>

          <TabsContent value="prompt" className="space-y-4">
            <ComparisonField
              label="提示词"
              leftContent={leftScene.shotPrompt || '(未生成)'}
              rightContent={rightScene.shotPrompt || '(未生成)'}
              onCopyToLeft={() => handleCopyToLeft('shotPrompt')}
              onCopyToRight={() => handleCopyToRight('shotPrompt')}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* 统计信息 */}
      {leftScene && rightScene && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-3">左侧分镜</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">状态</span>
                <Badge variant="outline">{getStatusText(leftScene.status)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">场景描述</span>
                <span>
                  {leftScene.sceneDescription ? '已生成' : '未生成'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">动作描述</span>
                <span>
                  {leftScene.actionDescription ? '已生成' : '未生成'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">提示词</span>
                <span>{leftScene.shotPrompt ? '已生成' : '未生成'}</span>
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-3">右侧分镜</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">状态</span>
                <Badge variant="outline">{getStatusText(rightScene.status)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">场景描述</span>
                <span>
                  {rightScene.sceneDescription ? '已生成' : '未生成'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">动作描述</span>
                <span>
                  {rightScene.actionDescription ? '已生成' : '未生成'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">提示词</span>
                <span>{rightScene.shotPrompt ? '已生成' : '未生成'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 对比字段组件
function ComparisonField({
  label,
  leftContent,
  rightContent,
  onCopyToLeft,
  onCopyToRight,
}: {
  label: string;
  leftContent: string;
  rightContent: string;
  onCopyToLeft: () => void;
  onCopyToRight: () => void;
}) {
  const isDifferent = leftContent !== rightContent;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{label}</h4>
        {isDifferent && (
          <Badge variant="secondary" className="text-xs">
            内容不同
          </Badge>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 左侧 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">左侧</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyToRight}
              disabled={!isDifferent}
            >
              <Copy className="h-3 w-3 mr-1" />
              复制到右侧
            </Button>
          </div>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            <p
              className={`text-sm whitespace-pre-wrap ${
                !leftContent || leftContent === '(未生成)'
                  ? 'text-muted-foreground italic'
                  : ''
              }`}
            >
              {leftContent}
            </p>
          </ScrollArea>
        </div>

        {/* 右侧 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">右侧</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyToLeft}
              disabled={!isDifferent}
            >
              <Copy className="h-3 w-3 mr-1" />
              复制到左侧
            </Button>
          </div>
          <ScrollArea className="h-[200px] w-full rounded-md border p-4">
            <p
              className={`text-sm whitespace-pre-wrap ${
                !rightContent || rightContent === '(未生成)'
                  ? 'text-muted-foreground italic'
                  : ''
              }`}
            >
              {rightContent}
            </p>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待处理',
    scene_generating: '生成场景中',
    scene_confirmed: '场景已确认',
    action_generating: '生成动作中',
    action_confirmed: '动作已确认',
    prompt_generating: '生成提示词中',
    completed: '已完成',
    needs_update: '需要更新',
  };
  return statusMap[status] || status;
}
