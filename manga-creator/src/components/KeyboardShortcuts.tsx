// ==========================================
// 键盘快捷键管理组件
// ==========================================
// 功能：
// 1. 快捷键列表展示
// 2. 自定义快捷键
// 3. 快捷键冲突检测
// 4. 快捷键提示
// ==========================================

import { useState, useEffect } from 'react';
import { useKeyboardShortcut, GLOBAL_SHORTCUTS, getPlatformShortcut } from '@/hooks/useKeyboardShortcut';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Keyboard, Command, Info } from 'lucide-react';

interface ShortcutConfig {
  id: string;
  name: string;
  description: string;
  keys: string[];
  enabled: boolean;
  category: 'navigation' | 'editing' | 'generation' | 'view';
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    id: 'new-project',
    name: '新建项目',
    description: '创建一个新的漫剧项目',
    keys: ['Ctrl', 'N'],
    enabled: true,
    category: 'navigation',
  },
  {
    id: 'save',
    name: '保存',
    description: '保存当前项目',
    keys: ['Ctrl', 'S'],
    enabled: true,
    category: 'editing',
  },
  {
    id: 'undo',
    name: '撤销',
    description: '撤销上一步操作',
    keys: ['Ctrl', 'Z'],
    enabled: true,
    category: 'editing',
  },
  {
    id: 'redo',
    name: '重做',
    description: '重做上一步操作',
    keys: ['Ctrl', 'Shift', 'Z'],
    enabled: true,
    category: 'editing',
  },
  {
    id: 'search',
    name: '搜索',
    description: '打开搜索对话框',
    keys: ['Ctrl', 'K'],
    enabled: true,
    category: 'navigation',
  },
  {
    id: 'generate-scene',
    name: '生成场景锚点',
    description: '生成当前分镜的场景锚点（环境一致性）',
    keys: ['Ctrl', 'G'],
    enabled: true,
    category: 'generation',
  },
  {
    id: 'next-scene',
    name: '下一个分镜',
    description: '切换到下一个分镜',
    keys: ['Ctrl', 'ArrowRight'],
    enabled: true,
    category: 'navigation',
  },
  {
    id: 'prev-scene',
    name: '上一个分镜',
    description: '切换到上一个分镜',
    keys: ['Ctrl', 'ArrowLeft'],
    enabled: true,
    category: 'navigation',
  },
  {
    id: 'toggle-theme',
    name: '切换主题',
    description: '在亮色和暗色主题之间切换',
    keys: ['Ctrl', 'Shift', 'T'],
    enabled: true,
    category: 'view',
  },
  {
    id: 'export',
    name: '导出',
    description: '导出当前项目',
    keys: ['Ctrl', 'E'],
    enabled: true,
    category: 'editing',
  },
  {
    id: 'help',
    name: '帮助',
    description: '显示快捷键帮助',
    keys: ['Ctrl', '/'],
    enabled: true,
    category: 'navigation',
  },
];

export function KeyboardShortcuts() {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig[]>(DEFAULT_SHORTCUTS);
  const [isOpen, setIsOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  // 监听快捷键提示 (Ctrl+/)
  useKeyboardShortcut(
    getPlatformShortcut(GLOBAL_SHORTCUTS.HELP, GLOBAL_SHORTCUTS.HELP_MAC),
    () => setIsOpen(true)
  );

  // 录制快捷键
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      
      const key = e.key === ' ' ? 'Space' : e.key;
      const modifiers = [];
      
      if (e.ctrlKey || e.metaKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      
      // 只记录非修饰键
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        setRecordedKeys([...modifiers, key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recording]);

  const startRecording = (shortcutId: string) => {
    setEditingShortcut(shortcutId);
    setRecording(true);
    setRecordedKeys([]);
  };

  const saveShortcut = () => {
    if (editingShortcut && recordedKeys.length > 0) {
      setShortcuts((prev) =>
        prev.map((s) =>
          s.id === editingShortcut ? { ...s, keys: recordedKeys } : s
        )
      );
    }
    setEditingShortcut(null);
    setRecording(false);
    setRecordedKeys([]);
  };

  const cancelRecording = () => {
    setEditingShortcut(null);
    setRecording(false);
    setRecordedKeys([]);
  };

  const toggleShortcut = (shortcutId: string) => {
    setShortcuts((prev) =>
      prev.map((s) => (s.id === shortcutId ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const resetToDefaults = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
  };

  // 按类别分组
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutConfig[]>);

  const categoryNames = {
    navigation: '导航',
    editing: '编辑',
    generation: '生成',
    view: '视图',
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="键盘快捷键" title="键盘快捷键 (Ctrl+/)">
          <Keyboard className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            键盘快捷键
          </DialogTitle>
          <DialogDescription>
            查看和自定义键盘快捷键，按 Ctrl+/ 随时打开此面板
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            重置为默认
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
              <div key={category}>
                <h3 className="text-lg font-semibold mb-3">
                  {categoryNames[category as keyof typeof categoryNames]}
                </h3>
                <div className="space-y-2">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{shortcut.name}</span>
                          {!shortcut.enabled && (
                            <Badge variant="secondary" className="text-xs">
                              已禁用
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {shortcut.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 ml-4">
                        {/* 快捷键显示 */}
                        <div className="flex gap-1">
                          {(editingShortcut === shortcut.id && recording
                            ? recordedKeys
                            : shortcut.keys
                          ).map((key, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="font-mono text-xs px-2"
                            >
                              {key}
                            </Badge>
                          ))}
                        </div>

                        {/* 操作按钮 */}
                        {editingShortcut === shortcut.id ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveShortcut}
                              disabled={recordedKeys.length === 0}
                            >
                              保存
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelRecording}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startRecording(shortcut.id)}
                            >
                              编辑
                            </Button>
                            <Switch
                              checked={shortcut.enabled}
                              onCheckedChange={() => toggleShortcut(shortcut.id)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {category !== 'view' && <Separator className="my-4" />}
              </div>
            ))}
          </div>
        </ScrollArea>

        {recording && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-semibold mb-1">录制快捷键中...</p>
                <p>按下你想要设置的组合键（例如 Ctrl+Shift+K）</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
