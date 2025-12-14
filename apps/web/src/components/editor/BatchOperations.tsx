// ==========================================
// 批量操作组件
// ==========================================
// 功能：
// 1. 批量生成分镜
// 2. 批量编辑
// 3. 批量导出
// 4. 批量删除
// ==========================================

import { Scene } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  CheckSquare,
  Play,
  Pause,
  SkipForward,
  Square,
  Download,
  Trash2,
  Edit2,
  Loader2,
} from 'lucide-react';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { useConfirm } from '@/hooks/use-confirm';

interface BatchOperationsProps {
  scenes: Scene[];
  onBatchGenerate: (sceneIds: string[], options: any) => Promise<void>;
  onBatchEdit: (sceneIds: string[], updates: any) => void;
  onBatchExport: (sceneIds: string[], format: string) => void;
  onBatchDelete: (sceneIds: string[]) => void;
}

export function BatchOperations({
  scenes,
  onBatchGenerate,
  onBatchEdit,
  onBatchExport,
  onBatchDelete,
}: BatchOperationsProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  // 使用全局状态
  const { batchOperations, updateBatchOperations, isBatchGenerating } = useAIProgressStore();

  const {
    selectedScenes,
    isProcessing,
    isPaused,
    cancelRequested,
    progress,
    currentScene,
    operationType,
  } = batchOperations;

  const toggleScene = (sceneId: string) => {
    const newSelected = new Set(selectedScenes);
    if (newSelected.has(sceneId)) {
      newSelected.delete(sceneId);
    } else {
      newSelected.add(sceneId);
    }
    updateBatchOperations({
      selectedScenes: newSelected,
      totalScenes: newSelected.size,
    });
  };

  const toggleAll = () => {
    if (selectedScenes.size === scenes.length) {
      updateBatchOperations({
        selectedScenes: new Set(),
        totalScenes: 0,
      });
    } else {
      updateBatchOperations({
        selectedScenes: new Set(scenes.map((s) => s.id)),
        totalScenes: scenes.length,
      });
    }
  };

  const handleBatchGenerate = async () => {
    if (selectedScenes.size === 0) return;
    // 直接调用外部函数，状态由 Editor.tsx 管理
    const sceneIds = Array.from(selectedScenes);
    await onBatchGenerate(sceneIds, {});
  };

  const handleBatchExport = (format: string) => {
    if (selectedScenes.size === 0) return;
    onBatchExport(Array.from(selectedScenes), format);
    updateBatchOperations({
      selectedScenes: new Set(),
      totalScenes: 0,
    });
  };

  const handleBatchDelete = async () => {
    if (selectedScenes.size === 0) return;

    const ok = await confirm({
      title: '确认批量删除分镜？',
      description: `将删除选中的 ${selectedScenes.size} 个分镜，此操作不可撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;

    onBatchDelete(Array.from(selectedScenes));
    updateBatchOperations({
      selectedScenes: new Set(),
      totalScenes: 0,
    });
  };

  const handlePauseToggle = () => {
    if (cancelRequested) return;
    updateBatchOperations({ isPaused: !isPaused });
  };

  const handleCancel = async () => {
    if (!isProcessing && !isBatchGenerating) return;
    if (cancelRequested) return;

    const ok = await confirm({
      title: '确认停止批量生成？',
      description: '会在当前AI请求完成后停止；已生成的内容会保留。',
      confirmText: '停止',
      cancelText: '继续',
      destructive: true,
    });
    if (!ok) return;

    updateBatchOperations({
      cancelRequested: true,
      isPaused: false,
      statusMessage: '正在取消...',
    });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CheckSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">批量操作</h2>
            <p className="text-sm text-muted-foreground">已选择 {selectedScenes.size} 个分镜</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {selectedScenes.size === scenes.length ? '取消全选' : '全选'}
          </Button>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleBatchGenerate}
          disabled={selectedScenes.size === 0 || isProcessing || isBatchGenerating}
        >
          {isProcessing || isBatchGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              批量生成
            </>
          )}
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={selectedScenes.size === 0}>
              <Download className="h-4 w-4 mr-2" />
              批量导出
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>批量导出</DialogTitle>
              <DialogDescription>
                选择导出格式，将导出 {selectedScenes.size} 个分镜
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>导出格式</Label>
                <Select onValueChange={handleBatchExport}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择格式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="markdown">Markdown</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="txt">纯文本</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="destructive"
          onClick={handleBatchDelete}
          disabled={selectedScenes.size === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          批量删除
        </Button>

        {isProcessing && (
          <Button variant="outline" onClick={handlePauseToggle} disabled={cancelRequested}>
            {isPaused ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                继续
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                暂停
              </>
            )}
          </Button>
        )}

        {(isProcessing || isBatchGenerating) && (
          <Button variant="destructive" onClick={handleCancel} disabled={cancelRequested}>
            <Square className="h-4 w-4 mr-2" />
            {cancelRequested ? '取消中...' : '停止'}
          </Button>
        )}
      </div>

      {/* 进度条 */}
      {(isProcessing || isBatchGenerating) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              正在处理 {currentScene} / {batchOperations.totalScenes || selectedScenes.size}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
          {batchOperations.statusMessage && (
            <p className="text-sm text-muted-foreground">{batchOperations.statusMessage}</p>
          )}
          {cancelRequested && (
            <p className="text-sm text-muted-foreground">
              已发起取消请求，将在当前分镜处理完成后停止。
            </p>
          )}
          {isPaused && <p className="text-sm text-yellow-600">已暂停，点击继续按钮恢复</p>}
        </div>
      )}

      <Separator />

      {/* 分镜列表 */}
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-2">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                selectedScenes.has(scene.id) ? 'border-primary bg-primary/5' : 'border-border'
              } hover:border-primary/50 transition-colors cursor-pointer`}
              onClick={() => toggleScene(scene.id)}
            >
              <Checkbox
                checked={selectedScenes.has(scene.id)}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => toggleScene(scene.id)}
                aria-label={`选择分镜 ${index + 1}`}
              />

              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {index + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{scene.summary}</p>
                <p className="text-xs text-muted-foreground">状态: {getStatusText(scene.status)}</p>
              </div>

              {scene.status === 'completed' && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/10 text-green-600 flex items-center justify-center">
                  <CheckSquare className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
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
