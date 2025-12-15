import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from './stores/projectStore';
import { useConfigStore } from './stores/configStore';
import { useThemeStore } from './stores/themeStore';
import { initStorage, flushScenePatchQueue } from './lib/storage';
import { isApiMode } from './lib/runtime/mode';
import { flushApiScenePatchQueue } from './lib/api/scenePatchQueue';
import { flushApiEpisodeScenePatchQueue } from './lib/api/episodeScenePatchQueue';
import { ProjectList } from './components/ProjectList';
import { ThemeToggle } from './components/ThemeToggle';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { Toaster } from './components/ui/toaster';
import { AIProgressToast, AIProgressIndicator } from './components/AIProgressToast';
import { initProgressBridge } from './lib/ai/progressBridge';
import { initAIUsageAnalytics } from './lib/ai/usageAnalytics';
import { Settings, Search, Terminal, Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { Dialog, DialogContent } from './components/ui/dialog';
import { useAIProgressStore } from './stores/aiProgressStore';
import {
  useKeyboardShortcut,
  GLOBAL_SHORTCUTS,
  getPlatformShortcut,
} from './hooks/useKeyboardShortcut';
import { useAuthStore } from './stores/authStore';
import { AuthPage } from './components/AuthPage';

// 懒加载重型组件
const Editor = lazy(() => import('./components/Editor').then((m) => ({ default: m.Editor })));
const ConfigDialog = lazy(() =>
  import('./components/ConfigDialog').then((m) => ({ default: m.ConfigDialog })),
);
const DevPanel = lazy(() => import('./components/DevPanel').then((m) => ({ default: m.DevPanel })));
const DevPanelTrigger = lazy(() =>
  import('./components/DevPanel').then((m) => ({ default: m.DevPanelTrigger })),
);
const ProjectSearch = lazy(() =>
  import('./components/editor/ProjectSearch').then((m) => ({ default: m.ProjectSearch })),
);

// 加载占位组件
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function EditorRouteLoader() {
  const { projectId } = useParams();
  const loadProject = useProjectStore((s) => s.loadProject);
  const currentProjectId = useProjectStore((s) => s.currentProject?.id ?? null);

  useEffect(() => {
    if (!projectId) return;
    loadProject(projectId);
  }, [projectId, loadProject]);

  if (!projectId) return <Navigate to="/" replace />;
  if (currentProjectId !== projectId) return <LoadingFallback />;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Editor />
    </Suspense>
  );
}

function LocalApp() {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isInEditor = location.pathname.startsWith('/projects/');

  // 使用选择器优化，避免订阅整个 store
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const currentProject = useProjectStore((state) => state.currentProject);
  const projects = useProjectStore((state) => state.projects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const loadConfig = useConfigStore((state) => state.loadConfig);
  const initTheme = useThemeStore((state) => state.initTheme);
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);
  const togglePanel = useAIProgressStore((state) => state.togglePanel);
  const isPanelVisible = useAIProgressStore((state) => state.isPanelVisible);

  useEffect(() => {
    initStorage();
    loadProjects();
    loadConfig();
    initTheme();

    // 初始化AI进度桥接器
    const cleanupBridge = initProgressBridge();
    const cleanupUsageAnalytics = initAIUsageAnalytics();

    return () => {
      cleanupBridge();
      cleanupUsageAnalytics();
    };
  }, [loadProjects, loadConfig, initTheme]);

  // 分镜编辑采用批量 patch 写入：在页面隐藏/退出时强制落盘，避免最后一段输入丢失
  useEffect(() => {
    const flush = () => {
      try {
        flushScenePatchQueue();
        void flushApiScenePatchQueue();
        void flushApiEpisodeScenePatchQueue();
      } catch {
        // 忽略：避免影响页面卸载
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 全局搜索快捷键：Ctrl/Cmd + K
  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.SEARCH, GLOBAL_SHORTCUTS.SEARCH_MAC),
    () => setSearchDialogOpen(true),
  );

  // 切换主题：Ctrl/Cmd + Shift + T
  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.TOGGLE_THEME, GLOBAL_SHORTCUTS.TOGGLE_THEME_MAC),
    () => toggleThemeMode(),
  );

  // 使用 useCallback 缓存回调函数
  const handleBackToList = useCallback(() => {
    setCurrentProject(null);
    navigate('/');
  }, [navigate, setCurrentProject]);
  const handleOpenConfig = useCallback(() => setConfigDialogOpen(true), []);
  const handleOpenSearch = useCallback(() => setSearchDialogOpen(true), []);

  const handleSearchResultClick = useCallback(
    (project: (typeof projects)[0]) => {
      setCurrentProject(project);
      navigate(`/projects/${encodeURIComponent(project.id)}`);
      setSearchDialogOpen(false);
    },
    [setCurrentProject, navigate],
  );

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
            {isInEditor && (
              <Button variant="ghost" size="sm" onClick={handleBackToList}>
                返回项目列表
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenSearch}
              title="搜索 (Ctrl+K)"
              aria-label="搜索项目 (Ctrl+K)"
            >
              <Search className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePanel}
              title="开发者面板"
              className={isPanelVisible ? 'bg-muted' : ''}
              aria-label="开发者面板"
            >
              <Terminal className="h-5 w-5" />
            </Button>
            <KeyboardShortcuts />
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleOpenConfig} aria-label="设置">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<ProjectList />} />
          <Route path="/projects/:projectId" element={<EditorRouteLoader />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* API配置弹窗 */}
      <Suspense fallback={null}>
        <ConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
      </Suspense>

      {/* 全局搜索对话框 */}
      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <Suspense fallback={<LoadingFallback />}>
            <ProjectSearch projects={projects} onSelect={handleSearchResultClick} />
          </Suspense>
        </DialogContent>
      </Dialog>

      {/* Toast通知 */}
      <Toaster />

      {/* AI进度提醒 */}
      <AIProgressToast />
      <AIProgressIndicator />

      {/* 开发者面板 */}
      <Suspense fallback={null}>
        <DevPanel />
        <DevPanelTrigger />
      </Suspense>
    </div>
  );
}

