import { useEffect, useState } from 'react';
import { useProjectStore } from './stores/projectStore';
import { useConfigStore } from './stores/configStore';
import { useThemeStore } from './stores/themeStore';
import { initStorage } from './lib/storage';
import { ProjectList } from './components/ProjectList';
import { Editor } from './components/Editor';
import { ConfigDialog } from './components/ConfigDialog';
import { ThemeToggle } from './components/ThemeToggle';
import { Toaster } from './components/ui/toaster';
import { Settings, Search } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent } from './components/ui/dialog';
import { ProjectSearch } from './components/editor/ProjectSearch';

function App() {
  const [currentView, setCurrentView] = useState<'list' | 'editor'>('list');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const { loadProjects, currentProject, projects, setCurrentProject } = useProjectStore();
  const { loadConfig } = useConfigStore();
  const { initTheme } = useThemeStore();
  const [filteredProjects, setFilteredProjects] = useState(projects);

  useEffect(() => {
    initStorage();
    loadProjects();
    loadConfig();
    initTheme();
  }, [loadProjects, loadConfig, initTheme]);

  // 全局搜索快捷键 Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchResultClick = (project: typeof projects[0]) => {
    setCurrentProject(project);
    setCurrentView('editor');
    setSearchDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b border-border transition-colors duration-300">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">漫</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              漫剧创作助手
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {currentView === 'editor' && currentProject && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCurrentView('list')}
              >
                返回项目列表
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchDialogOpen(true)}
              title="搜索 (Ctrl+K)"
            >
              <Search className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-6 py-8">
        {currentView === 'list' ? (
          <ProjectList onOpenEditor={() => setCurrentView('editor')} />
        ) : (
          <Editor />
        )}
      </main>

      {/* API配置弹窗 */}
      <ConfigDialog 
        open={configDialogOpen} 
        onOpenChange={setConfigDialogOpen} 
      />

      {/* 全局搜索对话框 */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <ProjectSearch
            projects={projects}
            onResultsChange={setFilteredProjects}
          />
          {filteredProjects.length > 0 && (
            <div className="mt-4 space-y-2 max-h-60 overflow-auto">
              {filteredProjects.slice(0, 5).map((project) => (
                <div
                  key={project.id}
                  className="p-3 rounded-lg border hover:bg-muted cursor-pointer"
                  onClick={() => handleSearchResultClick(project)}
                >
                  <p className="font-medium">{project.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {project.summary || '暂无描述'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Toast通知 */}
      <Toaster />
    </div>
  );
}

export default App;
