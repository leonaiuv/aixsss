import { create } from 'zustand';
import { PromptTemplate } from '@/types';
import { BUILT_IN_TEMPLATES } from '@/lib/templates';

interface TemplateStore {
  templates: PromptTemplate[];
  currentTemplateId: string | null;
  
  // 操作方法
  loadBuiltInTemplates: () => void;
  loadTemplates: () => void;
  addTemplate: (template: Omit<PromptTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => PromptTemplate;
  updateTemplate: (templateId: string, updates: Partial<PromptTemplate>) => void;
  deleteTemplate: (templateId: string) => void;
  incrementUsage: (templateId: string) => void;
  setCurrentTemplate: (templateId: string | null) => void;
  getTemplatesByCategory: (category: string) => PromptTemplate[];
  searchTemplates: (query: string) => PromptTemplate[];
  getPopularTemplates: (limit?: number) => PromptTemplate[];
}

function getInitialTemplates(): PromptTemplate[] {
  if (typeof localStorage === 'undefined') return BUILT_IN_TEMPLATES;
  try {
    const stored = localStorage.getItem('aixs_templates');
    const customTemplates: PromptTemplate[] = stored ? JSON.parse(stored) : [];
    return [...BUILT_IN_TEMPLATES, ...customTemplates];
  } catch (error) {
    console.error('Failed to load templates:', error);
    return BUILT_IN_TEMPLATES;
  }
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: getInitialTemplates(),
  currentTemplateId: null,
  
  loadBuiltInTemplates: () => {
    set({ templates: BUILT_IN_TEMPLATES });
  },

  loadTemplates: () => {
    try {
      const stored = localStorage.getItem('aixs_templates');
      const customTemplates: PromptTemplate[] = stored ? JSON.parse(stored) : [];
      const templates = [...BUILT_IN_TEMPLATES, ...customTemplates];
      set({ templates });
    } catch (error) {
      console.error('Failed to load templates:', error);
      set({ templates: BUILT_IN_TEMPLATES });
    }
  },
  
  addTemplate: (templateData) => {
    const now = new Date().toISOString();
    const newTemplate: PromptTemplate = {
      ...templateData,
      id: `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    
    const templates = [...get().templates, newTemplate];
    set({ templates });
    saveCustomTemplates(templates);
    
    return newTemplate;
  },
  
  updateTemplate: (templateId: string, updates: Partial<PromptTemplate>) => {
    const templates = get().templates;
    const template = templates.find(t => t.id === templateId);
    
    if (template && template.isBuiltIn) {
      console.warn('Cannot update built-in template');
      return;
    }
    
    const updated = templates.map(t =>
      t.id === templateId
        ? { ...t, ...updates, updatedAt: new Date().toISOString() }
        : t
    );
    
    set({ templates: updated });
    saveCustomTemplates(updated);
  },
  
  deleteTemplate: (templateId: string) => {
    const template = get().templates.find(t => t.id === templateId);
    
    if (template?.isBuiltIn) {
      console.warn('Cannot delete built-in template');
      return;
    }
    
    const templates = get().templates.filter(t => t.id !== templateId);
    set({ templates });
    saveCustomTemplates(templates);
  },
  
  incrementUsage: (templateId: string) => {
    const templates = get().templates.map(t =>
      t.id === templateId
        ? { ...t, usageCount: t.usageCount + 1 }
        : t
    );
    
    set({ templates });
    saveCustomTemplates(templates);
  },
  
  setCurrentTemplate: (templateId: string | null) => {
    set({ currentTemplateId: templateId });
  },
  
  getTemplatesByCategory: (category: string) => {
    return get().templates.filter(t => t.category === category);
  },
  
  searchTemplates: (query: string) => {
    const lowerQuery = query.toLowerCase();
    return get().templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery)
    );
  },

  getPopularTemplates: (limit: number = 10) => {
    return [...get().templates].sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  },
}));

function saveCustomTemplates(templates: PromptTemplate[]) {
  try {
    const customTemplates = templates.filter(t => !t.isBuiltIn);
    localStorage.setItem('aixs_templates', JSON.stringify(customTemplates));
  } catch (error) {
    console.error('Failed to save templates:', error);
  }
}