function BackendApp() {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isInEditor = location.pathname.startsWith('/projects/');

  const loadProjects = useProjectStore((state) => state.loadProjects);
  const currentProject = useProjectStore((state) => state.currentProject);
  const projects = useProjectStore((state) => state.projects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const loadConfig = useConfigStore((state) => state.loadConfig);
  const initTheme = useThemeStore((state) => state.initTheme);
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);
  const togglePanel = useAIProgressStore((state) => state.togglePanel);
  const isPanelVisible = useAIProgressStore((state) => state.isPanelVisible);

  const user = useAuthStore((s) => s.user);
  const loadAuth = useAuthStore((s) => s.loadFromStorage);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    // 本地存储仍用于部分“离线/缓存/兼容”数据（例如：旧数据迁移、开发面板日志等）
    initStorage();
    initTheme();
    void loadAuth();

    const cleanupBridge = initProgressBridge();
    const cleanupUsageAnalytics = initAIUsageAnalytics();

    return () => {
      cleanupBridge();
      cleanupUsageAnalytics();
    };
  }, [initTheme, loadAuth]);

  useEffect(() => {
    if (!user) return;
    loadProjects();
    loadConfig();
  }, [user, loadProjects, loadConfig]);

  useEffect(() => {
    const flush = () => {
      try {
        flushScenePatchQueue();
        void flushApiScenePatchQueue();
        void flushApiEpisodeScenePatchQueue();
      } catch {
        // ignore
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.SEARCH, GLOBAL_SHORTCUTS.SEARCH_MAC),
    () => setSearchDialogOpen(true),
  );

  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.TOGGLE_THEME, GLOBAL_SHORTCUTS.TOGGLE_THEME_MAC),
    () => toggleThemeMode(),
  );

  const handleBackToList = useCallback(() => {
    setCurrentProject(null);
    navigate('/');
  }, [navigate, setCurrentProject]);
  const handleOpenConfig = useCallback(() => setConfigDialogOpen(true), []);
  const handleOpenSearch = useCallback(() => setSearchDialogOpen(true), []);

  const handleSearchResultClick = useCallback(
    (project: (typeof projects)[0]) => {
      setCurrentProject(project);
      navigate(`/projects/${encodeURIComponent(project.id)}`);
      setSearchDialogOpen(false);
    },
    [setCurrentProject, navigate],
  );

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
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
            {user ? (
              <>
                {isInEditor ? (
                  <Button variant="ghost" size="sm" onClick={handleBackToList}>
                    返回项目列表
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleOpenSearch}
                  title="搜索 (Ctrl+K)"
                  aria-label="搜索项目 (Ctrl+K)"
                >
                  <Search className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePanel}
                  title="开发者面板"
                  className={isPanelVisible ? 'bg-muted' : ''}
                  aria-label="开发者面板"
                >
                  <Terminal className="h-5 w-5" />
                </Button>
                <KeyboardShortcuts />
                <ThemeToggle />
                <Button variant="ghost" size="icon" onClick={handleOpenConfig} aria-label="设置">
                  <Settings className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  退出
                </Button>
              </>
            ) : (
              <>
                <KeyboardShortcuts />
                <ThemeToggle />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
          <Route path="/" element={user ? <ProjectList /> : <Navigate to="/login" replace />} />
          <Route
            path="/projects/:projectId"
            element={user ? <EditorRouteLoader /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </main>

      {user ? (
        <Suspense fallback={null}>
          <ConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
        </Suspense>
      ) : null}

      {user ? (
        <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
          <DialogContent className="max-w-2xl">
            <Suspense fallback={<LoadingFallback />}>
              <ProjectSearch projects={projects} onSelect={handleSearchResultClick} />
            </Suspense>
          </DialogContent>
        </Dialog>
      ) : null}

      <Toaster />
      {user ? (
        <>
          <AIProgressToast />
          <AIProgressIndicator />
        </>
      ) : null}

      {user ? (
        <Suspense fallback={null}>
          <DevPanel />
          <DevPanelTrigger />
        </Suspense>
      ) : null}
    </div>
  );
}

function App() {
  return isApiMode() ? <BackendApp /> : <LocalApp />;
}

export default App;
