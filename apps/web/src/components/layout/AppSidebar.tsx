import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useAIProgressStore } from '@/stores/aiProgressStore';
import { Kbd } from '@/components/ui/kbd';
import {
  Home,
  Search,
  Settings,
  Terminal,
  Moon,
  Sun,
  LogOut,
  BookOpen,
  Sparkles,
} from 'lucide-react';

interface AppSidebarProps {
  onSearch: () => void;
  onConfig: () => void;
}

export function AppSidebar({ onSearch, onConfig }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode: theme, toggleMode } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { isPanelVisible, togglePanel } = useAIProgressStore();
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Header - 品牌标识 */}
      <SidebarHeader className="h-14 flex-row items-center justify-center border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {/* 印章式 Logo */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="h-4 w-4" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-display text-sm font-semibold tracking-tight">
                漫剧创作
              </span>
              <span className="text-[10px] text-sidebar-foreground/60">
                AI 分镜助手
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {/* 主导航 */}
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActive('/')}
                  onClick={() => navigate('/')}
                  tooltip="我的项目"
                >
                  <Home className="h-4 w-4" />
                  <span>我的项目</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton onClick={onSearch} tooltip="搜索 (⌘K)">
                  <Search className="h-4 w-4" />
                  <span className="flex-1">搜索</span>
                  {!isCollapsed && (
                    <Kbd className="ml-auto opacity-60">⌘K</Kbd>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* 工具 */}
        <SidebarGroup>
          <SidebarGroupLabel>工具</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onConfig} tooltip="AI 设置">
                  <Sparkles className="h-4 w-4" />
                  <span>AI 设置</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isPanelVisible}
                  onClick={togglePanel}
                  tooltip="开发者面板"
                >
                  <Terminal className="h-4 w-4" />
                  <span>开发者面板</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleMode} tooltip={theme === 'dark' ? '切换到浅色' : '切换到深色'}>
              {theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              <span>{theme === 'dark' ? '深色模式' : '浅色模式'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton onClick={onConfig} tooltip="设置">
              <Settings className="h-4 w-4" />
              <span>设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={logout}
                tooltip="退出登录"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

