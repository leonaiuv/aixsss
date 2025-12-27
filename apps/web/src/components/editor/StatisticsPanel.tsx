// ==========================================
// 统计分析面板组件（专业版）
// ==========================================

import { useMemo, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import {
  useAIUsageStore,
  filterUsageEvents,
  calculateUsageStats,
  estimateUsageCostUSD,
  type AIUsageEvent,
  type AIUsageStatus,
} from '@/stores/aiUsageStore';
import { useConfigStore } from '@/stores/configStore';
import { isApiMode } from '@/lib/runtime/mode';
import { getScenes, createBackup, getBackups } from '@/lib/storage';
import { getStorageUsage as getStorageUsageSnapshot } from '@/lib/storageManager';
import { useConfirm } from '@/hooks/use-confirm';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Download,
  Trash2,
  Zap,
  Activity,
  TrendingUp,
  Sparkles,
  Share2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
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
  AreaChart,
  Area,
  ComposedChart,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// --- Types & Constants ---

interface StatisticsPanelProps {
  projectId?: string;
  onOpenDataExport?: () => void;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  scene_list_generation: '分镜列表生成',
  scene_description: '场景锚点',
  action_description: '动作描述',
  shot_prompt: '镜头提示词',
  keyframe_prompt: '关键帧提示词',
  motion_prompt: '时空/运动',
  dialogue: '台词生成',
  episode_plan: '剧集规划',
  episode_core_expression: '单集核心',
  episode_scene_list: '单集分镜表',
  scene_refine_all: '一键细化',
  character_basic_info: '角色信息',
  character_portrait: '角色定妆照',
  narrative_causal_chain: '叙事因果链',
  build_narrative_causal_chain: '构建因果链',
  custom: '自定义',
};

function getCallTypeLabel(callType: string): string {
  return CALL_TYPE_LABELS[callType] || callType;
}

type TrendGranularity = 'hour' | 'day' | 'month';

// --- Helpers ---

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

// --- Sub-components (Visuals) ---

function InsightBadge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'positive' | 'negative' | 'warning';
}) {
  const colors = {
    default: 'bg-primary/10 text-primary border-primary/20',
    positive: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
    negative: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        colors[variant],
      )}
    >
      {children}
    </div>
  );
}

// 自动生成数据洞察
function AIUsageInsights({
  stats,
  _trend,
}: {
  stats: ReturnType<typeof calculateUsageStats>;
  _trend: { name: string; calls: number; errors: number; tokens: number }[];
}) {
  const insights = useMemo(() => {
    const list: Array<{
      icon: ReactNode;
      text: string;
      variant: 'default' | 'positive' | 'negative' | 'warning';
    }> = [];

    // Success Rate Insight
    if (stats.totalCalls > 0) {
      if (stats.successRate > 98) {
        list.push({
          icon: <CheckCircle className="h-3 w-3" />,
          text: '服务极度稳定',
          variant: 'positive',
        });
      } else if (stats.successRate < 80) {
        list.push({
          icon: <AlertTriangle className="h-3 w-3" />,
          text: '失败率偏高，建议检查配置',
          variant: 'negative',
        });
      }
    }

    // Latency Insight
    if (stats.p95DurationMs > 30000) {
      list.push({
        icon: <Clock className="h-3 w-3" />,
        text: 'P95 耗时较长 (>30s)',
        variant: 'warning',
      });
    } else if (stats.avgDurationMs < 2000 && stats.totalCalls > 5) {
      list.push({ icon: <Zap className="h-3 w-3" />, text: '响应速度极快', variant: 'positive' });
    }

    // Cost Insight (Mock logic)
    if (stats.totalTokens > 100000) {
      list.push({
        icon: <Database className="h-3 w-3" />,
        text: 'Token 消耗较大',
        variant: 'default',
      });
    }

    return list;
  }, [stats]);

  if (stats.totalCalls === 0)
    return <div className="text-sm text-muted-foreground">暂无数据供分析</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {insights.map((insight, i) => (
        <InsightBadge key={i} variant={insight.variant}>
          <span className="mr-1.5">{insight.icon}</span>
          {insight.text}
        </InsightBadge>
      ))}
    </div>
  );
}

