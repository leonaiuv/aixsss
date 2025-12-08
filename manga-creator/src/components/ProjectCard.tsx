import { Project } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoreVertical, Trash2, FolderOpen } from 'lucide-react';
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
}

export function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const getProgressPercentage = () => {
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
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <Card className="hover:shadow-xl hover:scale-105 transition-all duration-300 hover:ring-2 hover:ring-primary cursor-pointer group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1" onClick={() => onOpen(project)}>
            <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">
              {project.title}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              创建于 {formatDate(project.createdAt)}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpen(project)}>
                <FolderOpen className="mr-2 h-4 w-4" />
                打开项目
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(project.id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除项目
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent onClick={() => onOpen(project)}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium">
              {project.style || '未设置风格'}
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>进度</span>
              <span>{getProgressPercentage()}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
