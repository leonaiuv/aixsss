import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from './stores/projectStore';
import { useConfigStore } from './stores/configStore';
import { useThemeStore } from './stores/themeStore';
import { initStorage, flushScenePatchQueue } from './lib/storage';
import { isApiMode } from './lib/runtime/mode';
import { flushApiScenePatchQueue } from './lib/api/scenePatchQueue';
import { flushApiEpisodeScenePatchQueue } from './lib/api/episodeScenePatchQueue';
import { ProjectList } from './components/ProjectList';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { Toaster } from './components/ui/toaster';
import { AIProgressToast, AIProgressIndicator } from './components/AIProgressToast';
import { initProgressBridge } from './lib/ai/progressBridge';
import { initAIUsageAnalytics } from './lib/ai/usageAnalytics';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from './components/ui/dialog';
import {
  useKeyboardShortcut,
  GLOBAL_SHORTCUTS,
  getPlatformShortcut,
} from './hooks/useKeyboardShortcut';
import { useAuthStore } from './stores/authStore';
import { AuthPage } from './components/AuthPage';
import { AppLayout } from './components/layout/AppLayout';

// 懒加载重型组件
const Editor = lazy(() => import('./components/Editor').then((m) => ({ default: m.Editor })));
const ConfigDialog = lazy(() =>
  import('./components/ConfigDialog').then((m) => ({ default: m.ConfigDialog })),
);
const SettingsDialog = lazy(() =>
  import('./components/SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
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
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const navigate = useNavigate();

  // 使用选择器优化，避免订阅整个 store
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const projects = useProjectStore((state) => state.projects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const loadConfig = useConfigStore((state) => state.loadConfig);
  const initTheme = useThemeStore((state) => state.initTheme);
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);

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

  const handleOpenConfig = useCallback(() => setConfigDialogOpen(true), []);
  const handleOpenSearch = useCallback(() => setSearchDialogOpen(true), []);
  const handleOpenSettings = useCallback(() => setSettingsDialogOpen(true), []);

  const handleSearchResultClick = useCallback(
    (project: (typeof projects)[0]) => {
      setCurrentProject(project);
      navigate(`/projects/${encodeURIComponent(project.id)}`);
      setSearchDialogOpen(false);
    },
    [setCurrentProject, navigate],
  );

  return (
    <AppLayout onSearch={handleOpenSearch} onConfig={handleOpenConfig} onSettings={handleOpenSettings}>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<EditorRouteLoader />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* AI 设置弹窗 */}
      <Suspense fallback={null}>
        <ConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
      </Suspense>

      {/* 设置弹窗 */}
      <Suspense fallback={null}>
        <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
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
      <KeyboardShortcuts />

      {/* AI进度提醒 */}
      <AIProgressToast />
      <AIProgressIndicator />

      {/* 开发者面板 */}
      <Suspense fallback={null}>
        <DevPanel />
        <DevPanelTrigger />
      </Suspense>
    </AppLayout>
  );
}

function BackendApp() {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const navigate = useNavigate();

  const loadProjects = useProjectStore((state) => state.loadProjects);
  const projects = useProjectStore((state) => state.projects);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const loadConfig = useConfigStore((state) => state.loadConfig);
  const initTheme = useThemeStore((state) => state.initTheme);
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);

  const user = useAuthStore((s) => s.user);
  const loadAuth = useAuthStore((s) => s.loadFromStorage);

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

  const handleOpenConfig = useCallback(() => setConfigDialogOpen(true), []);
  const handleOpenSearch = useCallback(() => setSearchDialogOpen(true), []);
  const handleOpenSettings = useCallback(() => setSettingsDialogOpen(true), []);

  const handleSearchResultClick = useCallback(
    (project: (typeof projects)[0]) => {
      setCurrentProject(project);
      navigate(`/projects/${encodeURIComponent(project.id)}`);
      setSearchDialogOpen(false);
    },
    [setCurrentProject, navigate],
  );

  // If user is not logged in, render AuthPage with full-screen layout
  if (!user) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </>
    );
  }

  return (
    <AppLayout onSearch={handleOpenSearch} onConfig={handleOpenConfig} onSettings={handleOpenSettings}>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<EditorRouteLoader />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Suspense fallback={null}>
        <ConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} />
      </Suspense>

      <Suspense fallback={null}>
        <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
      </Suspense>

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <Suspense fallback={<LoadingFallback />}>
            <ProjectSearch projects={projects} onSelect={handleSearchResultClick} />
          </Suspense>
        </DialogContent>
      </Dialog>

      <Toaster />
      <KeyboardShortcuts />
      <AIProgressToast />
      <AIProgressIndicator />

      <Suspense fallback={null}>
        <DevPanel />
        <DevPanelTrigger />
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return isApiMode() ? <BackendApp /> : <LocalApp />;
}

export default App;