// 迷你趋势图
function MiniTrendChart({
  data,
  color = '#8884d8',
  dataKey = 'value',
}: {
  data: { name: string; calls: number; errors: number; tokens: number }[];
  color?: string;
  dataKey?: string;
}) {
  if (!data || data.length === 0) return null;
  return (
    <div className="h-[40px] w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#gradient-${color})`}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 环形 KPI
function RadialKPI({
  value,
  label,
  subLabel,
  color = '#22c55e',
}: {
  value: number;
  max?: number;
  label: string;
  subLabel?: string;
  color?: string;
}) {
  const data = [{ name: 'L1', value: value, fill: color }];

  return (
    <div className="relative h-full flex items-center justify-between p-4 bg-card border rounded-xl overflow-hidden">
      <div className="z-10">
        <div className="text-sm text-muted-foreground font-medium mb-1">{label}</div>
        <div className="text-2xl font-bold tracking-tight">{value.toFixed(1)}%</div>
        {subLabel && (
          <div className="text-xs text-muted-foreground mt-1 opacity-80">{subLabel}</div>
        )}
      </div>
      <div className="h-[80px] w-[80px] absolute right-2 top-1/2 -translate-y-1/2 opacity-90">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="100%"
            barSize={10}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background
              dataKey="value"
              cornerRadius={30} // 圆角
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-bold text-muted-foreground/30">
          KPI
        </div>
      </div>
    </div>
  );
}

// 主组件

export function StatisticsPanel({ projectId }: StatisticsPanelProps) {
  const apiMode = isApiMode();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const pricingProfiles = useConfigStore((state) => state.profiles);

  const projects = useProjectStore((s) => s.projects);
  const aiEvents = useAIUsageStore((s) => s.events);
  const clearAIEvents = useAIUsageStore((s) => s.clearEvents);

  const [aiRange, setAiRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [aiScope] = useState<'project' | 'all'>(projectId ? 'project' : 'all');
  const [aiStatusFilter] = useState<'all' | AIUsageStatus>('all');
  const [aiCallTypeFilter, setAiCallTypeFilter] = useState<'all' | AIUsageEvent['callType']>('all');
  const [aiProviderFilter] = useState<'all' | string>('all');
  const [aiModelFilter] = useState<'all' | string>('all');
  const [, setStorageVersion] = useState(0);

  // --- Data Logic (Keep Existing Logic, Optimized for View) ---

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

  const aiTabFilteredEvents = useMemo(() => {
    return aiTabBaseEvents.filter((e) => {
      if (aiStatusFilter !== 'all' && e.status !== aiStatusFilter) return false;
      if (aiCallTypeFilter !== 'all' && e.callType !== aiCallTypeFilter) return false;
      if (aiProviderFilter !== 'all' && e.provider !== aiProviderFilter) return false;
      if (aiModelFilter !== 'all' && e.model !== aiModelFilter) return false;
      return true;
    });
  }, [aiCallTypeFilter, aiModelFilter, aiProviderFilter, aiStatusFilter, aiTabBaseEvents]);

  const aiTabStats = useMemo(() => calculateUsageStats(aiTabFilteredEvents), [aiTabFilteredEvents]);

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
          ? format(cursor, 'HH:mm', { locale: zhCN }) // 简化X轴
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
      .slice(0, 8); // 稍微减少数量适配新布局
  }, [aiTabFilteredEvents]);

  // Actions
  const handleCopyError = useCallback(
    async (event: AIUsageEvent) => {
      try {
        await navigator.clipboard.writeText(event.errorMessage || '未知错误');
        toast({ title: '已复制错误信息' });
      } catch {
        toast({ title: '复制失败', variant: 'destructive' });
      }
    },
    [toast],
  );

  const handleClearAIUsage = useCallback(async () => {
    const ok = await confirm({
      title: '清空统计？',
      description: '此操作仅影响本地统计数据，不删除项目内容。',
      destructive: true,
    });
    if (ok) {
      clearAIEvents();
      toast({ title: '已清空' });
    }
  }, [clearAIEvents, confirm, toast]);

  const buildAIUsageExportPayload = useCallback(() => {
    return {
      events: aiTabFilteredEvents,
      stats: aiTabStats,
      exportedAt: new Date().toISOString(),
    };
  }, [aiTabFilteredEvents, aiTabStats]);

  const handleDownloadAIUsage = useCallback(() => {
    const payload = buildAIUsageExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_stats_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '导出成功' });
  }, [buildAIUsageExportPayload, toast]);

  // Storage Logic
  const refreshStorage = useCallback(() => setStorageVersion((v) => v + 1), []);
  const storage = getStorageUsageSnapshot();
  const _backups = getBackups();

  // --- Render ---

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 text-white">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">数据中心</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <span>
                {projectId ? (targetProject ? targetProject.title : '项目统计') : '全局概览'}
              </span>
              <Separator orientation="vertical" className="h-3" />
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                智能分析中
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
          <Tabs defaultValue={apiMode ? 'ai' : 'overview'} className="w-auto">
            <TabsList className="h-8 bg-transparent">
              {!apiMode && (
                <TabsTrigger value="overview" className="h-7 text-xs px-3">
                  总览
                </TabsTrigger>
              )}
              <TabsTrigger value="ai" className="h-7 text-xs px-3">
                AI 监控
              </TabsTrigger>
              {!apiMode && (
                <TabsTrigger value="storage" className="h-7 text-xs px-3">
                  存储
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="overview" className="hidden" />{' '}
            {/* Placeholder to control active tab state via parent Tabs */}
            <TabsContent value="ai" className="hidden" />
            <TabsContent value="storage" className="hidden" />
          </Tabs>
        </div>
      </div>

      <Tabs defaultValue={apiMode ? 'ai' : 'overview'} className="space-y-6">
        {/* Content managed by the same Tabs context if needed, but here we reuse the state logical separation visually */}

        {/* Overview Tab (Legacy/Simple) */}
        {!apiMode && (
          <TabsContent
            value="overview"
            className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            {/* Bento Grid Layout for Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="col-span-1 lg:col-span-2 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-100 dark:border-emerald-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-5 w-5" />
                    完成进度
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <div className="text-4xl font-bold text-emerald-900 dark:text-emerald-50">
                      {completionRate.toFixed(0)}
                      <span className="text-xl">%</span>
                    </div>
                    <p className="text-sm text-emerald-600/80 mt-1">
                      {completedSceneCount} / {sceneCount} 分镜
                    </p>
                  </div>
                  <div className="h-[100px] w-[100px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={45}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-1 flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-medium">
                    项目概况
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{projectCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">活跃项目</div>
                </CardContent>
              </Card>

              <Card className="col-span-1 flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground font-medium">
                    资源消耗
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{formatBytes(storage.used)}</div>
                  <Progress value={storage.percentage} className="h-1.5 mt-3" />
                  <div className="text-xs text-muted-foreground mt-1.5">本地存储占用</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* AI Monitoring Tab (The Star Show) */}
        <TabsContent
          value="ai"
          className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/20 p-2 rounded-xl border">
            <div className="flex items-center gap-1 bg-background rounded-lg p-1 border shadow-sm">
              {['24h', '7d', '30d', 'all'].map((r) => (
                <button
                  key={r}
                  onClick={() => setAiRange(r as '24h' | '7d' | '30d' | 'all')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-md transition-all',
                    aiRange === r
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {r === 'all' ? '全部' : `近${r}`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 pr-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <AIUsageInsights stats={aiTabStats} _trend={aiTrendData} />
              </div>
              <Separator orientation="vertical" className="h-4" />
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleDownloadAIUsage}
                  title="导出数据"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={handleClearAIUsage}
                  title="清空统计"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI: Total Calls */}
            <Card className="col-span-1 shadow-sm border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="text-sm font-medium text-muted-foreground mb-1">总调用量</div>
                <div className="text-2xl font-bold">{aiTabStats.totalCalls.toLocaleString()}</div>
                <MiniTrendChart data={aiTrendData} dataKey="calls" color="#6366f1" />
              </CardContent>
            </Card>

            {/* KPI: Success Rate (Radial) */}
            <div className="col-span-1">
              <RadialKPI
                value={aiTabStats.successRate}
                label="成功率"
                subLabel={
                  aiTabStats.errorCount > 0 ? `${aiTabStats.errorCount} 次失败` : '完美运行'
                }
                color={
                  aiTabStats.successRate > 95
                    ? '#22c55e'
                    : aiTabStats.successRate > 80
                      ? '#f59e0b'
                      : '#ef4444'
                }
              />
            </div>

            {/* KPI: Latency */}
            <Card className="col-span-1 shadow-sm">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">平均耗时</div>
                  <div className="text-2xl font-bold">
                    {formatDuration(aiTabStats.avgDurationMs)}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  <span>P95</span>
                  <span className="font-mono text-foreground">
                    {formatDuration(aiTabStats.p95DurationMs)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* KPI: Cost */}
            <Card className="col-span-1 shadow-sm bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-100 dark:border-amber-900/50">
              <CardContent className="p-4">
                <div className="text-sm font-medium text-amber-800 dark:text-amber-500 mb-1 flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" />
                  估算消耗
                </div>
                <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  ${aiTabCostEstimateUSD.toFixed(4)}
                </div>
                <div className="text-[10px] text-amber-700/60 dark:text-amber-400/60 mt-1 truncate">
                  {aiTabStats.totalTokens.toLocaleString()} Tokens
                </div>
              </CardContent>
            </Card>

            {/* Main Chart: Trends (Large Block) */}
            <Card className="col-span-1 md:col-span-2 lg:col-span-3 shadow-sm flex flex-col h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    流量与性能趋势
                  </CardTitle>
                  <div className="flex gap-2">
                    <Select
                      value={aiCallTypeFilter}
                      onValueChange={(v) =>
                        setAiCallTypeFilter(v as 'all' | AIUsageEvent['callType'])
                      }
                    >
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue placeholder="筛选类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有类型</SelectItem>
                        {aiTabAvailableCallTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {getCallTypeLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={aiTrendData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#888' }}
                        minTickGap={30}
                      />
                      <YAxis
                        yAxisId="left"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#888' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#888' }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(var(--background-rgb), 0.9)',
                          borderRadius: '12px',
                          border: '1px solid var(--border)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                          backdropFilter: 'blur(8px)',
                          padding: '12px',
                        }}
                        itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                        labelStyle={{
                          color: 'var(--foreground)',
                          fontWeight: 'bold',
                          marginBottom: '8px',
                          fontSize: '14px',
                        }}
                        cursor={{
                          stroke: 'var(--primary)',
                          strokeWidth: 1,
                          strokeDasharray: '4 4',
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ fontSize: '12px' }}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="calls"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorCalls)"
                        name="调用量"
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="errors"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="错误数"
                        dot={false}
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="tokens"
                        barSize={20}
                        fill="#22c55e"
                        fillOpacity={0.3}
                        name="Token消耗"
                        radius={[4, 4, 0, 0]}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Side: Distribution Stats (Stacked) */}
            <Card className="col-span-1 shadow-sm flex flex-col h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">任务分布</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={aiCallsByType.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <RechartsTooltip cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="calls" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Error Log Stream (Full Width) */}
            <Card className="col-span-1 md:col-span-2 lg:col-span-4 shadow-sm flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">错误日志流</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-[200px] px-4">
                  <div className="space-y-2 pb-4">
                    {aiRecentErrors.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center">
                        暂无错误记录
                      </div>
                    ) : (
                      aiRecentErrors.map((e, i) => (
                        <div
                          key={i}
                          className="group flex gap-3 items-start text-xs border-b pb-2 pt-2 last:border-0 hover:bg-muted/30 transition-colors rounded-sm px-2"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                            <div className="text-muted-foreground font-mono col-span-1">
                              {format(new Date(e.completedAt), 'MM-dd HH:mm:ss')}
                            </div>
                            <div className="font-medium col-span-1">
                              {getCallTypeLabel(e.callType)}
                            </div>
                            <div
                              className="text-red-600/80 break-all col-span-2 line-clamp-1 group-hover:line-clamp-none transition-all"
                              title={e.errorMessage}
                            >
                              {e.errorMessage}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => handleCopyError(e)}
                            title="复制错误信息"
                          >
                            <Share2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Storage Tab (Legacy) */}
        {!apiMode && (
          <TabsContent value="storage">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  存储管理
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Reuse previous logic or simplify */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">LocalStorage 配额</span>
                      <span className="text-sm text-muted-foreground">
                        {getStorageUsageSnapshot().percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={getStorageUsageSnapshot().percentage} />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      createBackup();
                      toast({ title: '备份创建成功' });
                      refreshStorage();
                    }}
                  >
                    立即备份
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
