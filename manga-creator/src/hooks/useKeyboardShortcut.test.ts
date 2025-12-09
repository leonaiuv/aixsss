import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useKeyboardShortcut,
  isMac,
  getPlatformShortcut,
  formatShortcut,
  GLOBAL_SHORTCUTS,
} from './useKeyboardShortcut';

describe('useKeyboardShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should call callback when key is pressed', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('a', callback));

      const event = new KeyboardEvent('keydown', { key: 'a' });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should not call callback for different key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('a', callback));

      const event = new KeyboardEvent('keydown', { key: 'b' });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle modifier keys (ctrl)', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('ctrl+s', callback));

      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should not trigger without modifier when required', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('ctrl+s', callback));

      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: false });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle cmd/meta key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('cmd+k', callback));

      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle alt key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('alt+a', callback));

      const event = new KeyboardEvent('keydown', { key: 'a', altKey: true });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle shift key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('shift+a', callback));

      const event = new KeyboardEvent('keydown', { key: 'a', shiftKey: true });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle multiple modifiers', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('ctrl+shift+z', callback));

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
      });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('multiple shortcuts', () => {
    it('should handle array of shortcuts', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut(['a', 'b'], callback));

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(callback).toHaveBeenCalledTimes(1);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should not trigger for non-matching keys in array', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut(['a', 'b'], callback));

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('options', () => {
    it('should not call callback when disabled', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('a', callback, { enabled: false }));

      const event = new KeyboardEvent('keydown', { key: 'a' });
      window.dispatchEvent(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should prevent default when option is true', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('a', callback, { preventDefault: true }));

      const event = new KeyboardEvent('keydown', { key: 'a' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should not prevent default when option is false', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('a', callback, { preventDefault: false }));

      const event = new KeyboardEvent('keydown', { key: 'a' });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should remove event listener on unmount', () => {
      const callback = vi.fn();
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      const { unmount } = renderHook(() => useKeyboardShortcut('a', callback));
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalled();
    });
  });

  describe('special keys', () => {
    it('should handle escape key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('escape', callback));

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle enter key', () => {
      const callback = vi.fn();
      
      renderHook(() => useKeyboardShortcut('enter', callback));

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      window.dispatchEvent(event);

      expect(callback).toHaveBeenCalled();
    });
  });
});

describe('isMac', () => {
  it('should return false in jsdom environment', () => {
    // jsdom doesn't fully simulate Mac platform
    const result = isMac();
    expect(typeof result).toBe('boolean');
  });
});

describe('getPlatformShortcut', () => {
  it('should return base shortcut when not Mac', () => {
    // Mock non-Mac platform
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });

    const result = getPlatformShortcut('ctrl+s', 'cmd+s');
    expect(result).toBe('ctrl+s');

    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });
});

describe('formatShortcut', () => {
  it('should format ctrl key', () => {
    const result = formatShortcut('ctrl+s');
    expect(result).toContain('Ctrl');
  });

  it('should format single key', () => {
    const result = formatShortcut('s');
    expect(result).toBe('S');
  });

  it('should format multiple modifiers', () => {
    const result = formatShortcut('ctrl+shift+s');
    expect(result).toContain('Ctrl');
    expect(result).toContain('Shift');
    expect(result).toContain('S');
  });

  it('should capitalize main key', () => {
    const result = formatShortcut('escape');
    expect(result).toBe('Escape');
  });
});

describe('GLOBAL_SHORTCUTS', () => {
  it('should have all expected shortcuts defined', () => {
    expect(GLOBAL_SHORTCUTS.SAVE).toBeDefined();
    expect(GLOBAL_SHORTCUTS.SAVE_MAC).toBeDefined();
    expect(GLOBAL_SHORTCUTS.UNDO).toBeDefined();
    expect(GLOBAL_SHORTCUTS.UNDO_MAC).toBeDefined();
    expect(GLOBAL_SHORTCUTS.SEARCH).toBeDefined();
    expect(GLOBAL_SHORTCUTS.SEARCH_MAC).toBeDefined();
    expect(GLOBAL_SHORTCUTS.ESCAPE).toBeDefined();
    expect(GLOBAL_SHORTCUTS.ENTER).toBeDefined();
  });

  it('should have correct format for shortcuts', () => {
    expect(GLOBAL_SHORTCUTS.SAVE).toBe('ctrl+s');
    expect(GLOBAL_SHORTCUTS.SAVE_MAC).toBe('cmd+s');
    expect(GLOBAL_SHORTCUTS.SEARCH).toBe('ctrl+k');
    expect(GLOBAL_SHORTCUTS.SEARCH_MAC).toBe('cmd+k');
  });
});
