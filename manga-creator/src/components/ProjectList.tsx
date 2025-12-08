import { useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ProjectCard } from './ProjectCard';
import { Button } from './ui/button';
import { Plus, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Input } from './ui/input';
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

interface ProjectListProps {
  onOpenEditor: () => void;
}

export function ProjectList({ onOpenEditor }: ProjectListProps) {
  const { projects, createProject, deleteProject, setCurrentProject } = useProjectStore();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');

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
        <Button 
          onClick={() => setCreateDialogOpen(true)}
          size="lg"
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
        >
          <Plus className="mr-2 h-5 w-5" />
          新建项目
        </Button>
      </div>

      {/* 项目列表 */}
      {projects.length === 0 ? (
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
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
    </div>
  );
}
