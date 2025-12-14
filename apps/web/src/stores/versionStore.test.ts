import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVersionStore } from './versionStore';

describe('versionStore', () => {
  beforeEach(() => {
    useVersionStore.setState({
      versions: [],
      maxVersions: 50,
    });
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have empty versions array', () => {
      const state = useVersionStore.getState();
      expect(state.versions).toEqual([]);
    });

    it('should have maxVersions as 50', () => {
      const state = useVersionStore.getState();
      expect(state.maxVersions).toBe(50);
    });
  });

  describe('loadVersions', () => {
    it('should load versions from localStorage', () => {
      const mockVersions = [
        {
          id: 'ver_1',
          projectId: 'proj_1',
          type: 'project' as const,
          targetId: 'proj_1',
          snapshot: { title: 'Test' },
          createdAt: '2024-01-01T00:00:00Z',
          createdBy: '我',
        },
      ];
      localStorage.setItem('aixs_versions_proj_1', JSON.stringify(mockVersions));

      const { loadVersions } = useVersionStore.getState();
      loadVersions('proj_1');

      expect(useVersionStore.getState().versions).toEqual(mockVersions);
    });

    it('should set empty array if no versions stored', () => {
      const { loadVersions } = useVersionStore.getState();
      loadVersions('proj_1');

      expect(useVersionStore.getState().versions).toEqual([]);
    });

    it('should handle parse errors gracefully', () => {
      localStorage.setItem('aixs_versions_proj_1', 'invalid json');

      const { loadVersions } = useVersionStore.getState();
      
      expect(() => loadVersions('proj_1')).not.toThrow();
    });
  });

  describe('createVersion', () => {
    it('should create a new version with generated ID', () => {
      const { createVersion } = useVersionStore.getState();
      const version = createVersion('proj_1', 'project', 'proj_1', { title: 'Test' });

      expect(version.id).toMatch(/^ver_/);
      expect(version.projectId).toBe('proj_1');
      expect(version.type).toBe('project');
    });

    it('should add version to versions array', () => {
      const { createVersion } = useVersionStore.getState();
      createVersion('proj_1', 'project', 'proj_1', { title: 'Test' });

      expect(useVersionStore.getState().versions).toHaveLength(1);
    });

    it('should save snapshot correctly', () => {
      const snapshot = { title: 'Test', summary: 'Summary' };
      const { createVersion } = useVersionStore.getState();
      const version = createVersion('proj_1', 'project', 'proj_1', snapshot);

      expect(version.snapshot).toEqual(snapshot);
    });

    it('should set createdBy to 我', () => {
      const { createVersion } = useVersionStore.getState();
      const version = createVersion('proj_1', 'project', 'proj_1', {});

      expect(version.createdBy).toBe('我');
    });

    it('should set optional label and notes', () => {
      const { createVersion } = useVersionStore.getState();
      const version = createVersion('proj_1', 'project', 'proj_1', {}, 'v1.0', 'Release notes');

      expect(version.label).toBe('v1.0');
      expect(version.notes).toBe('Release notes');
    });

    it('should limit versions to maxVersions', () => {
      const { createVersion } = useVersionStore.getState();
      
      // Create 51 versions
      for (let i = 0; i < 51; i++) {
        createVersion('proj_1', 'project', 'proj_1', { index: i });
      }

      const projectVersions = useVersionStore.getState().versions.filter(v => v.projectId === 'proj_1');
      expect(projectVersions.length).toBeLessThanOrEqual(50);
    });

    it('should save versions to localStorage', () => {
      const { createVersion } = useVersionStore.getState();
      createVersion('proj_1', 'project', 'proj_1', {});

      expect(localStorage.getItem('aixs_versions_proj_1')).toBeDefined();
    });
  });

  describe('restoreVersion', () => {
    const version = {
      id: 'ver_1',
      projectId: 'proj_1',
      type: 'project' as const,
      targetId: 'proj_1',
      snapshot: { title: 'Saved State' },
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: '我',
    };

    beforeEach(() => {
      useVersionStore.setState({ versions: [version] });
    });

    it('should return snapshot for existing version', () => {
      const { restoreVersion } = useVersionStore.getState();
      const snapshot = restoreVersion('ver_1');

      expect(snapshot).toEqual({ title: 'Saved State' });
    });

    it('should return null for non-existent version', () => {
      const { restoreVersion } = useVersionStore.getState();
      const snapshot = restoreVersion('nonexistent');

      expect(snapshot).toBeNull();
    });
  });

  describe('deleteVersion', () => {
    const versions = [
      { id: 'ver_1', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-01T00:00:00Z', createdBy: '我' },
      { id: 'ver_2', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-02T00:00:00Z', createdBy: '我' },
    ];

    beforeEach(() => {
      useVersionStore.setState({ versions });
    });

    it('should remove version from versions array', () => {
      const { deleteVersion } = useVersionStore.getState();
      deleteVersion('proj_1', 'ver_1');

      expect(useVersionStore.getState().versions).toHaveLength(1);
      expect(useVersionStore.getState().versions[0].id).toBe('ver_2');
    });

    it('should save updated versions to localStorage', () => {
      const { deleteVersion } = useVersionStore.getState();
      deleteVersion('proj_1', 'ver_1');

      expect(localStorage.getItem('aixs_versions_proj_1')).toBeDefined();
    });
  });

  describe('clearOldVersions', () => {
    const versions = [
      { id: 'ver_1', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-01T00:00:00Z', createdBy: '我' },
      { id: 'ver_2', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-02T00:00:00Z', createdBy: '我' },
      { id: 'ver_3', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-03T00:00:00Z', createdBy: '我' },
    ];

    beforeEach(() => {
      useVersionStore.setState({ versions });
    });

    it('should keep only specified number of recent versions', () => {
      const { clearOldVersions } = useVersionStore.getState();
      clearOldVersions('proj_1', 2);

      const projectVersions = useVersionStore.getState().versions.filter(v => v.projectId === 'proj_1');
      expect(projectVersions).toHaveLength(2);
    });

    it('should keep the most recent versions', () => {
      const { clearOldVersions } = useVersionStore.getState();
      clearOldVersions('proj_1', 1);

      const remaining = useVersionStore.getState().versions.filter(v => v.projectId === 'proj_1');
      expect(remaining[0].id).toBe('ver_3');
    });
  });

  describe('getVersionHistory', () => {
    const versions = [
      { id: 'ver_1', projectId: 'proj_1', type: 'project' as const, targetId: 'target_1', snapshot: {}, createdAt: '2024-01-01T00:00:00Z', createdBy: '我' },
      { id: 'ver_2', projectId: 'proj_1', type: 'project' as const, targetId: 'target_1', snapshot: {}, createdAt: '2024-01-02T00:00:00Z', createdBy: '我' },
      { id: 'ver_3', projectId: 'proj_1', type: 'project' as const, targetId: 'target_2', snapshot: {}, createdAt: '2024-01-03T00:00:00Z', createdBy: '我' },
    ];

    beforeEach(() => {
      useVersionStore.setState({ versions });
    });

    it('should return versions for specific target', () => {
      const { getVersionHistory } = useVersionStore.getState();
      const history = getVersionHistory('proj_1', 'target_1');

      expect(history).toHaveLength(2);
    });

    it('should return versions sorted by date descending', () => {
      const { getVersionHistory } = useVersionStore.getState();
      const history = getVersionHistory('proj_1', 'target_1');

      expect(history[0].id).toBe('ver_2');
      expect(history[1].id).toBe('ver_1');
    });
  });

  describe('getProjectVersions', () => {
    const versions = [
      { id: 'ver_1', projectId: 'proj_1', type: 'project' as const, targetId: 'proj_1', snapshot: {}, createdAt: '2024-01-01T00:00:00Z', createdBy: '我' },
      { id: 'ver_2', projectId: 'proj_1', type: 'scene' as const, targetId: 'scene_1', snapshot: {}, createdAt: '2024-01-02T00:00:00Z', createdBy: '我' },
    ];

    beforeEach(() => {
      useVersionStore.setState({ versions });
    });

    it('should return only project type versions', () => {
      const { getProjectVersions } = useVersionStore.getState();
      const projectVersions = getProjectVersions('proj_1');

      expect(projectVersions).toHaveLength(1);
      expect(projectVersions[0].type).toBe('project');
    });
  });

  describe('getSceneVersions', () => {
    const versions = [
      { id: 'ver_1', projectId: 'proj_1', type: 'scene' as const, targetId: 'scene_1', snapshot: {}, createdAt: '2024-01-01T00:00:00Z', createdBy: '我' },
      { id: 'ver_2', projectId: 'proj_1', type: 'scene' as const, targetId: 'scene_2', snapshot: {}, createdAt: '2024-01-02T00:00:00Z', createdBy: '我' },
    ];

    beforeEach(() => {
      useVersionStore.setState({ versions });
    });

    it('should return versions for specific scene', () => {
      const { getSceneVersions } = useVersionStore.getState();
      const sceneVersions = getSceneVersions('scene_1');

      expect(sceneVersions).toHaveLength(1);
      expect(sceneVersions[0].targetId).toBe('scene_1');
    });
  });

  describe('addLabel', () => {
    const version = {
      id: 'ver_1',
      projectId: 'proj_1',
      type: 'project' as const,
      targetId: 'proj_1',
      snapshot: {},
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: '我',
    };

    beforeEach(() => {
      useVersionStore.setState({ versions: [version] });
    });

    it('should add label to version', () => {
      const { addLabel } = useVersionStore.getState();
      addLabel('ver_1', 'v1.0');

      const updated = useVersionStore.getState().versions.find(v => v.id === 'ver_1');
      expect(updated?.label).toBe('v1.0');
    });

    it('should add notes when provided', () => {
      const { addLabel } = useVersionStore.getState();
      addLabel('ver_1', 'v1.0', 'Important release');

      const updated = useVersionStore.getState().versions.find(v => v.id === 'ver_1');
      expect(updated?.notes).toBe('Important release');
    });

    it('should preserve existing notes when not provided', () => {
      useVersionStore.setState({
        versions: [{ ...version, notes: 'Original notes' }],
      });

      const { addLabel } = useVersionStore.getState();
      addLabel('ver_1', 'v1.0');

      const updated = useVersionStore.getState().versions.find(v => v.id === 'ver_1');
      expect(updated?.notes).toBe('Original notes');
    });
  });
});
