import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './searchStore';
import { Project, Scene } from '@/types';

describe('searchStore', () => {
  beforeEach(() => {
    useSearchStore.setState({
      query: '',
      filters: { query: '' },
      results: { projects: [], scenes: [] },
      isSearching: false,
      searchHistory: [],
    });
  });

  describe('initial state', () => {
    it('should have empty query', () => {
      const state = useSearchStore.getState();
      expect(state.query).toBe('');
    });

    it('should have empty results', () => {
      const state = useSearchStore.getState();
      expect(state.results.projects).toEqual([]);
      expect(state.results.scenes).toEqual([]);
    });

    it('should have isSearching as false', () => {
      const state = useSearchStore.getState();
      expect(state.isSearching).toBe(false);
    });

    it('should have empty search history', () => {
      const state = useSearchStore.getState();
      expect(state.searchHistory).toEqual([]);
    });
  });

  describe('setQuery', () => {
    it('should set query', () => {
      const { setQuery } = useSearchStore.getState();
      setQuery('test query');

      expect(useSearchStore.getState().query).toBe('test query');
    });

    it('should handle empty query', () => {
      const { setQuery } = useSearchStore.getState();
      setQuery('');

      expect(useSearchStore.getState().query).toBe('');
    });
  });

  describe('setFilters', () => {
    it('should set filters', () => {
      const { setFilters } = useSearchStore.getState();
      setFilters({ status: ['pending', 'completed'] });

      expect(useSearchStore.getState().filters.status).toEqual(['pending', 'completed']);
    });

    it('should merge with existing filters', () => {
      useSearchStore.setState({
        filters: { query: 'existing', status: ['pending'] },
      });

      const { setFilters } = useSearchStore.getState();
      setFilters({ query: 'new' });

      const filters = useSearchStore.getState().filters;
      expect(filters.query).toBe('new');
      expect(filters.status).toEqual(['pending']);
    });
  });

  describe('search', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj_1',
        title: 'Fantasy Adventure',
        summary: 'A hero journey',
        style: 'anime',
        protagonist: 'Hero',
        workflowState: 'IDLE',
        currentSceneOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'proj_2',
        title: 'Sci-Fi Story',
        summary: 'Space exploration',
        style: 'realistic',
        protagonist: 'Captain',
        workflowState: 'SCENE_PROCESSING',
        currentSceneOrder: 0,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ];

    const mockScenesMap: Record<string, Scene[]> = {
      proj_1: [
        {
          id: 'scene_1',
          projectId: 'proj_1',
          order: 1,
          summary: 'Opening scene',
          sceneDescription: 'The hero arrives at the village',
          actionDescription: 'Walking',
          shotPrompt: 'Wide shot',
          status: 'completed',
          notes: '',
        },
      ],
      proj_2: [
        {
          id: 'scene_2',
          projectId: 'proj_2',
          order: 1,
          summary: 'Space launch',
          sceneDescription: 'Rocket launches into space',
          actionDescription: 'Flying',
          shotPrompt: 'Low angle',
          status: 'pending',
          notes: '',
        },
      ],
    };

    it('should search projects by title', () => {
      useSearchStore.setState({ query: 'Fantasy' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.projects).toHaveLength(1);
      expect(results.projects[0].id).toBe('proj_1');
    });

    it('should search projects by summary', () => {
      useSearchStore.setState({ query: 'journey' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.projects).toHaveLength(1);
    });

    it('should search projects by protagonist', () => {
      useSearchStore.setState({ query: 'Captain' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.projects).toHaveLength(1);
      expect(results.projects[0].id).toBe('proj_2');
    });

    it('should search scenes by summary', () => {
      useSearchStore.setState({ query: 'Opening' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.scenes).toHaveLength(1);
      expect(results.scenes[0].id).toBe('scene_1');
    });

    it('should search scenes by description', () => {
      useSearchStore.setState({ query: 'village' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.scenes).toHaveLength(1);
    });

    it('should return all projects when query is empty', () => {
      useSearchStore.setState({ query: '' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.projects).toHaveLength(2);
    });

    it('should return no scenes when query is empty', () => {
      useSearchStore.setState({ query: '' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.scenes).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      useSearchStore.setState({ query: 'FANTASY' });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.projects).toHaveLength(1);
    });

    it('should filter scenes by status', () => {
      useSearchStore.setState({
        query: 'scene',
        filters: { query: '', status: ['completed'] },
      });

      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      const results = useSearchStore.getState().results;
      expect(results.scenes.every(s => s.status === 'completed')).toBe(true);
    });

    it('should set isSearching to false after search', () => {
      const { search } = useSearchStore.getState();
      search(mockProjects, mockScenesMap);

      expect(useSearchStore.getState().isSearching).toBe(false);
    });
  });

  describe('clearSearch', () => {
    it('should clear query', () => {
      useSearchStore.setState({ query: 'test' });

      const { clearSearch } = useSearchStore.getState();
      clearSearch();

      expect(useSearchStore.getState().query).toBe('');
    });

    it('should clear filters', () => {
      useSearchStore.setState({ filters: { query: 'test', status: ['pending'] } });

      const { clearSearch } = useSearchStore.getState();
      clearSearch();

      expect(useSearchStore.getState().filters).toEqual({ query: '' });
    });

    it('should clear results', () => {
      useSearchStore.setState({
        results: {
          projects: [{ id: 'p1' }] as any,
          scenes: [{ id: 's1' }] as any,
        },
      });

      const { clearSearch } = useSearchStore.getState();
      clearSearch();

      expect(useSearchStore.getState().results).toEqual({ projects: [], scenes: [] });
    });
  });

  describe('addSearchHistory', () => {
    it('should add query to history', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('test query');

      const history = useSearchStore.getState().searchHistory;
      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('test query');
    });

    it('should not add empty query', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('');

      expect(useSearchStore.getState().searchHistory).toHaveLength(0);
    });

    it('should not add whitespace-only query', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('   ');

      expect(useSearchStore.getState().searchHistory).toHaveLength(0);
    });

    it('should add timestamp to history entry', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('test');

      const history = useSearchStore.getState().searchHistory;
      expect(history[0].timestamp).toBeDefined();
    });

    it('should add ID to history entry', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('test');

      const history = useSearchStore.getState().searchHistory;
      expect(history[0].id).toMatch(/^sh_/);
    });

    it('should move duplicate query to top', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('first');
      addSearchHistory('second');
      addSearchHistory('first');

      const history = useSearchStore.getState().searchHistory;
      expect(history).toHaveLength(2);
      expect(history[0].query).toBe('first');
    });

    it('should limit history to 10 entries', () => {
      const { addSearchHistory } = useSearchStore.getState();
      
      for (let i = 0; i < 15; i++) {
        addSearchHistory(`query ${i}`);
      }

      expect(useSearchStore.getState().searchHistory).toHaveLength(10);
    });

    it('should trim query whitespace', () => {
      const { addSearchHistory } = useSearchStore.getState();
      addSearchHistory('  test  ');

      const history = useSearchStore.getState().searchHistory;
      expect(history[0].query).toBe('test');
    });
  });

  describe('getSearchHistory', () => {
    it('should return search history', () => {
      useSearchStore.setState({
        searchHistory: [
          { id: 'sh_1', query: 'test', timestamp: '2024-01-01T00:00:00Z' },
        ],
      });

      const { getSearchHistory } = useSearchStore.getState();
      const history = getSearchHistory();

      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('test');
    });
  });

  describe('clearSearchHistory', () => {
    it('should clear all history', () => {
      useSearchStore.setState({
        searchHistory: [
          { id: 'sh_1', query: 'test1', timestamp: '2024-01-01T00:00:00Z' },
          { id: 'sh_2', query: 'test2', timestamp: '2024-01-02T00:00:00Z' },
        ],
      });

      const { clearSearchHistory } = useSearchStore.getState();
      clearSearchHistory();

      expect(useSearchStore.getState().searchHistory).toEqual([]);
    });
  });
});
