import { useEffect, useCallback } from 'react';

export type ShortcutKey = string; // 如 'ctrl+s', 'cmd+k', 'escape'

interface UseKeyboardShortcutOptions {
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * 键盘快捷键Hook
 * @param keys 快捷键组合，如 'ctrl+s', 'cmd+k'
 * @param callback 回调函数
 * @param options 选项
 */
export function useKeyboardShortcut(
  keys: ShortcutKey | ShortcutKey[],
  callback: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {}
) {
  const { enabled = true, preventDefault = true } = options;
  
  const keyArray = Array.isArray(keys) ? keys : [keys];
  
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      
      for (const keyCombo of keyArray) {
        if (matchesKeyCombo(event, keyCombo)) {
          if (preventDefault) {
            event.preventDefault();
          }
          callback(event);
          break;
        }
      }
    },
    [keyArray, callback, enabled, preventDefault]
  );
  
  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}

/**
 * 判断按键事件是否匹配快捷键组合
 */
function matchesKeyCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.pop(); // 最后一个是主键
  
  if (!key) return false;
  
  // 检查修饰键
  const needsCtrl = parts.includes('ctrl');
  const needsCmd = parts.includes('cmd') || parts.includes('meta');
  const needsAlt = parts.includes('alt');
  const needsShift = parts.includes('shift');
  
  const hasCtrl = event.ctrlKey;
  const hasCmd = event.metaKey;
  const hasAlt = event.altKey;
  const hasShift = event.shiftKey;
  
  // 检查修饰键是否匹配
  if (needsCtrl !== hasCtrl) return false;
  if (needsCmd !== hasCmd) return false;
  if (needsAlt !== hasAlt) return false;
  if (needsShift !== hasShift) return false;
  
  // 检查主键
  const eventKey = event.key.toLowerCase();
  return eventKey === key || event.code.toLowerCase() === key.toLowerCase();
}

/**
 * 全局快捷键配置
 */
export const GLOBAL_SHORTCUTS = {
  // 通用
  SAVE: 'ctrl+s',
  SAVE_MAC: 'cmd+s',
  UNDO: 'ctrl+z',
  UNDO_MAC: 'cmd+z',
  REDO: 'ctrl+shift+z',
  REDO_MAC: 'cmd+shift+z',
  SEARCH: 'ctrl+k',
  SEARCH_MAC: 'cmd+k',
  
  // 导航
  ESCAPE: 'escape',
  ENTER: 'enter',
  
  // 编辑
  NEW: 'ctrl+n',
  NEW_MAC: 'cmd+n',
  DELETE: 'delete',
  DELETE_ALT: 'backspace',
  
  // 视图
  TOGGLE_SIDEBAR: 'ctrl+b',
  TOGGLE_SIDEBAR_MAC: 'cmd+b',
  TOGGLE_THEME: 'ctrl+shift+t',
  TOGGLE_THEME_MAC: 'cmd+shift+t',
  
  // AI生成
  GENERATE: 'ctrl+g',
  GENERATE_MAC: 'cmd+g',
  CANCEL: 'ctrl+.',
  CANCEL_MAC: 'cmd+.',
};

/**
 * 检测是否为Mac系统
 */
export function isMac(): boolean {
  return typeof window !== 'undefined' && /Mac/.test(navigator.platform);
}

/**
 * 获取平台适配的快捷键
 */
export function getPlatformShortcut(base: string, mac: string): string {
  return isMac() ? mac : base;
}

/**
 * 格式化快捷键显示
 */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+');
  const formatted = parts.map(part => {
    switch (part.toLowerCase()) {
      case 'ctrl':
        return 'Ctrl';
      case 'cmd':
      case 'meta':
        return '⌘';
      case 'alt':
        return isMac() ? '⌥' : 'Alt';
      case 'shift':
        return isMac() ? '⇧' : 'Shift';
      default:
        return part.charAt(0).toUpperCase() + part.slice(1);
    }
  });
  
  return formatted.join(isMac() ? '' : '+');
}
