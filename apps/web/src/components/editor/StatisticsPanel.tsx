// ==========================================
// 统计分析面板组件（真实口径版）
// ==========================================
// 目标：
// 1) 指标口径清晰可解释
// 2) AI 用量/耗时/成功率真实统计
// 3) 存储占用可视化 + 备份/恢复可操作
// ==========================================

import { useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import {
  useAIUsageStore,
  filterUsageEvents,
  calculateUsageStats,
  estimateUsageCostUSD,
  DEFAULT_COST_PER_1K_TOKENS_USD,
  type AIUsageEvent,
  type AIUsageStatus,
} from '@/stores/aiUsageStore';
import { useConfigStore } from '@/stores/configStore';
import {
  getScenes,
  createBackup,
  getBackups,
  restoreFromBackup,
  deleteBackup,
  deleteAllBackups,
} from '@/lib/storage';
import { getStorageUsage as getStorageUsageSnapshot } from '@/lib/storageManager';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  Database,
  Download,
  FileText,
  HardDriveDownload,
  Info,
  RotateCcw,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface StatisticsPanelProps {
  projectId?: string;
  onOpenDataExport?: () => void;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  scene_list_generation: '分镜列表生成',
  scene_description: '场景锚点',
  action_description: '动作描述',
  shot_prompt: '镜头提示词',
  keyframe_prompt: '关键帧提示词（KF0/KF1/KF2）',
  motion_prompt: '时空/运动提示词',
  dialogue: '台词生成',
  character_basic_info: '角色信息生成',
  character_portrait: '角色定妆照生成',
  custom: '自定义调用',
};

function getCallTypeLabel(callType: string): string {
  return CALL_TYPE_LABELS[callType] || callType;
}

type TrendGranularity = 'hour' | 'day' | 'month';

function getBucketDate(timestamp: number, granularity: TrendGranularity): Date {
  const date = new Date(timestamp);
  if (granularity === 'hour') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
  }
  if (granularity === 'day') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextBucket(date: Date, granularity: TrendGranularity): Date {
  if (granularity === 'hour') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours() + 1);
  }
  if (granularity === 'day') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toFixed(0)}s`;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function getStorageSeverity(percentage: number): 'ok' | 'warn' | 'danger' {
  if (percentage >= 85) return 'danger';
  if (percentage >= 70) return 'warn';
  return 'ok';
}

function getBadgeStyle(severity: 'ok' | 'warn' | 'danger'): {
  label: string;
  className: string;
} {
  if (severity === 'danger') {
    return {
      label: '高风险',
      className: 'text-red-700 bg-red-50 dark:text-red-200 dark:bg-red-950',
    };
  }
  if (severity === 'warn') {
    return {
      label: '偏高',
      className: 'text-amber-700 bg-amber-50 dark:text-amber-200 dark:bg-amber-950',
    };
  }
  return {
    label: '良好',
    className: 'text-green-700 bg-green-50 dark:text-green-200 dark:bg-green-950',
  };
}

function MetricRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{label}</span>
        {tooltip ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  trendUp,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle || trend ? (
        <div className="flex items-center gap-2 mt-2">
          {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
          {trend ? (
            <Badge
              variant="secondary"
              className={trendUp ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}
            >
              {trend}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function StatisticsPanel({ projectId, onOpenDataExport }: StatisticsPanelProps) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const pricingProfiles = useConfigStore((state) => state.profiles);

  const projects = useProjectStore((s) => s.projects);
  const aiEvents = useAIUsageStore((s) => s.events);
  const clearAIEvents = useAIUsageStore((s) => s.clearEvents);

  const [aiRange, setAiRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [aiScope, setAiScope] = useState<'project' | 'all'>(projectId ? 'project' : 'all');
  const [aiStatusFilter, setAiStatusFilter] = useState<'all' | AIUsageStatus>('all');
  const [aiCallTypeFilter, setAiCallTypeFilter] = useState<'all' | AIUsageEvent['callType']>('all');
  const [aiProviderFilter, setAiProviderFilter] = useState<'all' | string>('all');
  const [aiModelFilter, setAiModelFilter] = useState<'all' | string>('all');
  const [storageVersion, setStorageVersion] = useState(0);

  const targetProject = useMemo(() => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId) || null;
  }, [projectId, projects]);

  const scenesMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof getScenes>> = {};
    if (projectId) {
      map[projectId] = getScenes(projectId);
      return map;
    }
    projects.forEach((p) => {
      map[p.id] = getScenes(p.id);
    });
    return map;
  }, [projectId, projects]);

  const projectCount = projectId ? (targetProject ? 1 : 0) : projects.length;

  const { sceneCount, completedSceneCount } = useMemo(() => {
    let total = 0;
    let completed = 0;
    Object.values(scenesMap).forEach((scenes) => {
      total += scenes.length;
      completed += scenes.filter((s) => s.status === 'completed').length;
    });
    return { sceneCount: total, completedSceneCount: completed };
  }, [scenesMap]);

  const completionRate = useMemo(() => {
    if (sceneCount === 0) return 0;
    return (completedSceneCount / sceneCount) * 100;
  }, [completedSceneCount, sceneCount]);

  const statusData = useMemo(() => {
    const completed = completedSceneCount;
    const inProgress = Math.max(0, sceneCount - completedSceneCount);
    return [
      { name: '已完成', value: completed, color: '#22c55e' },
      { name: '进行中', value: inProgress, color: '#3b82f6' },
    ];
  }, [completedSceneCount, sceneCount]);

  const aiFrom = useMemo(() => {
    const now = Date.now();
    if (aiRange === '24h') return now - 24 * 60 * 60 * 1000;
    if (aiRange === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    if (aiRange === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    return undefined;
  }, [aiRange]);

  const scopedAIEvents = useMemo(() => {
    return filterUsageEvents(aiEvents, {
      projectId,
      from: aiFrom,
    });
  }, [aiEvents, aiFrom, projectId]);

  const aiTabBaseEvents = useMemo(() => {
    const scopeProjectId = aiScope === 'project' ? projectId : undefined;
    return filterUsageEvents(aiEvents, {
      projectId: scopeProjectId,
      from: aiFrom,
    });
  }, [aiEvents, aiFrom, aiScope, projectId]);

  const aiTabAvailableCallTypes = useMemo(() => {
    const set = new Set<AIUsageEvent['callType']>();
    for (const e of aiTabBaseEvents) set.add(e.callType);
    return [...set].sort((a, b) => getCallTypeLabel(a).localeCompare(getCallTypeLabel(b), 'zh-CN'));
  }, [aiTabBaseEvents]);

  const aiTabAvailableProviders = useMemo(() => {
    const set = new Set<string>();
    for (const e of aiTabBaseEvents) set.add(e.provider);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [aiTabBaseEvents]);

  const aiTabAvailableModels = useMemo(() => {
    const set = new Set<string>();
    for (const e of aiTabBaseEvents) {
      if (aiProviderFilter !== 'all' && e.provider !== aiProviderFilter) continue;
      set.add(e.model);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [aiProviderFilter, aiTabBaseEvents]);

  const aiTabFilteredEvents = useMemo(() => {
    return aiTabBaseEvents.filter((e) => {
      if (aiStatusFilter !== 'all' && e.status !== aiStatusFilter) return false;
      if (aiCallTypeFilter !== 'all' && e.callType !== aiCallTypeFilter) return false;
      if (aiProviderFilter !== 'all' && e.provider !== aiProviderFilter) return false;
      if (aiModelFilter !== 'all' && e.model !== aiModelFilter) return false;
      return true;
    });
  }, [aiCallTypeFilter, aiModelFilter, aiProviderFilter, aiStatusFilter, aiTabBaseEvents]);

  const aiStats = useMemo(() => calculateUsageStats(scopedAIEvents), [scopedAIEvents]);

  const aiTabStats = useMemo(() => calculateUsageStats(aiTabFilteredEvents), [aiTabFilteredEvents]);

  const costEstimateUSD = useMemo(() => {
    const pricingByProfileId = Object.fromEntries(pricingProfiles.map((p) => [p.id, p.pricing]));
    return estimateUsageCostUSD(scopedAIEvents, pricingByProfileId);
  }, [pricingProfiles, scopedAIEvents]);

  const aiTabCostEstimateUSD = useMemo(() => {
    const pricingByProfileId = Object.fromEntries(pricingProfiles.map((p) => [p.id, p.pricing]));
    return estimateUsageCostUSD(aiTabFilteredEvents, pricingByProfileId);
  }, [aiTabFilteredEvents, pricingProfiles]);

  const aiCallsByType = useMemo(() => {
    const map = new Map<string, { name: string; calls: number }>();
    for (const e of aiTabFilteredEvents) {
      const current = map.get(e.callType) || { name: getCallTypeLabel(e.callType), calls: 0 };
      current.calls += 1;
      map.set(e.callType, current);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls);
  }, [aiTabFilteredEvents]);

  const aiCallsByModel = useMemo(() => {
    const map = new Map<string, { name: string; calls: number }>();
    for (const e of scopedAIEvents) {
      const key = `${e.provider} / ${e.model}`;
      const current = map.get(key) || { name: key, calls: 0 };
      current.calls += 1;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.calls - a.calls).slice(0, 10);
  }, [scopedAIEvents]);

  const aiDurationBuckets = useMemo(() => {
    const buckets = [
      { name: '<5s', value: 0, color: '#22c55e' },
      { name: '5-10s', value: 0, color: '#3b82f6' },
      { name: '10-20s', value: 0, color: '#f59e0b' },
      { name: '20-30s', value: 0, color: '#ef4444' },
      { name: '>30s', value: 0, color: '#7c3aed' },
    ];
    for (const e of aiTabFilteredEvents) {
      if (typeof e.durationMs !== 'number') continue;
      const s = e.durationMs / 1000;
      if (s < 5) buckets[0].value += 1;
      else if (s < 10) buckets[1].value += 1;
      else if (s < 20) buckets[2].value += 1;
      else if (s < 30) buckets[3].value += 1;
      else buckets[4].value += 1;
    }
    return buckets;
  }, [aiTabFilteredEvents]);

  const aiTrendData = useMemo(() => {
    if (aiTabBaseEvents.length === 0) return [];

    const granularity: TrendGranularity =
      aiRange === '24h' ? 'hour' : aiRange === 'all' ? 'month' : 'day';

    const now = Date.now();
    const rangeStart =
      typeof aiFrom === 'number' ? aiFrom : Math.min(...aiTabBaseEvents.map((e) => e.completedAt));

    const startBucketDate = getBucketDate(rangeStart, granularity);
    const endBucketDate = getBucketDate(now, granularity);

    const map = new Map<number, { name: string; calls: number; errors: number; tokens: number }>();

    for (
      let cursor = startBucketDate;
      cursor.getTime() <= endBucketDate.getTime();
      cursor = nextBucket(cursor, granularity)
    ) {
      const key = cursor.getTime();
      const label =
        granularity === 'hour'
          ? format(cursor, 'MM-dd HH:00', { locale: zhCN })
          : granularity === 'day'
            ? format(cursor, 'MM-dd', { locale: zhCN })
            : format(cursor, 'yyyy-MM', { locale: zhCN });

      map.set(key, { name: label, calls: 0, errors: 0, tokens: 0 });
    }

    for (const event of aiTabFilteredEvents) {
      const bucketStart = getBucketDate(event.completedAt, granularity).getTime();
      const row = map.get(bucketStart);
      if (!row) continue;
      row.calls += 1;
      if (event.status === 'error') row.errors += 1;
      if (event.tokenUsage) row.tokens += event.tokenUsage.total;
    }

    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  }, [aiFrom, aiRange, aiTabBaseEvents, aiTabFilteredEvents]);

  const aiRecentErrors = useMemo(() => {
    return [...aiTabFilteredEvents]
      .filter((e) => e.status === 'error')
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 10);
  }, [aiTabFilteredEvents]);

  const handleCopyError = useCallback(
    async (event: AIUsageEvent) => {
      const summary = [
        `类型：${getCallTypeLabel(event.callType)}`,
        typeof event.sceneOrder === 'number' ? `分镜：#${event.sceneOrder}` : null,
        `时间：${format(new Date(event.completedAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}`,
        `错误：${event.errorMessage || '未知错误'}`,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        await navigator.clipboard.writeText(summary);
        toast({ title: '已复制错误信息' });
      } catch {
        toast({
          title: '复制失败',
          description: '浏览器可能禁止剪贴板访问，请手动复制',
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const buildAIUsageExportPayload = useCallback(() => {
    return {
      exportedAt: new Date().toISOString(),
      range: aiRange,
      scope: aiScope,
      project:
        aiScope === 'project' && projectId
          ? { id: projectId, title: targetProject?.title || '' }
          : null,
      filters: {
        status: aiStatusFilter,
        callType: aiCallTypeFilter,
        provider: aiProviderFilter,
        model: aiModelFilter,
      },
      stats: {
        ...aiTabStats,
        costEstimateUSD: Number(aiTabCostEstimateUSD.toFixed(6)),
        costPer1KTokensUSD: DEFAULT_COST_PER_1K_TOKENS_USD,
      },
      events: aiTabFilteredEvents,
    };
  }, [
    aiCallTypeFilter,
    aiModelFilter,
    aiProviderFilter,
    aiRange,
    aiScope,
    aiStatusFilter,
    aiTabCostEstimateUSD,
    aiTabFilteredEvents,
    aiTabStats,
    projectId,
    targetProject?.title,
  ]);

  const handleCopyAIUsage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildAIUsageExportPayload(), null, 2));
      toast({
        title: '已复制 AI 使用数据（JSON）',
        description: `${aiTabFilteredEvents.length} 条`,
      });
    } catch {
      toast({
        title: '复制失败',
        description: '浏览器可能禁止剪贴板访问，请改用“导出 JSON”',
        variant: 'destructive',
      });
    }
  }, [aiTabFilteredEvents.length, buildAIUsageExportPayload, toast]);

  const handleDownloadAIUsage = useCallback(() => {
    try {
      const payload = buildAIUsageExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scopeLabel = payload.scope === 'project' ? 'project' : 'all';
      a.download = `ai-usage_${scopeLabel}_${payload.range}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: '已导出 AI 使用数据',
        description: `${aiTabFilteredEvents.length} 条`,
      });
    } catch {
      toast({
        title: '导出失败',
        description: '请重试或检查浏览器下载权限',
        variant: 'destructive',
      });
    }
  }, [aiTabFilteredEvents.length, buildAIUsageExportPayload, toast]);

  const handleClearAIUsage = useCallback(async () => {
    const ok = await confirm({
      title: '确认清空 AI 使用统计？',
      description: '将清空本地 AI 调用历史（仅影响统计，不影响项目/分镜内容）。',
      confirmText: '清空统计',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;
    clearAIEvents();
    toast({ title: '已清空 AI 使用统计' });
  }, [clearAIEvents, confirm, toast]);

  const refreshStorage = useCallback(() => setStorageVersion((v) => v + 1), []);

  const storage = useMemo(() => getStorageUsageSnapshot(), [storageVersion]);
  const storageSeverity = getStorageSeverity(storage.percentage);
  const storageBadge = getBadgeStyle(storageSeverity);

  const largestKeys = useMemo(() => {
    if (typeof localStorage === 'undefined') return [];
    const rows: Array<{ key: string; size: number }> = [];
    Object.keys(localStorage).forEach((key) => {
      const value = localStorage.getItem(key) || '';
      rows.push({ key, size: key.length + value.length });
    });
    rows.sort((a, b) => b.size - a.size);
    return rows.slice(0, 8);
  }, [storageVersion]);

  const backups = useMemo(() => getBackups(), [storageVersion]);

  const handleCreateBackup = useCallback(() => {
    try {
      const id = createBackup();
      refreshStorage();
      toast({
        title: '已创建本地备份',
        description: `备份ID：${id}`,
      });
    } catch (err) {
      toast({
        title: '备份失败',
        description: err instanceof Error ? err.message : '可能是存储空间不足',
        variant: 'destructive',
      });
    }
  }, [refreshStorage, toast]);

  const handleRestoreBackup = useCallback(
    async (backupId: string) => {
      const ok = await confirm({
        title: '确认从备份恢复？',
        description: '将覆盖当前本地数据；恢复成功后会自动刷新页面以重新加载状态。',
        confirmText: '恢复',
        cancelText: '取消',
        destructive: true,
      });
      if (!ok) return;

      const success = restoreFromBackup(backupId);
      if (!success) {
        toast({
          title: '恢复失败',
          description: '备份可能已损坏或格式不正确',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '已从备份恢复',
        description: '即将刷新页面以重新加载数据...',
      });

      setTimeout(() => {
        window.location.reload();
      }, 800);
    },
    [confirm, toast],
  );

  const handleDeleteBackup = useCallback(
    async (backupId: string) => {
      const ok = await confirm({
        title: '确认删除备份？',
        description: '删除后无法恢复。',
        confirmText: '删除',
        cancelText: '取消',
        destructive: true,
      });
      if (!ok) return;
      deleteBackup(backupId);
      refreshStorage();
      toast({ title: '已删除备份' });
    },
    [confirm, refreshStorage, toast],
  );

  const handleDeleteAllBackups = useCallback(async () => {
    const ok = await confirm({
      title: '确认删除所有备份？',
      description: '将删除所有本地备份（不影响当前数据）。',
      confirmText: '删除全部',
      cancelText: '取消',
      destructive: true,
    });
    if (!ok) return;
    deleteAllBackups();
    refreshStorage();
    toast({ title: '已删除所有备份' });
  }, [confirm, refreshStorage, toast]);

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">统计分析</h2>
          <p className="text-sm text-muted-foreground">
            {projectId ? (targetProject ? `项目：${targetProject.title}` : '项目统计') : '全局统计'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="ai">AI 使用</TabsTrigger>
          <TabsTrigger value="storage">存储与备份</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={projectId ? '项目' : '项目总数'}
              value={projectId ? (targetProject ? '当前项目' : '未找到') : projectCount}
              icon={<FileText className="h-4 w-4" />}
            />
            <StatCard
              title="分镜总数"
              value={sceneCount}
              icon={<CheckCircle className="h-4 w-4" />}
              subtitle={`完成 ${completedSceneCount}`}
            />
            <StatCard
              title="完成率"
              value={`${completionRate.toFixed(1)}%`}
              icon={<CheckCircle className="h-4 w-4" />}
              trend={completionRate >= 80 ? '优秀' : completionRate >= 50 ? '良好' : '待提升'}
              trendUp={completionRate >= 50}
            />
            <StatCard
              title="Token（可统计）"
              value={aiStats.totalTokens.toLocaleString()}
              icon={<Zap className="h-4 w-4" />}
              subtitle={`调用 ${aiStats.totalCalls}`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">分镜完成状态</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">AI 使用概况</h3>
                <div className="w-40">
                  <Select value={aiRange} onValueChange={(v) => setAiRange(v as typeof aiRange)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">近24小时</SelectItem>
                      <SelectItem value="7d">近7天</SelectItem>
                      <SelectItem value="30d">近30天</SelectItem>
                      <SelectItem value="all">全部</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <MetricRow
                  label="调用次数"
                  value={aiStats.totalCalls.toLocaleString()}
                  tooltip="按完成时刻计入（成功/失败各算一次）"
                />
                <MetricRow
                  label="成功率"
                  value={`${aiStats.successRate.toFixed(1)}%`}
                  tooltip="成功次数 /（成功+失败）"
                />
                <MetricRow
                  label="平均耗时"
                  value={formatDuration(aiStats.avgDurationMs)}
                  tooltip="口径：call:start 到 call:success/error 的时间差"
                />
                <MetricRow
                  label="P95 耗时"
                  value={formatDuration(aiStats.p95DurationMs)}
                  tooltip="95 分位耗时（更能反映尾部卡顿）"
                />
                <MetricRow
                  label="Token 覆盖率"
                  value={`${aiStats.tokenizedCalls}/${aiStats.totalCalls}`}
                  tooltip="部分供应商/模型不返回 tokenUsage；这里只统计有返回的调用"
                />
                <MetricRow
                  label="费用估算（$）"
                  value={`$${costEstimateUSD.toFixed(4)}`}
                  tooltip={`优先使用「配置档案」中填写的价格；未配置时按 $${DEFAULT_COST_PER_1K_TOKENS_USD}/1K tokens 粗略估算`}
                />
              </div>

              <div className="pt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Token（可统计）</span>
                  <span className="font-medium">{aiStats.totalTokens.toLocaleString()}</span>
                </div>
                <Progress value={Math.min(100, (aiStats.totalTokens / 50000) * 100)} />
                <p className="text-xs text-muted-foreground mt-2">
                  进度条是相对尺度（50k tokens 作为参考），用于帮助感知变化趋势。
                </p>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">供应商 / 模型分布（Top 10）</h3>
              <Badge variant="secondary">{scopedAIEvents.length} 次</Badge>
            </div>
            {aiCallsByModel.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={aiCallsByModel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={180} />
                  <RechartsTooltip />
                  <Bar dataKey="calls" fill="#0ea5e9" name="调用次数" />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              提示：失败率偏高时，优先检查 Key/BaseURL/模型名/限流。
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">筛选与操作</p>
                <p className="text-xs text-muted-foreground">
                  口径：按 call:success/error 统计；耗时=call:start → call:success/error。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {projectId ? (
                  <div className="w-32">
                    <Select
                      value={aiScope}
                      onValueChange={(v) => {
                        const next = v as 'project' | 'all';
                        setAiScope(next);
                        setAiStatusFilter('all');
                        setAiCallTypeFilter('all');
                        setAiProviderFilter('all');
                        setAiModelFilter('all');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="project">仅本项目</SelectItem>
                        <SelectItem value="all">全部项目</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="w-32">
                  <Select value={aiRange} onValueChange={(v) => setAiRange(v as typeof aiRange)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">近24小时</SelectItem>
                      <SelectItem value="7d">近7天</SelectItem>
                      <SelectItem value="30d">近30天</SelectItem>
                      <SelectItem value="all">全部</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-28">
                  <Select
                    value={aiStatusFilter}
                    onValueChange={(v) => setAiStatusFilter(v as typeof aiStatusFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="success">成功</SelectItem>
                      <SelectItem value="error">失败</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-48">
                  <Select
                    value={aiCallTypeFilter}
                    onValueChange={(v) => setAiCallTypeFilter(v as typeof aiCallTypeFilter)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型</SelectItem>
                      {aiTabAvailableCallTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {getCallTypeLabel(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-32">
                  <Select
                    value={aiProviderFilter}
                    onValueChange={(v) => {
                      setAiProviderFilter(v);
                      setAiModelFilter('all');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="供应商" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部供应商</SelectItem>
                      {aiTabAvailableProviders.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-40">
                  <Select value={aiModelFilter} onValueChange={(v) => setAiModelFilter(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部模型</SelectItem>
                      {aiTabAvailableModels.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Badge variant="secondary">
                  {aiTabFilteredEvents.length}/{aiTabBaseEvents.length} 条
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyAIUsage}
                  disabled={aiTabFilteredEvents.length === 0}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  复制 JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAIUsage}
                  disabled={aiTabFilteredEvents.length === 0}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  导出 JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAIUsage}
                  disabled={aiEvents.length === 0}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  清空统计
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="调用次数"
              value={aiTabStats.totalCalls.toLocaleString()}
              icon={<Zap className="h-4 w-4" />}
              subtitle={`成功 ${aiTabStats.successCount} / 失败 ${aiTabStats.errorCount}`}
            />
            <StatCard
              title="成功率"
              value={`${aiTabStats.successRate.toFixed(1)}%`}
              icon={<CheckCircle className="h-4 w-4" />}
              subtitle={`Token 覆盖 ${aiTabStats.tokenizedCalls}/${aiTabStats.totalCalls}`}
            />
            <StatCard
              title="平均耗时"
              value={formatDuration(aiTabStats.avgDurationMs)}
              icon={<Clock className="h-4 w-4" />}
              subtitle={`P95 ${formatDuration(aiTabStats.p95DurationMs)}`}
            />
            <StatCard
              title="费用估算（$）"
              value={`$${aiTabCostEstimateUSD.toFixed(4)}`}
              icon={<Zap className="h-4 w-4" />}
              subtitle={`未配置价格时按 $${DEFAULT_COST_PER_1K_TOKENS_USD}/1K tokens（仅参考）`}
            />
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">调用与 Token 趋势</h3>
              <Badge variant="secondary">{aiTrendData.length} 点</Badge>
            </div>
            {aiTrendData.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={aiTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" minTickGap={24} />
                  <YAxis yAxisId="left" allowDecimals={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v) =>
                      typeof v === 'number' && v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                    }
                  />
                  <RechartsTooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="calls"
                    stroke="#6366f1"
                    name="调用次数"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="errors"
                    stroke="#ef4444"
                    name="错误次数"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="tokens"
                    stroke="#22c55e"
                    name="Token（total）"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              说明：Token 仅统计供应商返回的 tokenUsage.total；成本仍为参考估算。
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">调用类型分布</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={aiCallsByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={140} />
                  <RechartsTooltip />
                  <Bar dataKey="calls" fill="#6366f1" name="调用次数" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                提示：某一类调用占比异常高，通常意味着反复重试或流程卡点。
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">耗时分布</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={aiDurationBuckets}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="次数">
                    {aiDurationBuckets.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                口径：耗时=call:start 到 call:success/error 的时间差。
              </p>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">最近错误（Top 10）</h3>
              <Badge variant="secondary">{aiRecentErrors.length} 条</Badge>
            </div>
            {aiRecentErrors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-500" />
                暂无错误
              </div>
            ) : (
              <div className="space-y-2">
                {aiRecentErrors.map((e) => (
                  <div key={e.id} className="p-3 rounded-lg border bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-200"
                          >
                            错误
                          </Badge>
                          <span className="text-sm font-medium">
                            {getCallTypeLabel(e.callType)}
                          </span>
                          {typeof e.sceneOrder === 'number' ? (
                            <span className="text-xs text-muted-foreground">
                              分镜 #{e.sceneOrder}
                            </span>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(e.completedAt), 'MM-dd HH:mm', { locale: zhCN })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          {e.errorMessage || '未知错误'}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleCopyError(e)}>
                        复制
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span>存储占用</span>
                  <Badge variant="secondary" className={storageBadge.className}>
                    {storageBadge.label}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  口径：按 LocalStorage 字符串长度估算（可能略有偏差）。
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={refreshStorage}>
                <RotateCcw className="h-4 w-4 mr-2" />
                刷新
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">已用</span>
                <span className="font-medium">
                  {formatBytes(storage.used)} / {formatBytes(storage.quota)}
                </span>
              </div>
              <Progress value={Math.min(100, storage.percentage)} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{storage.percentage.toFixed(1)}%</span>
                <span>可用约 {formatBytes(storage.available)}</span>
              </div>
            </div>

            {storageSeverity !== 'ok' ? (
              <div className="mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 mt-0.5" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">
                    <p className="font-semibold">存储占用偏高</p>
                    <p className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                      建议先做一次“文件备份”，再考虑清理旧备份/历史数据。
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={onOpenDataExport} disabled={!onOpenDataExport}>
                    <HardDriveDownload className="h-4 w-4 mr-2" />
                    打开导出数据（推荐）
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCreateBackup}>
                    创建本地备份
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <HardDriveDownload className="h-4 w-4" />
                <span>本地备份</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                本地备份存储在 LocalStorage
                中（创建很快，但会占用空间）。更推荐“导出数据”做文件备份。
              </p>

              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={handleCreateBackup}>
                  创建备份
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onOpenDataExport}
                  disabled={!onOpenDataExport}
                >
                  打开导出数据
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteAllBackups}
                  disabled={backups.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除全部备份
                </Button>
              </div>

              <Separator className="my-4" />

              <div className="text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span>备份数量</span>
                  <span className="font-medium">{backups.length}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span>最近备份</span>
                  <span className="font-medium">
                    {backups[0]?.timestamp
                      ? format(new Date(backups[0].timestamp), 'yyyy-MM-dd HH:mm', { locale: zhCN })
                      : '-'}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">备份列表</h3>
              <ScrollArea className="h-[320px] pr-3">
                <div className="space-y-3">
                  {backups.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      暂无本地备份。建议在关键节点创建一次文件备份。
                    </div>
                  ) : (
                    backups.map((b) => (
                      <div key={b.id} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">
                              {format(new Date(b.timestamp), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 font-mono">
                              {b.id}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestoreBackup(b.id)}
                            >
                              恢复
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteBackup(b.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <div className="mt-4 p-3 rounded-lg bg-muted/30">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">恢复提示</p>
                    <p className="mt-1">
                      从备份恢复会覆盖当前数据。为保证状态一致性，恢复成功后会自动刷新页面。
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">占用最大的键（Top 8）</h3>
            <div className="space-y-2">
              {largestKeys.length === 0 ? (
                <div className="text-sm text-muted-foreground">未检测到 LocalStorage 数据。</div>
              ) : (
                largestKeys.map((row) => (
                  <div key={row.key} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-[70%] font-mono">
                      {row.key}
                    </span>
                    <span className="font-medium">{formatBytes(row.size)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
