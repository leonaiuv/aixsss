// ==========================================
// 主题切换组件
// ==========================================
// 功能：
// 1. 亮色/暗色主题切换
// 2. 跟随系统主题
// 3. 主题持久化
// ==========================================

import { memo, useCallback } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sun, Moon, Monitor } from 'lucide-react';

function ThemeToggleComponent() {
  // 使用选择器优化
  const theme = useThemeStore(state => state.mode);
  const setTheme = useThemeStore(state => state.setMode);
  
  // 使用 useCallback 缓存回调
  const handleLightTheme = useCallback(() => setTheme('light'), [setTheme]);
  const handleDarkTheme = useCallback(() => setTheme('dark'), [setTheme]);
  const handleSystemTheme = useCallback(() => setTheme('system'), [setTheme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题" title="切换主题">
          {theme === 'light' && <Sun className="h-5 w-5" />}
          {theme === 'dark' && <Moon className="h-5 w-5" />}
          {theme === 'system' && <Monitor className="h-5 w-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleLightTheme}>
          <Sun className="h-4 w-4 mr-2" />
          亮色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDarkTheme}>
          <Moon className="h-4 w-4 mr-2" />
          暗色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSystemTheme}>
          <Monitor className="h-4 w-4 mr-2" />
          跟随系统
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 使用 memo 优化重渲染
export const ThemeToggle = memo(ThemeToggleComponent);
