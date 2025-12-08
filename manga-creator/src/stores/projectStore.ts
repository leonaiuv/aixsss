import { create } from 'zustand';
import { Project } from '@/types';
import { getProjects, saveProject, deleteProject as deleteProjectStorage, getProject } from '@/lib/storage';

interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  
  // 操作方法
  loadProjects: () => void;
  loadProject: (projectId: string) => void;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  
  loadProjects: () => {
    set({ isLoading: true });
    try {
      const projects = getProjects();
      set({ projects, isLoading: false });
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
    }
  },
  
  loadProject: (projectId: string) => {
    const project = getProject(projectId);
    if (project) {
      set({ currentProject: project });
    }
  },
  
  createProject: (projectData) => {
    const now = new Date().toISOString();
    const newProject: Project = {
      ...projectData,
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
      workflowState: 'DATA_COLLECTING',
      currentSceneOrder: 0,
    };
    
    saveProject(newProject);
    
    set(state => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
    }));
    
    return newProject;
  },
  
  updateProject: (projectId, updates) => {
    const projects = get().projects;
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
      const updatedProject = { 
        ...project, 
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      saveProject(updatedProject);
      
      set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        currentProject: state.currentProject?.id === projectId ? updatedProject : state.currentProject,
      }));
    }
  },
  
  deleteProject: (projectId) => {
    deleteProjectStorage(projectId);
    set(state => ({
      projects: state.projects.filter(p => p.id !== projectId),
      currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
    }));
  },
  
  setCurrentProject: (project) => {
    set({ currentProject: project });
  },
}));
