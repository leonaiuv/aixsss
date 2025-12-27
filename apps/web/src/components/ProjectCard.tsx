import { memo, useMemo, useCallback } from 'react';
import { Project } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoreVertical, Trash2, Edit3, Calendar, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { getWorkflowStateLabel } from '@/lib/workflowLabels';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onRename: (projectId: string, currentTitle: string) => void;
  /** 动画延迟索引，用于 stagger 效果 */
  index?: number;
}

function ProjectCardComponent({
  project,
  onOpen,
  onDelete,
  onRename,
  index = 0,
}: ProjectCardProps) {
  // 更细致的进度计算：结合工作流状态和实际完成数据
  const progressPercentage = useMemo(() => {
    const stats = (
      project as Project & {
        _stats?: {
          episodeCount: number;
          episodesWithCoreExpression: number;
          sceneCount: number;
          scenesCompleted: number;
        };
      }
    )._stats;

    // 基础进度（基于工作流状态）
    const getBaseProgress = (): { min: number; max: number } => {
      switch (project.workflowState) {
        case 'IDLE':
          return { min: 0, max: 5 };
        case 'DATA_COLLECTING':
          return { min: 5, max: 10 };
        case 'DATA_COLLECTED':
          return { min: 10, max: 15 };
        case 'WORLD_VIEW_BUILDING':
          return { min: 15, max: 20 };
        case 'CHARACTER_MANAGING':
          return { min: 20, max: 25 };
        case 'EPISODE_PLANNING':
          return { min: 25, max: 35 };
        case 'EPISODE_PLAN_EDITING':
          return { min: 35, max: 45 };
        case 'EPISODE_CREATING':
          return { min: 45, max: 60 };
        case 'SCENE_LIST_GENERATING':
          return { min: 60, max: 65 };
        case 'SCENE_LIST_EDITING':
          return { min: 65, max: 75 };
        case 'SCENE_LIST_CONFIRMED':
          return { min: 75, max: 80 };
        case 'SCENE_PROCESSING':
          return { min: 80, max: 95 };
        case 'ALL_SCENES_COMPLETE':
        case 'ALL_EPISODES_COMPLETE':
          return { min: 95, max: 98 };
        case 'EXPORTING':
          return { min: 98, max: 100 };
        default:
          return { min: 0, max: 5 };
      }
    };

    const { min, max } = getBaseProgress();

    // 如果有统计数据，在当前状态范围内进行细化
    if (stats) {
      const range = max - min;
      let subProgress = 0;

      // 根据不同阶段计算子进度
      if (
        project.workflowState === 'EPISODE_PLAN_EDITING' ||
        project.workflowState === 'EPISODE_PLANNING'
      ) {
        // 剧集规划阶段：按核心表达完成率
        if (stats.episodeCount > 0) {
          subProgress = stats.episodesWithCoreExpression / stats.episodeCount;
        }
      } else if (
        project.workflowState === 'EPISODE_CREATING' ||
        project.workflowState === 'SCENE_LIST_EDITING' ||
        project.workflowState === 'SCENE_PROCESSING'
      ) {
        // 创作阶段：按分镜完成率
        if (stats.sceneCount > 0) {
          subProgress = stats.scenesCompleted / stats.sceneCount;
        }
      } else {
        // 其他阶段：取中间值
        subProgress = 0.5;
      }

      return Math.round(min + range * subProgress);
    }

    // 无统计数据时，取状态范围的中间值
    return Math.round((min + max) / 2);
  }, [project]);

  // 使用 useMemo 缓存日期格式化
  const formattedDate = useMemo(() => {
    const date = new Date(project.createdAt);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }, [project.createdAt]);

  // 使用 useCallback 缓存事件处理器
  const handleOpen = useCallback(() => onOpen(project), [onOpen, project]);
  const handleDelete = useCallback(() => onDelete(project.id), [onDelete, project.id]);
  const handleRename = useCallback(() => onRename(project.id, project.title), [onRename, project]);
  const statusLabel = useMemo(
    () => getWorkflowStateLabel(project.workflowState),
    [project.workflowState],
  );

  // 计算动画延迟
  const animationDelay = `${index * 50}ms`;

  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-lift',
        'border-border/60 hover:border-primary/20',
        'opacity-0 animate-fade-in-up',
        'bg-card/80 backdrop-blur-sm',
      )}
      style={{ animationDelay }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0" onClick={handleOpen}>
            <CardTitle className="text-lg font-display line-clamp-1 group-hover:text-primary transition-colors">
              {project.title}
            </CardTitle>
            <CardDescription className="mt-1.5 flex items-center gap-1.5 text-xs">
              <Calendar className="h-3 w-3" />
              <span>{formattedDate}</span>
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" data-testid="more-icon" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRename}>
                <Edit3 className="mr-2 h-4 w-4" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent onClick={handleOpen}>
        <div className="space-y-4">
          {/* 标签区域 */}
          <div className="flex items-center gap-2 flex-wrap">
            {project.style && (
              <Badge
                variant="secondary"
                className="gap-1 text-xs font-normal bg-primary/10 text-primary border-0"
              >
                <Palette className="h-3 w-3" />
                {project.style.length > 10 ? project.style.slice(0, 10) + '...' : project.style}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-normal">
              {statusLabel}
            </Badge>
          </div>

          {/* 进度条 */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">创作进度</span>
              <span className="font-medium tabular-nums">{progressPercentage}%</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
              {/* 进度条光泽效果 */}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// 使用 React.memo 优化，只在 project 或回调变化时重新渲染
export const ProjectCard = memo(ProjectCardComponent, (prevProps, nextProps) => {
  // 自定义比较函数
  return (
    prevProps.project.id === nextProps.project.id &&
    prevProps.project.title === nextProps.project.title &&
    prevProps.project.workflowState === nextProps.project.workflowState &&
    prevProps.project.style === nextProps.project.style &&
    prevProps.project.createdAt === nextProps.project.createdAt &&
    prevProps.index === nextProps.index &&
    prevProps.onOpen === nextProps.onOpen &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onRename === nextProps.onRename
  );
});
