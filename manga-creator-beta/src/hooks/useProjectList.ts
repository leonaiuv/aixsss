import { useState, useEffect, useCallback } from 'react';

/**
 * 项目列表项类型
 */
export interface ProjectListItem {
  id: string;
  title: string;
  summary: string;
  workflowState: string;
  scenesCount: number;
  updatedAt: string;
}

/**
 * 获取项目列表的 Hook
 * 
 * 通过 API 获取 Checkpoint Store 中的所有项目
 */
export function useProjectList() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 刷新项目列表
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        throw new Error('获取项目列表失败');
      }
      const data = await response.json();
      if (data.success) {
        setProjects(data.data || []);
      } else {
        setError(data.error || '获取项目列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取项目列表失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    projects,
    isLoading,
    error,
    refresh,
  };
}
