// ==========================================
// 版本历史组件
// ==========================================
// 功能：
// 1. 显示项目和分镜的版本历史
// 2. 版本对比
// 3. 版本恢复
// 4. 版本标注
// ==========================================

import { useState } from 'react';
import { useVersionStore } from '@/stores/versionStore';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { History, Clock, RotateCcw, Tag, GitBranch, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface VersionHistoryProps {
  projectId: string;
  targetId?: string;
  targetType?: 'project' | 'scene';
  onRestore?: (version: any) => void;
}

export function VersionHistory({
  projectId,
  targetId,
  targetType = 'project',
  onRestore,
}: VersionHistoryProps) {
  const { getProjectVersions, getSceneVersions, restoreVersion, addLabel } = useVersionStore();
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelForm, setLabelForm] = useState({ label: '', notes: '' });

  // 获取版本列表
  const versions =
    targetType === 'project'
      ? getProjectVersions(projectId)
      : targetId
        ? getSceneVersions(targetId)
        : [];

  const handleRestore = async (versionId: string) => {
    const ok = await confirm({
      title: '确认恢复版本？',
      description: '当前内容将被覆盖，且无法撤销。建议先导出备份。',
      confirmText: '确认恢复',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;

    const version = versions.find((v) => v.id === versionId);
    if (version) {
      restoreVersion(versionId);
      onRestore?.(version.snapshot);
    }
  };

  const handleAddLabel = (versionId: string) => {
    setSelectedVersion(versionId);
    setShowLabelDialog(true);
  };

  const submitLabel = () => {
    if (selectedVersion && labelForm.label.trim()) {
      addLabel(selectedVersion, labelForm.label, labelForm.notes);
      setLabelForm({ label: '', notes: '' });
      setShowLabelDialog(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog />
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <History className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">版本历史</h2>
          <p className="text-sm text-muted-foreground">{versions.length} 个历史版本</p>
        </div>
      </div>

      {/* 版本列表 */}
      {versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <History className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">暂无历史版本</h3>
          <p className="text-sm text-muted-foreground">系统会在关键操作时自动保存版本</p>
        </div>
      ) : (
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-3">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow"
              >
                {/* 版本头部 */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {versions.length - index}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        {version.label && (
                          <Badge variant="secondary" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" />
                            {version.label}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {version.type === 'project' ? '项目' : '分镜'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {format(new Date(version.createdAt), 'yyyy-MM-dd HH:mm:ss', {
                          locale: zhCN,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleAddLabel(version.id)}>
                      <Tag className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRestore(version.id)}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* 版本备注 */}
                {version.notes && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-sm text-muted-foreground">{version.notes}</p>
                  </>
                )}

                {/* 快照预览 */}
                <Separator className="my-2" />
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    查看详情
                  </summary>
                  <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                    {JSON.stringify(version.snapshot, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 标签对话框 */}
      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加版本标签</DialogTitle>
            <DialogDescription>为这个版本添加标签和备注，方便日后查找</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">标签名称</Label>
              <Input
                id="label"
                value={labelForm.label}
                onChange={(e) => setLabelForm({ ...labelForm, label: e.target.value })}
                placeholder="例如：初版、修订版、最终版"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">备注说明</Label>
              <Textarea
                id="notes"
                value={labelForm.notes}
                onChange={(e) => setLabelForm({ ...labelForm, notes: e.target.value })}
                placeholder="记录这个版本的主要变更"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setLabelForm({ label: '', notes: '' });
                setShowLabelDialog(false);
              }}
            >
              取消
            </Button>
            <Button onClick={submitLabel}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
