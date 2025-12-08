import { useEffect, useState } from 'react';
import { useProjectStore } from './stores/projectStore';
import { useConfigStore } from './stores/configStore';
import { initStorage } from './lib/storage';
import { ProjectList } from './components/ProjectList';
import { Editor } from './components/Editor';
import { ConfigDialog } from './components/ConfigDialog';
import { Toaster } from './components/ui/toaster';
import { Settings } from 'lucide-react';
import { Button } from './components/ui/button';

function App() {
  const [currentView, setCurrentView] = useState<'list' | 'editor'>('list');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const { loadProjects, currentProject } = useProjectStore();
  const { loadConfig } = useConfigStore();

  useEffect(() => {
    initStorage();
    loadProjects();
    loadConfig();
  }, [loadProjects, loadConfig]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-slate-900/80 border-b border-slate-800">
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

      {/* Toast通知 */}
      <Toaster />
    </div>
  );
}

export default App;
