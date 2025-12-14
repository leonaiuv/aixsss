import { create } from 'zustand';
import { Project, migrateOldStyleToConfig } from '@/types';
import { getProjects, saveProject, deleteProject as deleteProjectStorage, getProject } from '@/lib/storage';
import { isApiMode } from '@/lib/runtime/mode';
import { apiCreateProject, apiDeleteProject, apiGetProject, apiListProjects, apiUpdateProject } from '@/lib/api/projects';

/**
 * 迁移旧版项目到新版画风配置
 * 如果项目没有 artStyleConfig，则从 style 字段迁移
 */
function migrateProjectStyle(project: Project): Project {
  if (!project.artStyleConfig && project.style) {
    return {
      ...project,
      artStyleConfig: migrateOldStyleToConfig(project.style),
    };
  }
  return project;
}

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
    if (isApiMode()) {
      void (async () => {
        try {
          const projects = await apiListProjects();
          const migrated = projects.map(migrateProjectStyle);
          set({ projects: migrated, isLoading: false });
        } catch (error) {
          console.error('Failed to load projects (api):', error);
          set({ isLoading: false });
        }
      })();
      return;
    }
    try {
      const projects = getProjects();
      // 迁移旧版项目
      const migratedProjects = projects.map(migrateProjectStyle);
      // 保存迁移后的项目
      migratedProjects.forEach(p => {
        if (p !== projects.find(op => op.id === p.id)) {
          saveProject(p);
        }
      });
      set({ projects: migratedProjects, isLoading: false });
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
    }
  },
  
  loadProject: (projectId: string) => {
    if (isApiMode()) {
      void (async () => {
        try {
          const project = await apiGetProject(projectId);
          set({ currentProject: migrateProjectStyle(project as Project) });
        } catch (error) {
          console.error('Failed to load project (api):', error);
        }
      })();
      return;
    }
    let project = getProject(projectId);
    if (project) {
      // 迁移旧版项目
      project = migrateProjectStyle(project);
      // 如果发生了迁移，保存更新
      const originalProject = getProject(projectId);
      if (project.artStyleConfig && !originalProject?.artStyleConfig) {
        saveProject(project);
      }
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

    if (!isApiMode()) {
      saveProject(newProject);
    } else {
      // 后台持久化（最佳努力）：前端仍以本地生成的 id 作为稳定主键
      void apiCreateProject(newProject).catch((error) => {
        console.error('Failed to create project (api):', error);
      });
    }

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

      if (!isApiMode()) {
        saveProject(updatedProject);
      } else {
        void apiUpdateProject(projectId, updatedProject).catch((error) => {
          console.error('Failed to update project (api):', error);
        });
      }
      
      set(state => ({
        projects: state.projects.map(p => p.id === projectId ? updatedProject : p),
        currentProject: state.currentProject?.id === projectId ? updatedProject : state.currentProject,
      }));
    }
  },
  
  deleteProject: (projectId) => {
    if (!isApiMode()) {
      deleteProjectStorage(projectId);
    } else {
      void apiDeleteProject(projectId).catch((error) => {
        console.error('Failed to delete project (api):', error);
      });
    }
    set(state => ({
      projects: state.projects.filter(p => p.id !== projectId),
      currentProject: state.currentProject?.id === projectId ? null : state.currentProject,
    }));
  },
  
  setCurrentProject: (project) => {
    set({ currentProject: project });
  },
}));
