import { describe, it, expect, beforeEach } from 'vitest';
import { useStatisticsStore } from './statisticsStore';
import { Project, Scene } from '@/types';

describe('statisticsStore', () => {
  beforeEach(() => {
    useStatisticsStore.setState({
      statistics: null,
      dateRange: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
    });
  });

  describe('initial state', () => {
    it('should have null statistics', () => {
      const state = useStatisticsStore.getState();
      expect(state.statistics).toBeNull();
    });

    it('should have default date range', () => {
      const state = useStatisticsStore.getState();
      expect(state.dateRange).toBeDefined();
      expect(state.dateRange.start).toBeDefined();
      expect(state.dateRange.end).toBeDefined();
    });
  });

  describe('calculate', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj_1',
        title: 'Test Project',
        summary: 'Test',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE',
        currentSceneOrder: 0,
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      },
    ];

    const mockScenesMap: Record<string, Scene[]> = {
      proj_1: [
        {
          id: 'scene_1',
          projectId: 'proj_1',
          order: 1,
          summary: 'Scene 1',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          status: 'completed',
          notes: '',
        },
        {
          id: 'scene_2',
          projectId: 'proj_1',
          order: 2,
          summary: 'Scene 2',
          sceneDescription: '',
          actionDescription: '',
          shotPrompt: '',
          status: 'pending',
          notes: '',
        },
      ],
    };

    it('should calculate project count', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.projectCount).toBe(1);
    });

    it('should calculate scene count', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.sceneCount).toBe(2);
    });

    it('should calculate completed scene count', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.completedSceneCount).toBe(1);
    });

    it('should calculate estimated tokens', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.totalTokens).toBe(2000); // 1 completed scene * 2000
    });

    it('should calculate estimated cost', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.estimatedCost).toBeDefined();
    });

    it('should generate creation time data', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.creationTimeData).toBeInstanceOf(Array);
      expect(stats?.creationTimeData.length).toBe(7);
    });

    it('should filter projects by date range', () => {
      useStatisticsStore.setState({
        dateRange: {
          start: '2024-02-01',
          end: '2024-02-28',
        },
      });

      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, mockScenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.projectCount).toBe(0);
    });

    it('should handle empty projects array', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate([], {});

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.projectCount).toBe(0);
      expect(stats?.sceneCount).toBe(0);
    });

    it('should handle projects with no scenes', () => {
      const { calculate } = useStatisticsStore.getState();
      calculate(mockProjects, {});

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.sceneCount).toBe(0);
    });
  });

  describe('setDateRange', () => {
    it('should set date range', () => {
      const { setDateRange } = useStatisticsStore.getState();
      setDateRange('2024-06-01', '2024-06-30');

      const state = useStatisticsStore.getState();
      expect(state.dateRange.start).toBe('2024-06-01');
      expect(state.dateRange.end).toBe('2024-06-30');
    });
  });

  describe('getProjectStatistics', () => {
    it('should return statistics if available', () => {
      const mockStats = {
        projectCount: 1,
        sceneCount: 5,
        completedSceneCount: 3,
        totalTokens: 6000,
        estimatedCost: 0.012,
        averageSceneTime: 1800,
        generationSuccessRate: 95,
        creationTimeData: [],
      };
      useStatisticsStore.setState({ statistics: mockStats });

      const { getProjectStatistics } = useStatisticsStore.getState();
      const result = getProjectStatistics('proj_1');

      expect(result).toEqual(mockStats);
    });

    it('should return default statistics if none available', () => {
      const { getProjectStatistics } = useStatisticsStore.getState();
      const result = getProjectStatistics('proj_1');

      expect(result.projectCount).toBe(1);
      expect(result.sceneCount).toBe(0);
    });
  });

  describe('getGlobalStatistics', () => {
    it('should return statistics if available', () => {
      const mockStats = {
        projectCount: 10,
        sceneCount: 50,
        completedSceneCount: 30,
        totalTokens: 60000,
        estimatedCost: 0.12,
        averageSceneTime: 1800,
        generationSuccessRate: 95,
        creationTimeData: [],
      };
      useStatisticsStore.setState({ statistics: mockStats });

      const { getGlobalStatistics } = useStatisticsStore.getState();
      const result = getGlobalStatistics();

      expect(result).toEqual(mockStats);
    });

    it('should return default statistics if none available', () => {
      const { getGlobalStatistics } = useStatisticsStore.getState();
      const result = getGlobalStatistics();

      expect(result.projectCount).toBe(0);
      expect(result.generationSuccessRate).toBe(95);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple projects with different states', () => {
      const projects: Project[] = [
        { id: 'p1', title: 'P1', summary: '', style: '', protagonist: '', workflowState: 'IDLE', currentSceneOrder: 0, createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-01-10T00:00:00Z' },
        { id: 'p2', title: 'P2', summary: '', style: '', protagonist: '', workflowState: 'SCENE_PROCESSING', currentSceneOrder: 0, createdAt: '2024-01-15T00:00:00Z', updatedAt: '2024-01-15T00:00:00Z' },
        { id: 'p3', title: 'P3', summary: '', style: '', protagonist: '', workflowState: 'ALL_SCENES_COMPLETE', currentSceneOrder: 0, createdAt: '2024-01-20T00:00:00Z', updatedAt: '2024-01-20T00:00:00Z' },
      ];

      const scenesMap: Record<string, Scene[]> = {
        p1: [{ id: 's1', projectId: 'p1', order: 1, summary: '', sceneDescription: '', actionDescription: '', shotPrompt: '', status: 'pending', notes: '' }],
        p2: [{ id: 's2', projectId: 'p2', order: 1, summary: '', sceneDescription: '', actionDescription: '', shotPrompt: '', status: 'completed', notes: '' }],
        p3: [{ id: 's3', projectId: 'p3', order: 1, summary: '', sceneDescription: '', actionDescription: '', shotPrompt: '', status: 'completed', notes: '' }],
      };

      const { calculate } = useStatisticsStore.getState();
      calculate(projects, scenesMap);

      const stats = useStatisticsStore.getState().statistics;
      expect(stats?.projectCount).toBe(3);
      expect(stats?.sceneCount).toBe(3);
      expect(stats?.completedSceneCount).toBe(2);
    });
  });
});
