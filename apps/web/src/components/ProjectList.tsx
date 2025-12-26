import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '@/stores/projectStore';
import { ProjectCard } from './ProjectCard';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, Search, Filter, X, Download, BookOpen, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DataExporter } from './editor/DataExporter';
import { LocalDataMigrationBanner } from './LocalDataMigrationBanner';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from './ui/empty';
import { Skeleton } from './ui/skeleton';

export function ProjectList() {
  const navigate = useNavigate();
  const { projects, createProject, deleteProject, setCurrentProject, updateProject } =
    useProjectStore();
  const isLoading = useProjectStore((s) => s.isLoading);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [projectToRename, setProjectToRename] = useState<{
    id: string;
    currentTitle: string;
  } | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [renameTitle, setRenameTitle] = useState('');

  // 搜索和过滤状态
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  // 过滤和排序项目
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // 文本搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.summary.toLowerCase().includes(query) ||
          p.style.toLowerCase().includes(query),
      );
    }

    // 状态过滤
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.workflowState === statusFilter);
    }

    // 排序
    result.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      } else {
        return a.title.localeCompare(b.title, 'zh-CN');
      }
    });

    return result;
  }, [projects, searchQuery, statusFilter, sortBy]);

  const hasActiveFilters = searchQuery || statusFilter !== 'all';

  const handleCreate = () => {
    if (!newProjectTitle.trim()) {
      toast({
        title: '请输入项目名称',
        variant: 'destructive',
      });
      return;
    }

    const newProject = createProject({
      title: newProjectTitle,
      summary: '',
      style: '',
      protagonist: '',
      workflowState: 'DATA_COLLECTING',
      currentSceneOrder: 0,
    });

    toast({
      title: '项目创建成功',
      description: `已创建项目"${newProjectTitle}"`,
    });

    setNewProjectTitle('');
    setCreateDialogOpen(false);
    navigate(`/projects/${encodeURIComponent(newProject.id)}`);
  };

  // 使用 useCallback 缓存回调函数，防止子组件不必要重渲染
  const handleOpenProject = useCallback(
    (project: (typeof projects)[0]) => {
      setCurrentProject(project);
      navigate(`/projects/${encodeURIComponent(project.id)}`);
    },
    [setCurrentProject, navigate],
  );

  const handleDeleteClick = useCallback((projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (projectToDelete) {
      deleteProject(projectToDelete);
      toast({
        title: '项目已删除',
      });
      setProjectToDelete(null);
      setDeleteDialogOpen(false);
    }
  }, [projectToDelete, deleteProject, toast]);

  const handleRenameClick = useCallback((projectId: string, currentTitle: string) => {
    setProjectToRename({ id: projectId, currentTitle });
    setRenameTitle(currentTitle);
    setRenameDialogOpen(true);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (projectToRename && renameTitle.trim()) {
      updateProject(projectToRename.id, { title: renameTitle.trim() });
      toast({
        title: '项目已重命名',
        description: `项目名称已更新为"${renameTitle.trim()}"`,
      });
      setProjectToRename(null);
      setRenameTitle('');
      setRenameDialogOpen(false);
    }
  }, [projectToRename, renameTitle, updateProject, toast]);

  return (
    <div className="space-y-6">
      <LocalDataMigrationBanner
        serverProjects={projects}
        isServerLoading={isLoading}
        onImported={loadProjects}
      />

      {/* 页面头部 - 带入场动画 */}
      <div className="flex items-center justify-between opacity-0 animate-fade-in-down">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">
            我的项目
          </h1>
          <p className="text-muted-foreground mt-1">管理你的漫剧创作项目</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            disabled={projects.length === 0}
            className="opacity-0 animate-fade-in animation-delay-100"
          >
            <Download className="mr-2 h-4 w-4" />
            批量导出
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="lg"
            className="shadow-sm opacity-0 animate-fade-in animation-delay-200"
          >
            <Plus className="mr-2 h-5 w-5" />
            新建项目
          </Button>
        </div>
      </div>

      {/* 搜索和过滤栏 */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-3 opacity-0 animate-fade-in-up animation-delay-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目名称、剧情、风格..."
              className="pl-10 bg-background/60 backdrop-blur-sm"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-background/60 backdrop-blur-sm">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="DATA_COLLECTING">收集中</SelectItem>
              <SelectItem value="SCENE_LIST_GENERATING">生成中</SelectItem>
              <SelectItem value="SCENE_PROCESSING">处理中</SelectItem>
              <SelectItem value="ALL_SCENES_COMPLETE">已完成</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v: 'date' | 'name') => setSortBy(v)}>
            <SelectTrigger className="w-[120px] bg-background/60 backdrop-blur-sm">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">更新时间</SelectItem>
              <SelectItem value="name">项目名称</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              清除筛选
            </Button>
          )}
        </div>
      )}

      {/* 结果统计 */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-fade-in">
          <span>
            找到 <span className="font-semibold text-foreground">{filteredProjects.length}</span>{' '}
            个项目
          </span>
          {filteredProjects.length !== projects.length && <span>(共 {projects.length} 个)</span>}
        </div>
      )}

      {/* 加载状态 */}
      {isLoading && projects.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3 p-6 rounded-lg border bg-card">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <div className="pt-2">
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 项目列表 */}
      {!isLoading && filteredProjects.length === 0 ? (
        projects.length === 0 ? (
          // 空状态 - 无项目
          <Empty className="py-20 animate-fade-in-up border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
                <BookOpen className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle className="font-display">开始你的创作之旅</EmptyTitle>
              <EmptyDescription>
                使用 AI 智能分镜技术，将你的故事创意转化为生动的漫剧脚本。
                立即创建第一个项目，体验全新的创作方式。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setCreateDialogOpen(true)} size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                创建第一个项目
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          // 空状态 - 搜索无结果
          <Empty className="py-16 animate-fade-in border-0 bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search className="h-6 w-6" />
              </EmptyMedia>
              <EmptyTitle>没有找到匹配的项目</EmptyTitle>
              <EmptyDescription>试试调整搜索条件或筛选项，或者创建一个新项目。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
              >
                清除筛选条件
              </Button>
            </EmptyContent>
          </Empty>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={handleOpenProject}
              onDelete={handleDeleteClick}
              onRename={handleRenameClick}
              index={index}
            />
          ))}
        </div>
      )}

      {/* 创建项目对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">创建新项目</DialogTitle>
            <DialogDescription>为你的漫剧项目起个响亮的名字</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">项目名称</Label>
              <Input
                id="title"
                placeholder="例如:机械之心"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate}>创建项目</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目?</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销,将永久删除该项目及其所有分镜数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重命名项目对话框 */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">重命名项目</DialogTitle>
            <DialogDescription>为项目输入一个新的名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-title">项目名称</Label>
              <Input
                id="rename-title"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
                placeholder="输入新项目名称"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDialogOpen(false);
                setProjectToRename(null);
                setRenameTitle('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleRenameConfirm} disabled={!renameTitle.trim()}>
              确认重命名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量导出对话框 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="font-display">批量导出项目</DialogTitle>
            <DialogDescription>选择要导出的项目和格式</DialogDescription>
          </DialogHeader>
          <DataExporter projects={projects} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
