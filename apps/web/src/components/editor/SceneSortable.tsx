// ==========================================
// 分镜拖拽排序组件
// ==========================================
// 功能：
// 1. 拖拽重新排序分镜
// 2. 可视化拖拽反馈
// 3. 批量拖拽
// 4. 撤销排序
// ==========================================

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene } from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, Check, X } from 'lucide-react';

interface SceneSortableProps {
  scenes: Scene[];
  onReorder: (scenes: Scene[]) => void | Promise<void>;
}

export function SceneSortable({ scenes, onReorder }: SceneSortableProps) {
  const [items, setItems] = useState(scenes);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        setHasChanges(true);
        return newItems;
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onReorder(items);
      setHasChanges(false);
    } catch {
      // 由调用方负责提示错误；这里保留修改，便于用户重试
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setItems(scenes);
    setHasChanges(false);
  };

  const handleUpdateSummary = (sceneId: string, summary: string) => {
    setItems((prev) => prev.map((s) => (s.id === sceneId ? { ...s, summary } : s)));
    setHasChanges(true);
  };

  return (
    <div className="space-y-4">
      {/* 提示和操作栏 */}
      {hasChanges && (
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            拖拽分镜以重新排序，排序完成后点击保存
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
              <X className="h-4 w-4 mr-1" />
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Check className="h-4 w-4 mr-1" />
              保存排序
            </Button>
          </div>
        </div>
      )}

      {/* 拖拽列表 */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((scene, index) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                index={index}
                onUpdateSummary={handleUpdateSummary}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// 可排序的分镜卡片
function SortableSceneCard({
  scene,
  index,
  onUpdateSummary,
}: {
  scene: Scene;
  index: number;
  onUpdateSummary: (sceneId: string, summary: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 ${isDragging ? 'shadow-lg z-50' : ''} hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center gap-3">
        {/* 拖拽手柄 */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* 序号 */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
          {index + 1}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <Textarea
            value={scene.summary}
            onChange={(e) => onUpdateSummary(scene.id, e.target.value)}
            className="min-h-[52px] resize-none text-sm font-medium leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant={
                scene.status === 'completed'
                  ? 'default'
                  : scene.status === 'needs_update'
                    ? 'destructive'
                    : 'secondary'
              }
              className={`text-xs ${scene.status === 'needs_update' ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
            >
              {getStatusText(scene.status)}
            </Badge>
            {scene.sceneDescription && (
              <span className="text-xs text-muted-foreground">有场景锚点</span>
            )}
            {scene.actionDescription && (
              <span className="text-xs text-muted-foreground">有动作描述</span>
            )}
            {scene.shotPrompt && <span className="text-xs text-muted-foreground">有提示词</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待处理',
    scene_generating: '生成中',
    scene_confirmed: '场景确认',
    action_generating: '生成中',
    action_confirmed: '动作确认',
    prompt_generating: '生成中',
    completed: '已完成',
    needs_update: '需更新',
  };
  return statusMap[status] || status;
}
