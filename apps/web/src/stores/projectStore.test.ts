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

      const loaded = useProjectStore.getState().projects;
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('proj_1');
      expect(loaded[0].title).toBe('Test Project');
      expect(loaded[0].artStyleConfig).toBeDefined(); // 应该已迁移
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

      const loaded = useProjectStore.getState().currentProject;
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('proj_1');
      expect(loaded?.title).toBe('Test Project');
      expect(loaded?.artStyleConfig).toBeDefined(); // 应该已迁移
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

      const updated = useProjectStore.getState().projects.find((p) => p.id === 'proj_1');
      expect(updated?.title).toBe('Updated Title');
    });

    it('should update updatedAt timestamp', () => {
      const { updateProject } = useProjectStore.getState();
      const beforeUpdate = new Date().toISOString();
      updateProject('proj_1', { title: 'Updated' });

      const updated = useProjectStore.getState().projects.find((p) => p.id === 'proj_1');
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

      const updated = useProjectStore.getState().projects.find((p) => p.id === 'proj_1');
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

    it('should generate unique IDs when creating 1000 projects', () => {
      const { createProject } = useProjectStore.getState();
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const project = createProject({
          title: `Project ${i}`,
          summary: 'Test',
          style: 'anime',
          protagonist: 'Hero',
        });
        ids.add(project.id);
      }

      expect(ids.size).toBe(1000);
    });
  });

  describe('boundary conditions', () => {
    it('should handle updateProject with non-existent ID gracefully', () => {
      const { updateProject } = useProjectStore.getState();

      expect(() => updateProject('nonexistent-id', { title: 'New Title' })).not.toThrow();
      expect(storage.saveProject).not.toHaveBeenCalled();
    });

    it('should handle concurrent project updates', () => {
      const project = {
        id: 'proj_1',
        title: 'Original',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      useProjectStore.setState({ projects: [project] });

      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', { title: 'Title Update' });
      updateProject('proj_1', { summary: 'Summary Update' });

      const updated = useProjectStore.getState().projects[0];
      expect(updated.title).toBe('Title Update');
      expect(updated.summary).toBe('Summary Update');
    });

    it('should handle empty projects list gracefully', () => {
      useProjectStore.setState({ projects: [], currentProject: null });
      const { updateProject, deleteProject } = useProjectStore.getState();

      expect(() => updateProject('any-id', { title: 'Test' })).not.toThrow();
      expect(() => deleteProject('any-id')).not.toThrow();
    });

    it('should handle localStorage QuotaExceededError gracefully', () => {
      const { createProject } = useProjectStore.getState();
      vi.mocked(storage.saveProject).mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      expect(() =>
        createProject({
          title: 'Test',
          summary: 'Test',
          style: 'anime',
          protagonist: 'Hero',
        }),
      ).toThrow();
    });
  });

  describe('art style migration', () => {
    beforeEach(() => {
      // 确保每个测试前恢复所有mocks
      vi.restoreAllMocks();
      vi.mocked(storage.saveProject).mockImplementation(() => {});
    });

    it('should migrate old style field to artStyleConfig on loadProjects', () => {
      const oldStyleProject = {
        id: 'proj_old',
        title: 'Old Project',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      vi.mocked(storage.getProjects).mockReturnValue([oldStyleProject]);

      const { loadProjects } = useProjectStore.getState();
      loadProjects();

      const migrated = useProjectStore.getState().projects[0];
      expect(migrated).toBeDefined();
      expect(migrated.artStyleConfig).toBeDefined();
      expect(migrated.artStyleConfig?.presetId).toBe('anime_cel');
      expect(storage.saveProject).toHaveBeenCalled();
    });

    it('should migrate old style field to artStyleConfig on loadProject', () => {
      const oldStyleProject = {
        id: 'proj_old',
        title: 'Old Project',
        summary: 'Test',
        style: 'realistic',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      vi.mocked(storage.getProject).mockReturnValue(oldStyleProject);

      const { loadProject } = useProjectStore.getState();
      loadProject('proj_old');

      const migrated = useProjectStore.getState().currentProject;
      expect(migrated).toBeDefined();
      expect(migrated?.artStyleConfig).toBeDefined();
      expect(migrated?.artStyleConfig?.presetId).toBe('cinematic_realistic');
      expect(storage.saveProject).toHaveBeenCalled();
    });

    it('should not migrate if artStyleConfig already exists', () => {
      const modernProject = {
        id: 'proj_modern',
        title: 'Modern Project',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE' as const,
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        artStyleConfig: {
          presetId: 'custom',
          baseStyle: 'custom style',
          characterStyle: 'custom characters',
          sceneStyle: 'custom scenes',
          colorPalette: 'vibrant',
          lightingStyle: 'dramatic',
        },
      };
      vi.mocked(storage.getProjects).mockReturnValue([modernProject]);

      const { loadProjects } = useProjectStore.getState();
      loadProjects();

      const loaded = useProjectStore.getState().projects[0];
      expect(loaded.artStyleConfig?.presetId).toBe('custom');
      expect(loaded.artStyleConfig?.baseStyle).toBe('custom style');
    });
  });

  describe('workflow state transitions', () => {
    beforeEach(() => {
      // 确保每个测试前恢复所有mocks
      vi.restoreAllMocks();
      vi.mocked(storage.saveProject).mockImplementation(() => {});
    });

    it('should allow valid workflow state transitions', () => {
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
      useProjectStore.setState({ projects: [project] });

      const { updateProject } = useProjectStore.getState();
      updateProject('proj_1', { workflowState: 'DATA_COLLECTING' });
      expect(useProjectStore.getState().projects[0].workflowState).toBe('DATA_COLLECTING');

      updateProject('proj_1', { workflowState: 'SCENE_PROCESSING' });
      expect(useProjectStore.getState().projects[0].workflowState).toBe('SCENE_PROCESSING');

      updateProject('proj_1', { workflowState: 'EXPORTING' });
      expect(useProjectStore.getState().projects[0].workflowState).toBe('EXPORTING');
    });

    it('should set initial workflow state to DATA_COLLECTING for new projects', () => {
      const { createProject } = useProjectStore.getState();
      const newProject = createProject({
        title: 'New',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
      });

      expect(newProject.workflowState).toBe('DATA_COLLECTING');
    });
  });
});
