import { useEffect, useMemo, useState } from 'react';
import { isApiMode } from '@/lib/runtime/mode';
import { useProjectStore } from '@/stores/projectStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { JsonViewer } from '@/components/ui/json-viewer';
import {
  apiCreateNarrativeCausalChainSnapshot,
  apiGetNarrativeCausalChainVersion,
  apiListNarrativeCausalChainVersions,
  apiRestoreNarrativeCausalChainVersion,
  type NarrativeCausalChainVersionDetail,
  type NarrativeCausalChainVersionSource,
  type NarrativeCausalChainVersionSummary,
} from '@/lib/api/narrativeCausalChainVersions';
import { NarrativeCausalChainReadable } from './NarrativeCausalChainReadable';
import { History, RefreshCw, RotateCcw, Save } from 'lucide-react';

function sourceBadge(source: NarrativeCausalChainVersionSource) {
  if (source === 'ai') return { label: 'AI', variant: 'secondary' as const };
  if (source === 'restore') return { label: '恢复', variant: 'outline' as const };
  return { label: '手动', variant: 'outline' as const };
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

export function NarrativeCausalChainVersionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  narrative: unknown | null;
  narrativeUpdatedAt: string | null;
}) {
  const { toast } = useToast();
  const loadProject = useProjectStore((s) => s.loadProject);

  const apiEnabled = isApiMode();
  const hasNarrative = Boolean(props.narrative);

  const [versions, setVersions] = useState<NarrativeCausalChainVersionSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NarrativeCausalChainVersionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [mode, setMode] = useState<'browse' | 'snapshot' | 'restore'>('browse');
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapshotNote, setSnapshotNote] = useState('');
  const [restoreLabel, setRestoreLabel] = useState('');
  const [restoreNote, setRestoreNote] = useState('');
  const [working, setWorking] = useState(false);

  const latestId = versions[0]?.id ?? null;

  const refreshList = async () => {
    if (!apiEnabled) return;
    setLoadingList(true);
    setListError(null);
    try {
      const list = await apiListNarrativeCausalChainVersions(props.projectId, 50);
      setVersions(list);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  };

  const loadDetail = async (versionId: string) => {
    if (!apiEnabled) return;
    setLoadingDetail(true);
    setDetail(null);
    try {
      const d = await apiGetNarrativeCausalChainVersion(props.projectId, versionId);
      setDetail(d);
    } catch (e) {
      toast({
        title: '加载版本失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!props.open) return;
    setMode('browse');
    setSnapshotLabel('');
    setSnapshotNote('');
    setRestoreLabel('');
    setRestoreNote('');
    setWorking(false);
    void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, apiEnabled, props.projectId, props.narrativeUpdatedAt]);

  useEffect(() => {
    if (!props.open) return;
    if (!apiEnabled) return;
    const current = selectedId;
    const listHasCurrent = current ? versions.some((v) => v.id === current) : false;
    const nextId = listHasCurrent ? current : (versions[0]?.id ?? null);
    if (!nextId) return;
    if (nextId !== selectedId) setSelectedId(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, apiEnabled, versions]);

  useEffect(() => {
    if (!props.open) return;
    if (!apiEnabled) return;
    if (!selectedId) return;
    void loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, apiEnabled, selectedId]);

  const selectedMeta = useMemo(() => {
    if (!selectedId) return null;
    return versions.find((v) => v.id === selectedId) ?? null;
  }, [selectedId, versions]);

  const canSnapshot = apiEnabled && hasNarrative && !working;
  const canRestore = apiEnabled && Boolean(selectedId) && !working;

  const handleCreateSnapshot = async () => {
    if (!canSnapshot) return;
    setWorking(true);
    try {
      await apiCreateNarrativeCausalChainSnapshot(props.projectId, {
        label: snapshotLabel.trim() || null,
        note: snapshotNote.trim() || null,
      });
      toast({ title: '已创建快照', description: '版本已保存，可随时恢复。' });
      setMode('browse');
      setSnapshotLabel('');
      setSnapshotNote('');
      await refreshList();
    } catch (e) {
      toast({
        title: '创建快照失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedId || !canRestore) return;
    setWorking(true);
    try {
      await apiRestoreNarrativeCausalChainVersion(props.projectId, selectedId, {
        label: restoreLabel.trim() || null,
        note: restoreNote.trim() || null,
      });
      toast({ title: '已恢复', description: '已将当前因果链恢复到所选版本。' });
      setMode('browse');
      setRestoreLabel('');
      setRestoreNote('');
      loadProject(props.projectId);
      await refreshList();
    } catch (e) {
      toast({
        title: '恢复失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-7xl w-[96vw] max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            因果链版本管理
          </DialogTitle>
        </DialogHeader>

        {!apiEnabled ? (
          <div className="text-sm text-muted-foreground">
            当前为本地模式；版本管理需要 API 模式（落库）才能启用。
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                {props.narrativeUpdatedAt
                  ? `当前因果链更新时间：${fmtTime(props.narrativeUpdatedAt)}`
                  : '当前因果链未生成'}
                {versions.length ? ` · 共 ${versions.length} 个版本` : ''}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => void refreshList()}
                  disabled={loadingList || working}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setMode('snapshot')}
                  disabled={!hasNarrative || working}
                >
                  <Save className="h-4 w-4" />
                  创建快照
                </Button>
              </div>
            </div>

            <Separator />

            {listError ? (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {listError}
              </div>
            ) : loadingList ? (
              <div className="text-sm text-muted-foreground">加载版本列表中...</div>
            ) : versions.length === 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  当前项目还没有版本记录（可能是旧项目/刚迁移/还没触发自动记录）。
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setMode('snapshot')}
                  disabled={!hasNarrative || working}
                >
                  <Save className="h-4 w-4" />
                  从当前因果链创建首个版本
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                {/* 左：版本列表 */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">版本列表</div>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="max-h-[62vh] overflow-auto">
                      {versions.map((v, idx) => {
                        const src = sourceBadge(v.source);
                        const isSelected = v.id === selectedId;
                        const isLatest = latestId === v.id;
                        const title = v.label?.trim() ? v.label : `版本 ${v.id.slice(0, 8)}`;
                        const meta = [
                          typeof v.phase === 'number' ? `phase=${v.phase}` : null,
                          typeof v.completedPhase === 'number'
                            ? `进度=${v.completedPhase}/4`
                            : null,
                          v.validationStatus ? `校验=${v.validationStatus}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setSelectedId(v.id)}
                            className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/40 ${
                              isSelected ? 'bg-muted/50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant={src.variant}>{src.label}</Badge>
                              {isLatest && idx === 0 ? (
                                <Badge variant="secondary">最新</Badge>
                              ) : null}
                              <span className="font-medium truncate">{title}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {fmtTime(v.createdAt)}
                              {meta ? ` · ${meta}` : ''}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 右：预览 / 操作 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">版本预览</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setMode('restore')}
                        disabled={!selectedId || working}
                      >
                        <RotateCcw className="h-4 w-4" />
                        恢复到此版本
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedMeta
                      ? `${selectedMeta.label || selectedMeta.id.slice(0, 8)} · ${fmtTime(selectedMeta.createdAt)}`
                      : '未选择版本'}
                  </div>

                  {loadingDetail ? (
                    <div className="text-sm text-muted-foreground">加载版本内容中...</div>
                  ) : detail ? (
                    <div className="space-y-3">
                      <Card className="p-3">
                        <div className="text-sm font-medium mb-2">可读版</div>
                        <NarrativeCausalChainReadable value={detail.chain} />
                      </Card>
                      <Card className="p-3">
                        <div className="text-sm font-medium mb-2">JSON</div>
                        <JsonViewer value={detail.chain} />
                      </Card>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">暂无版本内容。</div>
                  )}
                </div>
              </div>
            )}

            {/* 模式：创建快照 */}
            {mode === 'snapshot' ? (
              <Card className="p-4 border-l-4 border-l-primary">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">创建快照</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMode('browse')}
                    disabled={working}
                  >
                    取消
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="text-sm text-muted-foreground">
                    将基于“当前因果链”创建版本记录。建议在阶段完成、自洽通过、规划确认等关键节点创建。
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">标签（可选）</div>
                    <Input
                      value={snapshotLabel}
                      onChange={(e) => setSnapshotLabel(e.target.value)}
                      placeholder="例如：v1-稳定稿 / 自洽通过版"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">备注（可选）</div>
                    <Textarea
                      value={snapshotNote}
                      onChange={(e) => setSnapshotNote(e.target.value)}
                      placeholder="记录本次快照目的/改动点等"
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void handleCreateSnapshot()} disabled={!canSnapshot}>
                      创建
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            {/* 模式：恢复确认 */}
            {mode === 'restore' ? (
              <Card className="p-4 border-l-4 border-l-destructive">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">确认恢复</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMode('browse')}
                    disabled={working}
                  >
                    取消
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  <div className="text-sm text-muted-foreground">
                    将恢复到：
                    {selectedMeta
                      ? `${selectedMeta.label || selectedMeta.id.slice(0, 8)}（${fmtTime(selectedMeta.createdAt)}）`
                      : '未选择'}
                  </div>
                  <div className="text-sm text-destructive">
                    恢复会覆盖当前因果链产物，并可能影响后续剧集规划/单集生成。系统会自动创建一条“恢复”版本记录，便于再次回滚。
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">恢复后版本标签（可选）</div>
                    <Input
                      value={restoreLabel}
                      onChange={(e) => setRestoreLabel(e.target.value)}
                      placeholder="例如：回滚到 v1（用于重新规划）"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">备注（可选）</div>
                    <Textarea
                      value={restoreNote}
                      onChange={(e) => setRestoreNote(e.target.value)}
                      placeholder="记录为什么要恢复、后续计划等"
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      onClick={() => void handleRestore()}
                      disabled={!canRestore}
                    >
                      确认恢复
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
