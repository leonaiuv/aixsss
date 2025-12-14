/**
 * AI进度通知组件
 * 实时显示AI调用状态的Toast通知
 */
import { useEffect, useState } from 'react';
import { useAIProgressStore, getTaskTypeLabel, type AITask } from '@/stores/aiProgressStore';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotificationItem {
  id: string;
  task: AITask;
  show: boolean;
  autoHideTimer?: ReturnType<typeof setTimeout>;
}

export function AIProgressToast() {
  const { tasks, subscribe, showPanel } = useAIProgressStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 订阅任务事件
  useEffect(() => {
    const handleTaskStarted = (task: AITask) => {
      setNotifications((prev) => {
        // 如果已存在，更新它
        const existing = prev.find((n) => n.id === task.id);
        if (existing) {
          return prev.map((n) => (n.id === task.id ? { ...n, task, show: true } : n));
        }
        // 添加新通知
        return [{ id: task.id, task, show: true }, ...prev].slice(0, 5);
      });
    };

    const handleTaskCompleted = (task: AITask) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (n.id === task.id) {
            // 设置自动隐藏定时器
            const timer = setTimeout(() => {
              setNotifications((current) => current.filter((item) => item.id !== task.id));
            }, 3000);

            return { ...n, task, autoHideTimer: timer };
          }
          return n;
        });
        return updated;
      });
    };

    const handleTaskFailed = (task: AITask) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (n.id === task.id) {
            // 错误通知保持更长时间
            const timer = setTimeout(() => {
              setNotifications((current) => current.filter((item) => item.id !== task.id));
            }, 8000);

            return { ...n, task, autoHideTimer: timer };
          }
          return n;
        });
        return updated;
      });
    };

    const handleTaskCancelled = (task: AITask) => {
      setNotifications((prev) => {
        const updated = prev.map((n) => {
          if (n.id === task.id) {
            const timer = setTimeout(() => {
              setNotifications((current) => current.filter((item) => item.id !== task.id));
            }, 3000);
            return { ...n, task, autoHideTimer: timer };
          }
          return n;
        });
        return updated;
      });
    };

    const handleTaskProgress = (task: AITask) => {
      setNotifications((prev) => prev.map((n) => (n.id === task.id ? { ...n, task } : n)));
    };

    const unsub1 = subscribe('task:started', handleTaskStarted);
    const unsub2 = subscribe('task:completed', handleTaskCompleted);
    const unsub3 = subscribe('task:failed', handleTaskFailed);
    const unsub4 = subscribe('task:progress', handleTaskProgress);
    const unsub5 = subscribe('task:cancelled', handleTaskCancelled);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      // 清理所有定时器
      notifications.forEach((n) => {
        if (n.autoHideTimer) clearTimeout(n.autoHideTimer);
      });
    };
  }, [subscribe]);

  // 移除通知
  const removeNotification = (id: string) => {
    setNotifications((prev) => {
      const item = prev.find((n) => n.id === id);
      if (item?.autoHideTimer) {
        clearTimeout(item.autoHideTimer);
      }
      return prev.filter((n) => n.id !== id);
    });
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-80 space-y-2">
      {/* 折叠/展开按钮 */}
      {notifications.length > 1 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                展开 ({notifications.length})
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                折叠
              </>
            )}
          </Button>
        </div>
      )}

      {/* 通知列表 */}
      {(isCollapsed ? notifications.slice(0, 1) : notifications).map((notification) => (
        <NotificationCard
          key={notification.id}
          task={notification.task}
          onClose={() => removeNotification(notification.id)}
          onShowPanel={showPanel}
        />
      ))}
    </div>
  );
}

// ==========================================
// 通知卡片组件
// ==========================================

function NotificationCard({
  task,
  onClose,
  onShowPanel,
}: {
  task: AITask;
  onClose: () => void;
  onShowPanel: () => void;
}) {
  const isRunning = task.status === 'running';
  const isSuccess = task.status === 'success';
  const isError = task.status === 'error';
  const isCancelled = task.status === 'cancelled';

  return (
    <div
      className={`
        p-3 rounded-lg shadow-lg border backdrop-blur-sm
        transition-all duration-300 ease-out
        ${
          isError
            ? 'bg-red-50/95 dark:bg-red-950/95 border-red-200 dark:border-red-800'
            : isSuccess
              ? 'bg-green-50/95 dark:bg-green-950/95 border-green-200 dark:border-green-800'
              : isCancelled
                ? 'bg-muted/60 border-muted-foreground/20'
                : 'bg-background/95 border-border'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className="flex-shrink-0 mt-0.5">
          {isRunning && <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />}
          {isSuccess && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          {isError && <XCircle className="h-5 w-5 text-red-500" />}
          {isCancelled && <XCircle className="h-5 w-5 text-muted-foreground" />}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">{task.title}</p>
              {task.sceneOrder && (
                <p className="text-xs text-muted-foreground">分镜 #{task.sceneOrder}</p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5 -mt-1 -mr-1" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          {/* 进度条 */}
          {isRunning && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[180px]">
                  {task.currentStep || '处理中...'}
                </span>
                <span>{task.progress}%</span>
              </div>
              <Progress value={task.progress} className="h-1" />
            </div>
          )}

          {/* 成功提示 */}
          {isSuccess && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">
              已完成
              {task.response?.tokenUsage && (
                <span className="ml-2 opacity-70">· {task.response.tokenUsage.total} tokens</span>
              )}
            </p>
          )}

          {isCancelled && <p className="mt-1 text-xs text-muted-foreground">已取消</p>}

          {/* 错误提示 */}
          {isError && task.error && (
            <div className="mt-1">
              <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                {task.error.message}
              </p>
              {task.error.retryable && task.retryCount < task.maxRetries && (
                <p className="text-xs text-red-500/70 mt-1">
                  可重试 ({task.retryCount}/{task.maxRetries})
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 查看详情按钮 */}
      {(isSuccess || isError || isCancelled) && (
        <div className="mt-2 pt-2 border-t border-current/10">
          <button className="text-xs text-primary hover:underline" onClick={onShowPanel}>
            在开发者面板中查看详情 →
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 简化的浮动进度指示器
// ==========================================

export function AIProgressIndicator() {
  const { tasks } = useAIProgressStore();
  const activeTasks = tasks.filter((t) => t.status === 'running');

  if (activeTasks.length === 0) return null;

  const currentTask = activeTasks[0];

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/95 border shadow-lg backdrop-blur-sm">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm font-medium">{currentTask.title}</span>
        <span className="text-xs text-muted-foreground">{currentTask.progress}%</span>
        {activeTasks.length > 1 && (
          <span className="text-xs text-muted-foreground">(+{activeTasks.length - 1} 更多)</span>
        )}
      </div>
    </div>
  );
}
