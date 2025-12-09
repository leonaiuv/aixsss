/**
 * AI开发者面板组件
 * 显示实时AI调用进度、历史记录、错误信息和优化建议
 */
import { useState, useEffect } from 'react';
import { 
  useAIProgressStore, 
  getTaskTypeLabel, 
  getTaskStatusLabel, 
  getTaskStatusColor,
  type AITask,
} from '@/stores/aiProgressStore';
import { 
  getLogHistory, 
  getCallStatsByType, 
  getRecentErrors, 
  getOptimizationSuggestions,
  exportLogs,
  clearLogHistory,
} from '@/lib/ai/debugLogger';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Activity,
  X,
  Minimize2,
  Maximize2,
  RefreshCw,
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
  FileWarning,
  Lightbulb,
  Terminal,
  Copy,
  Settings,
} from 'lucide-react';

export function DevPanel() {
  const { 
    tasks, 
    isPanelVisible, 
    isPanelMinimized,
    stats,
    hidePanel,
    minimizePanel,
    expandPanel,
    clearCompletedTasks,
    refreshStats,
  } = useAIProgressStore();
  
  const [activeTab, setActiveTab] = useState('progress');
  const [selectedTask, setSelectedTask] = useState<AITask | null>(null);
  
  // 定时刷新统计
  useEffect(() => {
    const interval = setInterval(() => {
      refreshStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);
  
  if (!isPanelVisible) return null;
  
  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'queued');
  const recentTasks = tasks.slice(0, 20);
  const errors = getRecentErrors(10);
  const suggestions = getOptimizationSuggestions();
  const callStats = getCallStatsByType();
  
  // 最小化视图
  if (isPanelMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="p-3 shadow-lg border-2 border-primary/20 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {activeTasks.length > 0 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm font-medium">
                    {activeTasks.length} 个任务执行中
                  </span>
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">空闲</span>
                </>
              )}
            </div>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={expandPanel}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={hidePanel}
              >
                <X className="h-4 w-4" />
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
    <div className="fixed bottom-4 right-4 z-50 w-[480px] max-h-[600px]">
      <Card className="shadow-2xl border-2 border-primary/20 bg-background/98 backdrop-blur overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">AI 开发者面板</span>
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeTasks.length} 活跃
              </Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={minimizePanel}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={hidePanel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* 选项卡 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-2">
            <TabsTrigger value="progress" className="text-xs data-[state=active]:bg-background h-7 px-2">
              <Activity className="h-3 w-3 mr-1" />
              进度
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs data-[state=active]:bg-background h-7 px-2">
              <Clock className="h-3 w-3 mr-1" />
              历史
            </TabsTrigger>
            <TabsTrigger value="errors" className="text-xs data-[state=active]:bg-background h-7 px-2">
              <AlertCircle className="h-3 w-3 mr-1" />
              错误
              {errors.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                  {errors.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs data-[state=active]:bg-background h-7 px-2">
              <BarChart3 className="h-3 w-3 mr-1" />
              统计
            </TabsTrigger>
            <TabsTrigger value="optimize" className="text-xs data-[state=active]:bg-background h-7 px-2">
              <Lightbulb className="h-3 w-3 mr-1" />
              优化
            </TabsTrigger>
          </TabsList>
          
          {/* 进度面板 */}
          <TabsContent value="progress" className="m-0">
            <ScrollArea className="h-[350px]">
              <div className="p-3 space-y-3">
                {activeTasks.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">暂无正在执行的任务</p>
                  </div>
                ) : (
                  activeTasks.map(task => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      onSelect={() => setSelectedTask(task)}
                      onCopy={() => handleCopyTask(task)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* 历史面板 */}
          <TabsContent value="history" className="m-0">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-xs text-muted-foreground">
                最近 {recentTasks.length} 条记录
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleExportLogs}
                >
                  <Download className="h-3 w-3 mr-1" />
                  导出
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    clearCompletedTasks();
                    clearLogHistory();
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  清除
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-3 space-y-2">
                {recentTasks.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">暂无历史记录</p>
                  </div>
                ) : (
                  recentTasks.map(task => (
                    <HistoryItem 
                      key={task.id} 
                      task={task} 
                      onClick={() => setSelectedTask(task)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* 错误面板 */}
          <TabsContent value="errors" className="m-0">
            <ScrollArea className="h-[350px]">
              <div className="p-3 space-y-3">
                {errors.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-50" />
                    <p className="text-sm">暂无错误记录</p>
                  </div>
                ) : (
                  errors.map((entry, index) => (
                    <ErrorItem key={index} entry={entry} />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          
          {/* 统计面板 */}
          <TabsContent value="stats" className="m-0">
            <ScrollArea className="h-[350px]">
              <div className="p-3 space-y-4">
                {/* 总体统计 */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard 
                    label="总调用" 
                    value={stats.totalCalls} 
                    icon={<Zap className="h-4 w-4" />}
                  />
                  <StatCard 
                    label="成功" 
                    value={stats.successCount} 
                    icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                    className="text-green-600"
                  />
                  <StatCard 
                    label="失败" 
                    value={stats.errorCount} 
                    icon={<XCircle className="h-4 w-4 text-red-500" />}
                    className="text-red-600"
                  />
                </div>
                
                <Separator />
                
                {/* 性能指标 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">性能指标</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">
                        {(stats.avgResponseTime / 1000).toFixed(1)}s
                      </div>
                      <div className="text-xs text-muted-foreground">平均响应时间</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="text-lg font-bold">
                        {stats.totalTokensUsed.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">总Token消耗</div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* 按类型统计 */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">按类型统计</h4>
                  <div className="space-y-2">
                    {Object.entries(callStats).map(([type, data]) => (
                      <div key={type} className="flex items-center justify-between p-2 rounded bg-muted/30">
                        <span className="text-xs">{getTaskTypeLabel(type as any)}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {data.total} 次
                          </Badge>
                          {data.error > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {data.error} 失败
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
          <TabsContent value="optimize" className="m-0">
            <ScrollArea className="h-[350px]">
              <div className="p-3 space-y-3">
                <div className="text-xs text-muted-foreground mb-3">
                  基于您的AI调用数据，以下是一些优化建议：
                </div>
                {suggestions.map((suggestion, index) => (
                  <div 
                    key={index}
                    className="p-3 rounded-lg border bg-muted/20"
                  >
                    <p className="text-sm">{suggestion}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        
        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>
            成功率: {stats.totalCalls > 0 
              ? ((stats.successCount / stats.totalCalls) * 100).toFixed(1) 
              : 0}%
          </span>
          <span>
            预估成本: ${stats.costEstimate.toFixed(4)}
          </span>
        </div>
      </Card>
      
      {/* 任务详情对话框 */}
      {selectedTask && (
        <TaskDetailDialog 
          task={selectedTask} 
          onClose={() => setSelectedTask(null)} 
        />
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
  onCopy 
}: { 
  task: AITask; 
  onSelect: () => void;
  onCopy: () => void;
}) {
  return (
    <div 
      className="p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="font-medium text-sm">{task.title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      
      {task.description && (
        <p className="text-xs text-muted-foreground mb-2">{task.description}</p>
      )}
      
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{task.currentStep || '处理中...'}</span>
          <span>{task.progress}%</span>
        </div>
        <Progress value={task.progress} className="h-1.5" />
      </div>
      
      {task.sceneOrder && (
        <div className="mt-2 text-xs text-muted-foreground">
          分镜 #{task.sceneOrder}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ 
  task, 
  onClick 
}: { 
  task: AITask; 
  onClick: () => void;
}) {
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
      className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <StatusIcon className={`h-4 w-4 ${statusColor} ${task.status === 'running' ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {new Date(task.createdAt).toLocaleTimeString('zh-CN')}
          {task.sceneOrder && ` · 分镜 #${task.sceneOrder}`}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function ErrorItem({ entry }: { entry: any }) {
  return (
    <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-red-700 dark:text-red-400">
            {getTaskTypeLabel(entry.callType)}
          </div>
          <p className="text-xs text-red-600 dark:text-red-300 mt-1">
            {entry.error || '未知错误'}
          </p>
          <div className="text-xs text-red-500/70 mt-2">
            {entry.timestamp}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon,
  className = ''
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <div className={`text-xl font-bold ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TaskDetailDialog({ 
  task, 
  onClose 
}: { 
  task: AITask; 
  onClose: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <Card 
        className="w-[500px] max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">任务详情</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-4">
            {/* 基本信息 */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">基本信息</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">类型：</span>
                  {getTaskTypeLabel(task.type)}
                </div>
                <div>
                  <span className="text-muted-foreground">状态：</span>
                  <span className={getTaskStatusColor(task.status)}>
                    {getTaskStatusLabel(task.status)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">创建时间：</span>
                  {new Date(task.createdAt).toLocaleString('zh-CN')}
                </div>
                {task.completedAt && (
                  <div>
                    <span className="text-muted-foreground">完成时间：</span>
                    {new Date(task.completedAt).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            </div>
            
            {/* 响应内容 */}
            {task.response && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">响应内容</h4>
                <div className="p-3 rounded bg-muted/50 text-sm whitespace-pre-wrap max-h-[200px] overflow-auto">
                  {task.response.content}
                </div>
                {task.response.tokenUsage && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Prompt: {task.response.tokenUsage.prompt}</span>
                    <span>Completion: {task.response.tokenUsage.completion}</span>
                    <span>Total: {task.response.tokenUsage.total}</span>
                  </div>
                )}
              </div>
            )}
            
            {/* 错误信息 */}
            {task.error && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-red-500">错误信息</h4>
                <div className="p-3 rounded bg-red-50 dark:bg-red-950/20 text-sm text-red-600 dark:text-red-400">
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
  const activeTasks = tasks.filter(t => t.status === 'running');
  
  if (isPanelVisible) return null;
  
  return (
    <Button
      variant="outline"
      size="sm"
      className="fixed bottom-4 right-4 z-40 gap-2 shadow-lg"
      onClick={togglePanel}
    >
      <Terminal className="h-4 w-4" />
      <span>Dev Panel</span>
      {activeTasks.length > 0 && (
        <Badge variant="secondary" className="h-5 px-1.5">
          {activeTasks.length}
        </Badge>
      )}
    </Button>
  );
}
