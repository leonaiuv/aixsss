import { create } from 'zustand';
import { Project, Scene, SearchFilter } from '@/types';

interface SearchHistory {
  id: string;
  query: string;
  timestamp: string;
}

interface SearchStore {
  query: string;
  filters: SearchFilter;
  results: {
    projects: Project[];
    scenes: Scene[];
  };
  isSearching: boolean;
  searchHistory: SearchHistory[];
  
  // 操作方法
  setQuery: (query: string) => void;
  setFilters: (filters: Partial<SearchFilter>) => void;
  search: (projects: Project[], scenesMap: Record<string, Scene[]>) => void;
  clearSearch: () => void;
  addSearchHistory: (query: string) => void;
  getSearchHistory: () => SearchHistory[];
  clearSearchHistory: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  filters: {
    query: '',
  },
  results: {
    projects: [],
    scenes: [],
  },
  isSearching: false,
  searchHistory: [],
  
  setQuery: (query: string) => {
    set({ query });
  },
  
  setFilters: (filters: Partial<SearchFilter>) => {
    set(state => ({
      filters: { ...state.filters, ...filters },
    }));
  },
  
  search: (projects: Project[], scenesMap: Record<string, Scene[]>) => {
    set({ isSearching: true });
    
    const { query, filters } = get();
    const lowerQuery = query.toLowerCase();
    
    // 搜索项目
    const matchedProjects = projects.filter(project => {
      if (!lowerQuery) return true;
      
      return (
        project.title.toLowerCase().includes(lowerQuery) ||
        project.summary.toLowerCase().includes(lowerQuery) ||
        project.protagonist.toLowerCase().includes(lowerQuery) ||
        project.style.toLowerCase().includes(lowerQuery)
      );
    });
    
    // 搜索分镜
    const matchedScenes: Scene[] = [];
    for (const project of projects) {
      const scenes = scenesMap[project.id] || [];
      const filtered = scenes.filter(scene => {
        if (!lowerQuery) return false;
        
        const matchesQuery =
          scene.summary.toLowerCase().includes(lowerQuery) ||
          scene.sceneDescription.toLowerCase().includes(lowerQuery) ||
          scene.actionDescription.toLowerCase().includes(lowerQuery) ||
          scene.shotPrompt.toLowerCase().includes(lowerQuery);
        
        const matchesStatus = !filters.status || filters.status.includes(scene.status);
        
        return matchesQuery && matchesStatus;
      });
      
      matchedScenes.push(...filtered);
    }
    
    set({
      results: {
        projects: matchedProjects,
        scenes: matchedScenes,
      },
      isSearching: false,
    });
  },
  
  clearSearch: () => {
    set({
      query: '',
      filters: { query: '' },
      results: { projects: [], scenes: [] },
    });
  },
  
  addSearchHistory: (query: string) => {
    if (!query.trim()) return;
    const newHistory: SearchHistory = {
      id: `sh_${Date.now()}`,
      query: query.trim(),
      timestamp: new Date().toISOString(),
    };
    set(state => ({
      searchHistory: [newHistory, ...state.searchHistory.filter(h => h.query !== query)].slice(0, 10),
    }));
  },
  
  getSearchHistory: () => {
    return get().searchHistory;
  },
  
  clearSearchHistory: () => {
    set({ searchHistory: [] });
  },
}));
