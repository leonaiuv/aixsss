import { memo, useMemo, useCallback } from 'react';
import { Project } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoreVertical, Trash2, Edit3 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onRename: (projectId: string, currentTitle: string) => void;
}

function ProjectCardComponent({ project, onOpen, onDelete, onRename }: ProjectCardProps) {
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

  return (
    <Card className="hover:shadow-xl transition-all duration-300 hover:ring-2 hover:ring-primary cursor-pointer group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1" onClick={handleOpen}>
            <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">
              {project.title}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              创建于 {formattedDate}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
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
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent onClick={handleOpen}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium">
              {project.style || '未设置风格'}
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>进度</span>
              <span>{progressPercentage}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
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
    prevProps.onOpen === nextProps.onOpen &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onRename === nextProps.onRename
  );
});
