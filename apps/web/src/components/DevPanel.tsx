/**
 * AI开发者面板组件
 * 显示实时AI调用进度、历史记录、错误信息和优化建议
 */
import { useState, useEffect, useRef } from 'react';
import {
  useAIProgressStore,
  getTaskTypeLabel,
  type AITask,
} from '@/stores/aiProgressStore';
import {
  getCallStatsByType,
  getRecentErrors,
  getOptimizationSuggestions,
  exportLogs,
  clearLogHistory,
  type AICallLogEntry,
} from '@/lib/ai/debugLogger';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Activity,
  X,
  Minimize2,
  Maximize2,
  Download,
  Trash2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Zap,
  BarChart3,
  Lightbulb,
  Terminal,
  Copy,
  Layers,
  Pause,
  RotateCw,
  Cpu,
  BrainCircuit,
  History,
  Bug,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function DevPanel() {
  const {
    tasks,
    isPanelVisible,
    isPanelMinimized,
    stats,
    isBatchGenerating,
    batchGeneratingSource,
    batchOperations,
    hidePanel,
    minimizePanel,
    expandPanel,
    clearCompletedTasks,
    refreshStats,
    resetBatchOperations,
  } = useAIProgressStore();

  const [activeTab, setActiveTab] = useState('progress');
  const [selectedTask, setSelectedTask] = useState<AITask | null>(null);
  
  // 自动滚动到底部
  const _scrollRef = useRef<HTMLDivElement>(null);
  const prevTasksLength = useRef(tasks.length);

  // 定时刷新统计
  useEffect(() => {
    const interval = setInterval(() => {
      refreshStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  // 这里的逻辑可以优化：当有新任务且在 progress tab 时自动滚动
  useEffect(() => {
    if (activeTab === 'progress' && tasks.length > prevTasksLength.current) {
        // Simple auto-scroll trigger could go here
    }
    prevTasksLength.current = tasks.length;
  }, [tasks.length, activeTab]);

  if (!isPanelVisible) return null;

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'queued');
  const recentTasks = tasks.slice(0, 30);
  const errors = getRecentErrors(20);
  const suggestions = getOptimizationSuggestions();
  const callStats = getCallStatsByType();

  // 最小化视图
  if (isPanelMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <Card className="p-2 pl-3 pr-2 shadow-xl border-2 border-primary/10 bg-background/80 backdrop-blur-md hover:bg-background/95 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              {activeTasks.length > 0 ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400 relative z-10" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">{activeTasks.length} 个任务运行中</span>
                    <span className="text-[10px] text-muted-foreground">AI Console</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-1 rounded-md bg-green-500/10 text-green-600">
                    <Terminal className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">AI Console 空闲</span>
                </>
              )}
            </div>
            <div className="h-4 w-[1px] bg-border mx-1" />
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-muted" onClick={expandPanel}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={hidePanel}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // 导出日志
  const handleExportLogs = () => {
    const logs = exportLogs();
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制任务信息
  const handleCopyTask = (task: AITask) => {
    const info = JSON.stringify(task, null, 2);
    navigator.clipboard.writeText(info);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[520px] h-[600px] flex flex-col animate-in slide-in-from-bottom-4 duration-300 shadow-2xl rounded-xl">
      <Card className="flex flex-col h-full border-2 border-primary/5 bg-background/95 backdrop-blur-xl overflow-hidden rounded-xl shadow-inner">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-sm text-white">
               <BrainCircuit className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
                <span className="font-bold text-sm leading-none tracking-tight">AI 开发者面板</span>
                <span className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-80">v2.0.0 • Monitoring</span>
            </div>
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-2 text-[10px] bg-blue-500/10 text-blue-600 border-blue-200 animate-pulse">
                {activeTasks.length} Running
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={minimizePanel} title="最小化">
              <Minimize2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={hidePanel} title="关闭">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 选项卡 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-0">
            <TabsList className="w-full justify-start bg-muted/40 p-1 h-9 rounded-lg grid grid-cols-6 gap-1">
              <TabsTrigger value="progress" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md">
                <Activity className="h-3 w-3 mr-1.5" />进度
              </TabsTrigger>
              <TabsTrigger value="history" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md">
                <History className="h-3 w-3 mr-1.5" />历史
              </TabsTrigger>
              <TabsTrigger value="errors" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md relative">
                <Bug className="h-3 w-3 mr-1.5" />错误
                {errors.length > 0 && (
                  <span className="absolute top-1 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                )}
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md">
                <BarChart3 className="h-3 w-3 mr-1.5" />统计
              </TabsTrigger>
              <TabsTrigger value="optimize" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md">
                <Sparkles className="h-3 w-3 mr-1.5" />优化
              </TabsTrigger>
              <TabsTrigger value="batch" className="text-[11px] h-7 px-0 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all rounded-md relative">
                <Layers className="h-3 w-3 mr-1.5" />批量
                {isBatchGenerating && (
                   <span className="absolute top-1 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 relative">
            {/* 进度面板 */}
            <TabsContent value="progress" className="absolute inset-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {activeTasks.length === 0 ? (
                    <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground/50 select-none">
                      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                         <Cpu className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground/80">系统就绪</p>
                      <p className="text-xs mt-1">等待 AI 任务分发...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                            <span>执行队列</span>
                            <span>{activeTasks.length} 个任务</span>
                        </div>
                        {activeTasks.map((task) => (
                            <TaskItem
                            key={task.id}
                            task={task}
                            onSelect={() => setSelectedTask(task)}
                            onCopy={() => handleCopyTask(task)}
                            />
                        ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* 历史面板 */}
            <TabsContent value="history" className="absolute inset-0 m-0 overflow-hidden">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/10 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">
                        LOGS_TAIL: {recentTasks.length}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 hover:bg-muted" onClick={handleExportLogs}>
                            <Download className="h-3 w-3 mr-1.5" />JSON
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 hover:bg-destructive/10 hover:text-destructive" onClick={() => {
                            clearCompletedTasks();
                            clearLogHistory();
                        }}>
                            <Trash2 className="h-3 w-3 mr-1.5" />清空
                        </Button>
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-2">
                    {recentTasks.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground/50">
                            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">暂无历史记录</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {recentTasks.map((task) => (
                                <HistoryItem key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                            ))}
                        </div>
                    )}
                    </div>
                </ScrollArea>
              </div>
            </TabsContent>

            {/* 错误面板 */}
            <TabsContent value="errors" className="absolute inset-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                  {errors.length === 0 ? (
                    <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground/50">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                         <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                      </div>
                      <p className="text-sm font-medium">运行完美</p>
                      <p className="text-xs mt-1">未检测到异常错误</p>
                    </div>
                  ) : (
                    errors.map((entry, index) => <ErrorItem key={index} entry={entry} />)
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* 统计面板 */}
            <TabsContent value="stats" className="absolute inset-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-5">
                  {/* 总体统计 */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard
                      label="总调用"
                      value={stats.totalCalls}
                      icon={<Zap className="h-4 w-4" />}
                      bgClass="bg-blue-500/5"
                      textClass="text-blue-600"
                    />
                    <StatCard
                      label="成功"
                      value={stats.successCount}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      bgClass="bg-green-500/5"
                      textClass="text-green-600"
                    />
                    <StatCard
                      label="失败"
                      value={stats.errorCount}
                      icon={<XCircle className="h-4 w-4" />}
                      bgClass="bg-red-500/5"
                      textClass="text-red-600"
                    />
                  </div>

                  {/* 性能指标 */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Performance</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border bg-card/50 shadow-sm">
                        <div className="flex items-end gap-1.5">
                            <div className="text-xl font-bold font-mono">
                                {(stats.avgResponseTime / 1000).toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground mb-1">秒</div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">平均响应时间</div>
                      </div>
                      <div className="p-3 rounded-lg border bg-card/50 shadow-sm">
                        <div className="flex items-end gap-1.5">
                            <div className="text-xl font-bold font-mono">
                                {stats.totalTokensUsed > 1000 ? `${(stats.totalTokensUsed/1000).toFixed(1)}k` : stats.totalTokensUsed}
                            </div>
                            <div className="text-xs text-muted-foreground mb-1">Tokens</div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">总消耗量</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* 按类型统计 */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Breakdown</h4>
                    <div className="space-y-1.5">
                      {(
                        Object.entries(callStats) as Array<
                          [
                            Parameters<typeof getTaskTypeLabel>[0],
                            (typeof callStats)[keyof typeof callStats],
                          ]
                        >
                      ).map(([type, data]) => (
                        <div
                          key={type}
                          className="flex items-center justify-between p-2.5 rounded-lg border bg-card/30 hover:bg-card/80 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                              <span className="text-xs font-medium">{getTaskTypeLabel(type)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{data.total}</span>
                            {data.error > 0 && (
                              <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                {data.error}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* 优化建议面板 */}
            <TabsContent value="optimize" className="absolute inset-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                     <Lightbulb className="h-5 w-5 shrink-0 mt-0.5" />
                     <div className="text-xs leading-relaxed">
                        基于您的 AI 调用数据分析，以下建议可能帮助您降低成本或提升响应速度。
                     </div>
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="flex gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                      <div className="mt-0.5 text-primary">
                          <Zap className="h-4 w-4" />
                      </div>
                      <p className="text-xs leading-relaxed text-muted-foreground">{suggestion}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* 批量操作状态面板 */}
            <TabsContent value="batch" className="absolute inset-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-5">
                  {/* 全局批量状态 */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Batch Status</h4>
                    <div className={cn(
                        "p-4 rounded-xl border-2 transition-all",
                        isBatchGenerating ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-card/50"
                    )}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {isBatchGenerating ? (
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
                                <Loader2 className="h-5 w-5 animate-spin text-blue-500 relative z-10" />
                            </div>
                          ) : (
                            <div className="p-1 rounded-full bg-green-500/10">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </div>
                          )}
                          <div className="flex flex-col">
                              <span className={cn("text-sm font-bold", isBatchGenerating ? "text-blue-600" : "text-foreground")}>
                                  {isBatchGenerating ? "批量任务运行中" : "无活跃批量任务"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                  {isBatchGenerating ? "系统正在后台处理队列..." : "系统待机中"}
                              </span>
                          </div>
                        </div>
                        {batchGeneratingSource && (
                          <Badge variant="outline" className="text-[10px] bg-background">
                            {batchGeneratingSource === 'batch_panel'
                              ? '批量面板'
                              : batchGeneratingSource === 'scene_refinement'
                                ? '分镜细化'
                                : '单集工作流'}
                          </Badge>
                        )}
                      </div>
                      {isBatchGenerating && (
                        <div className="text-[10px] text-blue-600/80 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/10 inline-block">
                          ⚠️ 其他生成按钮已锁定，防止并发冲突
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* 批量操作详情 */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Job Details</h4>

                    {/* 操作类型和状态 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-lg bg-muted/30 border">
                        <div className="text-[10px] text-muted-foreground uppercase mb-1">Type</div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5" />
                          {batchOperations.operationType
                            ? {
                                generate: '批量生成',
                                edit: '批量编辑',
                                export: '批量导出',
                                delete: '批量删除',
                              }[batchOperations.operationType]
                            : '-'}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted/30 border">
                        <div className="text-[10px] text-muted-foreground uppercase mb-1">State</div>
                        <div className="flex items-center gap-1.5">
                          {batchOperations.isProcessing ? (
                            batchOperations.isPaused ? (
                              <>
                                <Pause className="h-3.5 w-3.5 text-yellow-500" />
                                <span className="text-sm font-medium text-yellow-600">已暂停</span>
                              </>
                            ) : (
                              <>
                                <RotateCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                                <span className="text-sm font-medium text-blue-600">处理中...</span>
                              </>
                            )
                          ) : (
                            <span className="text-sm font-medium text-muted-foreground">Idle</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 进度信息 */}
                    <div className="p-3.5 rounded-xl border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-medium">总体进度</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {batchOperations.currentScene} / {batchOperations.totalScenes}
                        </span>
                      </div>
                      <div className="relative h-2.5 bg-muted rounded-full overflow-hidden mb-2">
                          <div 
                            className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-500 ease-out rounded-full"
                            style={{ width: `${batchOperations.progress}%` }}
                          />
                      </div>
                      {batchOperations.statusMessage && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Activity className="h-3 w-3" />
                            {batchOperations.statusMessage}
                        </div>
                      )}
                    </div>

                    {/* 分镜统计 */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded-lg bg-muted/30 border text-center">
                        <div className="text-lg font-bold">{batchOperations.selectedScenes.size}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">Selected</div>
                      </div>
                      <div className="p-2 rounded-lg bg-green-500/5 border border-green-500/10 text-center">
                        <div className="text-lg font-bold text-green-600">
                          {batchOperations.completedScenes.length}
                        </div>
                        <div className="text-[10px] text-green-600/70 uppercase">Success</div>
                      </div>
                      <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10 text-center">
                        <div className="text-lg font-bold text-red-600">
                          {batchOperations.failedScenes.length}
                        </div>
                        <div className="text-[10px] text-red-600/70 uppercase">Failed</div>
                      </div>
                    </div>

                    {/* 时间信息 */}
                    {batchOperations.startTime && (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                        <span>Started at</span>
                        <span className="font-mono">{new Date(batchOperations.startTime).toLocaleTimeString('zh-CN')}</span>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    {(batchOperations.completedScenes.length > 0 ||
                      batchOperations.failedScenes.length > 0) && (
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30"
                          onClick={resetBatchOperations}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          清除记录 & 重置
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/40 backdrop-blur-sm text-[10px] text-muted-foreground select-none">
          <div className="flex gap-3">
              <span className="flex items-center gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", stats.successCount > 0 && stats.errorCount === 0 ? "bg-green-500" : "bg-amber-500")} />
                成功率: <span className="font-mono font-medium">{stats.totalCalls > 0 ? ((stats.successCount / stats.totalCalls) * 100).toFixed(1) : 0}%</span>
              </span>
              <span className="w-[1px] h-3 bg-border" />
              <span className="flex items-center gap-1.5">
                预估成本: <span className="font-mono font-medium text-foreground">${stats.costEstimate.toFixed(4)}</span>
              </span>
          </div>
          <div className="flex items-center gap-1 opacity-70">
             <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
             <span>System Online</span>
          </div>
        </div>
      </Card>

      {/* 任务详情对话框 */}
      {selectedTask && (
        <TaskDetailDialog task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

// ==========================================
// 子组件
// ==========================================

function TaskItem({
  task,
  onSelect,
  onCopy,
}: {
  task: AITask;
  onSelect: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className="group relative pl-4 py-3 rounded-r-lg border-l-2 border-l-muted hover:border-l-primary hover:bg-muted/30 transition-all cursor-pointer"
      onClick={onSelect}
    >
      {/* 步骤圆点 */}
      <div className={cn(
          "absolute -left-[5px] top-4 w-2.5 h-2.5 rounded-full border-2 bg-background transition-colors",
          task.status === 'running' ? "border-blue-500 animate-pulse" : "border-muted group-hover:border-primary"
      )} />

      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {task.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
          <span className="font-semibold text-xs text-foreground/90">{task.title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      {task.description && <p className="text-[11px] text-muted-foreground/80 mb-2 line-clamp-1">{task.description}</p>}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground font-mono">{task.currentStep || 'Initializing...'}</span>
          <span className="font-mono">{task.progress}%</span>
        </div>
        <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${task.progress}%` }} />
        </div>
      </div>

      {task.sceneOrder && (
        <div className="mt-2 inline-flex items-center px-1.5 py-0.5 rounded bg-muted/50 text-[10px] text-muted-foreground border border-border/50">
            SCENE #{task.sceneOrder}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ task, onClick }: { task: AITask; onClick: () => void }) {
  const StatusIcon = {
    queued: Clock,
    running: Loader2,
    success: CheckCircle2,
    error: XCircle,
    cancelled: XCircle,
  }[task.status];

  const statusColor = {
    queued: 'text-yellow-500',
    running: 'text-blue-500',
    success: 'text-green-500',
    error: 'text-red-500',
    cancelled: 'text-gray-500',
  }[task.status];

  return (
    <div
      className="group flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-card hover:shadow-sm cursor-pointer transition-all"
      onClick={onClick}
    >
      <StatusIcon
        className={`h-4 w-4 shrink-0 ${statusColor} ${task.status === 'running' ? 'animate-spin' : ''}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
            <div className="text-xs font-medium truncate text-foreground/90">{task.title}</div>
            <div className="text-[10px] text-muted-foreground font-mono opacity-70">
                {new Date(task.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
        </div>
        <div className="flex items-center gap-2">
            <span className={cn("text-[10px] px-1.5 rounded-sm capitalize", 
                task.status === 'success' ? 'bg-green-500/10 text-green-600' : 
                task.status === 'error' ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'
            )}>
                {task.status}
            </span>
            {task.sceneOrder && <span className="text-[10px] text-muted-foreground">Scene #{task.sceneOrder}</span>}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
    </div>
  );
}

function ErrorItem({ entry }: { entry: AICallLogEntry }) {
  return (
    <div className="p-3 rounded-lg border border-red-200/50 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
      <div className="flex items-start gap-3">
        <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-md shrink-0">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold text-xs text-red-700 dark:text-red-400">
                {getTaskTypeLabel(entry.callType)}
            </div>
            <div className="text-[10px] text-red-600/60 font-mono">{entry.timestamp}</div>
          </div>
          <p className="text-xs text-red-600/90 dark:text-red-300 break-words font-mono bg-white/50 dark:bg-black/10 p-1.5 rounded border border-red-100 dark:border-red-900/30">
            {entry.error || '未知错误'}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bgClass = 'bg-muted/50',
  textClass = 'text-foreground',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bgClass?: string;
  textClass?: string;
}) {
  return (
    <div className={cn("p-3 rounded-xl border bg-card shadow-sm flex flex-col items-center justify-center gap-1 transition-all hover:scale-105", bgClass)}>
      <div className={cn("mb-1", textClass)}>{icon}</div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function TaskDetailDialog({ task, onClose }: { task: AITask; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <Card className="w-[600px] max-h-[85vh] overflow-hidden shadow-2xl border-primary/10 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
             <Terminal className="h-4 w-4 text-primary" />
             <h3 className="font-semibold text-sm">Task Details</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="max-h-[65vh]">
          <div className="p-5 space-y-6">
            {/* Header Info */}
            <div className="flex items-start gap-4">
                <div className={cn(
                    "p-3 rounded-xl", 
                    task.status === 'success' ? "bg-green-500/10 text-green-600" :
                    task.status === 'error' ? "bg-red-500/10 text-red-600" :
                    "bg-blue-500/10 text-blue-600"
                )}>
                    {task.status === 'success' ? <CheckCircle2 className="h-6 w-6" /> : 
                     task.status === 'error' ? <XCircle className="h-6 w-6" /> : 
                     <Loader2 className="h-6 w-6 animate-spin" />}
                </div>
                <div>
                    <h2 className="text-lg font-bold">{task.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                </div>
            </div>

            <Separator />

            {/* 基本信息 Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Type</span>
                    <div className="text-sm">{getTaskTypeLabel(task.type)}</div>
                </div>
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Status</span>
                    <Badge variant={task.status === 'error' ? 'destructive' : 'secondary'} className="capitalize">
                        {task.status}
                    </Badge>
                </div>
                <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Created</span>
                    <div className="text-sm font-mono text-muted-foreground">{new Date(task.createdAt).toLocaleString()}</div>
                </div>
                {task.completedAt && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground uppercase font-bold">Duration</span>
                    <div className="text-sm font-mono text-muted-foreground">
                        {((new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 1000).toFixed(2)}s
                    </div>
                  </div>
                )}
            </div>

            {/* 响应内容 */}
            {task.response && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase">Response Output</h4>
                    {task.response.tokenUsage && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                            {task.response.tokenUsage.total} Tokens
                        </Badge>
                    )}
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-auto leading-relaxed">
                  {task.response.content}
                </div>
              </div>
            )}

            {/* 错误信息 */}
            {task.error && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-red-500 uppercase">Error Trace</h4>
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-xs font-mono text-red-600 dark:text-red-400">
                  {task.error.message}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ==========================================
// 开发者面板触发按钮
// ==========================================

export function DevPanelTrigger() {
  const { isPanelVisible, togglePanel, tasks } = useAIProgressStore();
  const activeTasks = tasks.filter((t) => t.status === 'running');

  if (isPanelVisible) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="fixed bottom-4 right-4 z-40 gap-2 shadow-xl border-primary/20 bg-background/80 backdrop-blur hover:bg-background h-9 rounded-full px-4 transition-all hover:scale-105"
      onClick={togglePanel}
    >
      <div className={cn("w-2 h-2 rounded-full", activeTasks.length > 0 ? "bg-blue-500 animate-pulse" : "bg-green-500")} />
      <span className="font-medium text-xs">AI Console</span>
      {activeTasks.length > 0 && (
        <Badge variant="secondary" className="h-5 px-1.5 ml-1 bg-blue-500/10 text-blue-600 border-blue-200">
          {activeTasks.length}
        </Badge>
      )}
    </Button>
  );
}
