import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from './projectStore';
import * as storage from '@/lib/storage';

// Mock storage functions
vi.mock('@/lib/storage', () => ({
  getProjects: vi.fn(() => []),
  getProject: vi.fn(),
  saveProject: vi.fn(),
  deleteProject: vi.fn(),
}));

describe('projectStore', () => {
  beforeEach(() => {
    // Reset store state
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty projects array', () => {
      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
    });

    it('should have null currentProject', () => {
      const state = useProjectStore.getState();
      expect(state.currentProject).toBeNull();
    });

    it('should have isLoading as false', () => {
      const state = useProjectStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('loadProjects', () => {
    it('should load projects from storage', () => {
      const mockProjects = [
        {
          id: 'proj_1',
          title: 'Test Project',
          summary: 'Test summary',
          style: 'anime',
          protagonist: 'Hero',
          workflowState: 'IDLE' as const,
          currentSceneOrder: 0,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      vi.mocked(storage.getProjects).mockReturnValue(mockProjects);

      const { loadProjects } = useProjectStore.getState();
      loadProjects();

      expect(useProjectStore.getState().projects).toEqual(mockProjects);
      expect(useProjectStore.getState().isLoading).toBe(false);
    });

    it('should set isLoading during load', () => {
      let loadingState: boolean | undefined;
      vi.mocked(storage.getProjects).mockImplementation(() => {
        loadingState = useProjectStore.getState().isLoading;
        return [];
      });

      const { loadProjects } = useProjectStore.getState();
      loadProjects();

      expect(loadingState).toBe(true);
    });

    it('should handle storage errors gracefully', () => {
      vi.mocked(storage.getProjects).mockImplementation(() => {
        throw new Error('Storage error');
      });

      const { loadProjects } = useProjectStore.getState();
      
      expect(() => loadProjects()).not.toThrow();
      expect(useProjectStore.getState().isLoading).toBe(false);
    });
  });

  describe('loadProject', () => {
    it('should load a specific project by ID', () => {
      const mockProject = {
        id: 'proj_1',
        title: 'Test Project',
        summary: 'Test summary',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      vi.mocked(storage.getProject).mockReturnValue(mockProject);

      const { loadProject } = useProjectStore.getState();
      loadProject('proj_1');

      expect(useProjectStore.getState().currentProject).toEqual(mockProject);
    });

    it('should not set currentProject if project not found', () => {
      vi.mocked(storage.getProject).mockReturnValue(undefined);

      const { loadProject } = useProjectStore.getState();
      loadProject('nonexistent');

      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create a new project with generated ID', () => {
      const projectData = {
        title: 'New Project',
        summary: 'New summary',
        style: 'realistic',
        protagonist: 'Main character',
      };

      const { createProject } = useProjectStore.getState();
      const newProject = createProject(projectData);

      expect(newProject.id).toMatch(/^proj_/);
      expect(newProject.title).toBe('New Project');
      expect(newProject.workflowState).toBe('DATA_COLLECTING');
      expect(newProject.currentSceneOrder).toBe(0);
    });

    it('should add project to projects array', () => {
      const { createProject } = useProjectStore.getState();
      createProject({
        title: 'Test',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
      });

      expect(useProjectStore.getState().projects).toHaveLength(1);
    });

    it('should set currentProject to new project', () => {
      const { createProject } = useProjectStore.getState();
      const newProject = createProject({
        title: 'Test',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
      });

      expect(useProjectStore.getState().currentProject).toEqual(newProject);
    });

    it('should save project to storage', () => {
      const { createProject } = useProjectStore.getState();
      createProject({
        title: 'Test',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
      });

      expect(storage.saveProject).toHaveBeenCalled();
    });

    it('should set timestamps on new project', () => {
      const { createProject } = useProjectStore.getState();
      const beforeCreate = new Date().toISOString();
      const newProject = createProject({
        title: 'Test',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
      });
      const afterCreate = new Date().toISOString();

      expect(newProject.createdAt).toBeDefined();
      expect(newProject.updatedAt).toBeDefined();
      expect(newProject.createdAt >= beforeCreate).toBe(true);
      expect(newProject.createdAt <= afterCreate).toBe(true);
    });
  });

  describe('updateProject', () => {
    const existingProject = {
      id: 'proj_1',
      title: 'Original Title',
      summary: 'Original summary',
      style: 'anime',
      protagonist: 'Hero',
      workflowState: 'IDLE' as const,
      currentSceneOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      useProjectStore.setState({
        projects: [existingProject],
        currentProject: existingProject,
        isLoading: false,
      });
    });

    it('should update project properties', () => {
      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', { title: 'Updated Title' });

      const updated = useProjectStore.getState().projects.find(p => p.id === 'proj_1');
      expect(updated?.title).toBe('Updated Title');
    });

    it('should update updatedAt timestamp', () => {
      const { updateProject } = useProjectStore.getState();
      const beforeUpdate = new Date().toISOString();
      updateProject('proj_1', { title: 'Updated' });

      const updated = useProjectStore.getState().projects.find(p => p.id === 'proj_1');
      expect(updated?.updatedAt >= beforeUpdate).toBe(true);
    });

    it('should save updated project to storage', () => {
      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', { title: 'Updated' });

      expect(storage.saveProject).toHaveBeenCalled();
    });

    it('should update currentProject if it matches', () => {
      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', { title: 'Updated' });

      expect(useProjectStore.getState().currentProject?.title).toBe('Updated');
    });

    it('should not update if project not found', () => {
      const { updateProject } = useProjectStore.getState();
      updateProject('nonexistent', { title: 'Updated' });

      expect(storage.saveProject).not.toHaveBeenCalled();
    });

    it('should update multiple properties at once', () => {
      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', {
        title: 'New Title',
        summary: 'New Summary',
        workflowState: 'SCENE_PROCESSING',
      });

      const updated = useProjectStore.getState().projects.find(p => p.id === 'proj_1');
      expect(updated?.title).toBe('New Title');
      expect(updated?.summary).toBe('New Summary');
      expect(updated?.workflowState).toBe('SCENE_PROCESSING');
    });
  });

  describe('deleteProject', () => {
    const existingProject = {
      id: 'proj_1',
      title: 'Test',
      summary: 'Test',
      style: 'anime',
      protagonist: 'Hero',
      workflowState: 'IDLE' as const,
      currentSceneOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      useProjectStore.setState({
        projects: [existingProject],
        currentProject: existingProject,
        isLoading: false,
      });
    });

    it('should remove project from projects array', () => {
      const { deleteProject } = useProjectStore.getState();
      deleteProject('proj_1');

      expect(useProjectStore.getState().projects).toHaveLength(0);
    });

    it('should call storage deleteProject', () => {
      const { deleteProject } = useProjectStore.getState();
      deleteProject('proj_1');

      expect(storage.deleteProject).toHaveBeenCalledWith('proj_1');
    });

    it('should clear currentProject if deleted', () => {
      const { deleteProject } = useProjectStore.getState();
      deleteProject('proj_1');

      expect(useProjectStore.getState().currentProject).toBeNull();
    });

    it('should not clear currentProject if different project deleted', () => {
      const otherProject = { ...existingProject, id: 'proj_2' };
      useProjectStore.setState({
        projects: [existingProject, otherProject],
        currentProject: existingProject,
      });

      const { deleteProject } = useProjectStore.getState();
      deleteProject('proj_2');

      expect(useProjectStore.getState().currentProject).toEqual(existingProject);
    });
  });

  describe('setCurrentProject', () => {
    it('should set currentProject', () => {
      const project = {
        id: 'proj_1',
        title: 'Test',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { setCurrentProject } = useProjectStore.getState();
      setCurrentProject(project);

      expect(useProjectStore.getState().currentProject).toEqual(project);
    });

    it('should set currentProject to null', () => {
      useProjectStore.setState({ currentProject: { id: 'test' } as any });

      const { setCurrentProject } = useProjectStore.getState();
      setCurrentProject(null);

      expect(useProjectStore.getState().currentProject).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle creating multiple projects', () => {
      const { createProject } = useProjectStore.getState();

      createProject({ title: 'Project 1', summary: 'S1', style: 'anime', protagonist: 'H1' });
      createProject({ title: 'Project 2', summary: 'S2', style: 'anime', protagonist: 'H2' });
      createProject({ title: 'Project 3', summary: 'S3', style: 'anime', protagonist: 'H3' });

      expect(useProjectStore.getState().projects).toHaveLength(3);
    });

    it('should generate unique IDs for each project', () => {
      const { createProject } = useProjectStore.getState();

      const p1 = createProject({ title: 'P1', summary: 'S', style: 'anime', protagonist: 'H' });
      const p2 = createProject({ title: 'P2', summary: 'S', style: 'anime', protagonist: 'H' });

      expect(p1.id).not.toBe(p2.id);
    });
  });
});
