import { create } from 'zustand';
import { ThemeMode } from '@/types';

interface ThemeStore {
  mode: ThemeMode;
  
  // 操作方法
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  
  setMode: (mode: ThemeMode) => {
    set({ mode });
    localStorage.setItem('aixs_theme', mode);
    applyTheme(mode);
  },
  
  toggleMode: () => {
    const current = get().mode;
    const next = current === 'light' ? 'dark' : 'light';
    get().setMode(next);
  },
  
  initTheme: () => {
    const saved = localStorage.getItem('aixs_theme') as ThemeMode | null;
    const mode = saved || 'system';
    set({ mode });
    applyTheme(mode);
  },
}));

// 应用主题
function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', mode === 'dark');
  }
}

// 监听系统主题变化
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const store = useThemeStore.getState();
    if (store.mode === 'system') {
      document.documentElement.classList.toggle('dark', e.matches);
    }
  });
}
