import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Terminal,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Separator } from '@/components/ui/separator';

interface SidebarProps {
  className?: string;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  onSearch: () => void;
  onConfig: () => void;
}

export function Sidebar({
  className,
  isCollapsed,
  toggleCollapse,
  onSearch,
  onConfig,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode: theme, toggleMode } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { isPanelVisible, togglePanel } = useAIProgressStore();

  const isActive = (path: string) => location.pathname === path;

  return (
    <aside
      className={cn(
        'group relative flex flex-col border-r bg-muted/30 transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-14' : 'w-64',
        className,
      )}
    >
      {/* Header / Logo */}
      <div
        className={cn(
          'flex h-14 items-center px-3',
          isCollapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2 font-semibold overflow-hidden">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-xs">M</span>
            </div>
            <span className="truncate">漫剧创作助手</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', isCollapsed && 'h-8 w-8')}
          onClick={toggleCollapse}
          title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Main Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="grid gap-1 px-2">
          <Button
            variant={isActive('/') ? 'secondary' : 'ghost'}
            size={isCollapsed ? 'icon' : 'sm'}
            className={cn('justify-start', isCollapsed && 'justify-center')}
            onClick={() => navigate('/')}
            title="项目列表"
          >
            <Home className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && <span>我的项目</span>}
          </Button>

          <Button
            variant="ghost"
            size={isCollapsed ? 'icon' : 'sm'}
            className={cn('justify-start', isCollapsed && 'justify-center')}
            onClick={onSearch}
            title="搜索 (Ctrl+K)"
          >
            <Search className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && <span>搜索</span>}
          </Button>

          <Button
            variant="ghost"
            size={isCollapsed ? 'icon' : 'sm'}
            className={cn('justify-start', isCollapsed && 'justify-center')}
            onClick={onConfig}
            title="设置"
          >
            <Settings className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && <span>设置</span>}
          </Button>
        </nav>

        <Separator className="my-2 mx-2" />

        <nav className="grid gap-1 px-2">
          <Button
            variant={isPanelVisible ? 'secondary' : 'ghost'}
            size={isCollapsed ? 'icon' : 'sm'}
            className={cn('justify-start', isCollapsed && 'justify-center')}
            onClick={togglePanel}
            title="开发者面板"
          >
            <Terminal className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            {!isCollapsed && <span>开发者面板</span>}
          </Button>
        </nav>
      </ScrollArea>

      {/* Footer / User */}
      <div className="mt-auto border-t p-2">
        <div className="grid gap-1">
          <Button
            variant="ghost"
            size={isCollapsed ? 'icon' : 'sm'}
            className={cn('justify-start', isCollapsed && 'justify-center')}
            onClick={toggleMode}
            title="切换主题"
          >
            {theme === 'dark' ? (
              <Moon className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            ) : (
              <Sun className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
            )}
            {!isCollapsed && <span>{theme === 'dark' ? '深色模式' : '浅色模式'}</span>}
          </Button>

          {user && (
            <Button
              variant="ghost"
              size={isCollapsed ? 'icon' : 'sm'}
              className={cn(
                'justify-start text-destructive hover:text-destructive hover:bg-destructive/10',
                isCollapsed && 'justify-center',
              )}
              onClick={logout}
              title="退出登录"
            >
              <LogOut className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
              {!isCollapsed && <span>退出登录</span>}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
