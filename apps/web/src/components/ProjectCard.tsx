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

function ProjectCardComponent({ project, onOpen, onDelete, onRename, index = 0 }: ProjectCardProps) {
  // 使用 useMemo 缓存进度计算
  const progressPercentage = useMemo(() => {
    switch (project.workflowState) {
      case 'IDLE':
      case 'DATA_COLLECTING':
        return 10;
      case 'DATA_COLLECTED':
        return 25;
      case 'SCENE_LIST_GENERATING':
      case 'SCENE_LIST_EDITING':
        return 40;
      case 'SCENE_LIST_CONFIRMED':
        return 50;
      case 'SCENE_PROCESSING':
        return 75;
      case 'ALL_SCENES_COMPLETE':
        return 90;
      case 'EXPORTING':
        return 100;
      default:
        return 0;
    }
  }, [project.workflowState]);

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
        "group cursor-pointer transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-lift",
        "border-border/60 hover:border-primary/20",
        "opacity-0 animate-fade-in-up",
        "bg-card/80 backdrop-blur-sm"
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
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
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
              <Badge variant="secondary" className="gap-1 text-xs font-normal bg-primary/10 text-primary border-0">
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
