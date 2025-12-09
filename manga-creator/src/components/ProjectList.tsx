import { useState, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ProjectCard } from './ProjectCard';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Plus, FileText, Search, Filter, X, Download } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { DataExporter } from './editor/DataExporter';

interface ProjectListProps {
  onOpenEditor: () => void;
}

export function ProjectList({ onOpenEditor }: ProjectListProps) {
  const { projects, createProject, deleteProject, setCurrentProject } = useProjectStore();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  
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
      result = result.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.summary.toLowerCase().includes(query) ||
        p.style.toLowerCase().includes(query)
      );
    }
    
    // 状态过滤
    if (statusFilter !== 'all') {
      result = result.filter(p => p.workflowState === statusFilter);
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

    createProject({
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
    onOpenEditor();
  };

  const handleOpenProject = (project: typeof projects[0]) => {
    setCurrentProject(project);
    onOpenEditor();
  };

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete);
      toast({
        title: '项目已删除',
      });
      setProjectToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-100">我的项目</h2>
          <p className="text-slate-400 mt-1">管理你的漫剧创作项目</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            disabled={projects.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            批量导出
          </Button>
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            size="lg"
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
          >
            <Plus className="mr-2 h-5 w-5" />
            新建项目
          </Button>
        </div>
      </div>

      {/* 搜索和过滤栏 */}
      {projects.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目名称、剧情、风格..."
              className="pl-10 bg-slate-800 border-slate-700"
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
            <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700">
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
            <SelectTrigger className="w-[120px] bg-slate-800 border-slate-700">
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
              className="text-slate-400"
            >
              <X className="h-4 w-4 mr-1" />
              清除筛选
            </Button>
          )}
        </div>
      )}

      {/* 结果统计 */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>找到 <span className="font-semibold text-slate-200">{filteredProjects.length}</span> 个项目</span>
          {filteredProjects.length !== projects.length && (
            <span>(共 {projects.length} 个)</span>
          )}
        </div>
      )}

      {/* 项目列表 */}
      {filteredProjects.length === 0 ? (
        projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="h-20 w-20 rounded-full bg-slate-800 flex items-center justify-center">
            <FileText className="h-10 w-10 text-slate-600" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold text-slate-300 mb-2">
              还没有项目
            </h3>
            <p className="text-slate-500 mb-4">
              开始创建你的第一个漫剧项目吧
            </p>
            <Button 
              onClick={() => setCreateDialogOpen(true)}
              size="lg"
              className="bg-gradient-to-r from-indigo-500 to-purple-600"
            >
              <Plus className="mr-2 h-5 w-5" />
              创建项目
            </Button>
          </div>
        </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center">
              <Search className="h-8 w-8 text-slate-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-300 mb-2">
                没有找到匹配的项目
              </h3>
              <p className="text-slate-500">
                试试调整搜索条件或筛选项
              </p>
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={handleOpenProject}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* 创建项目对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新项目</DialogTitle>
            <DialogDescription>
              为你的漫剧项目起个响亮的名字
            </DialogDescription>
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

      {/* 批量导出对话框 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>批量导出项目</DialogTitle>
            <DialogDescription>
              选择要导出的项目和格式
            </DialogDescription>
          </DialogHeader>
          <DataExporter projects={projects} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
