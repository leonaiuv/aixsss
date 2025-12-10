'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  syncCheckpointToStores,
  loadProjectAndSync,
  subscribeToCheckpointChanges,
  SyncResult,
} from '@/lib/sync/checkpoint-sync';

/**
 * 项目同步 Hook 配置选项
 */
export interface UseProjectSyncOptions {
  /** 项目 ID */
  projectId: string;
  /** 线程 ID */
  threadId?: string;
  /** 是否自动订阅变化 */
  autoSubscribe?: boolean;
  /** 同步完成回调 */
  onSync?: (result: SyncResult) => void;
  /** 同步失败回调 */
  onError?: (error: string) => void;
}

/**
 * 项目同步 Hook
 * 
 * 用于加载项目并保持 Agent 状态与 UI 同步
 */
export function useProjectSync(options: UseProjectSyncOptions) {
  const { projectId, threadId, autoSubscribe = true, onSync, onError } = options;

  const isLoadedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 从 projectStore 获取状态
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);
  const projectState = useProjectStore((state) => state.projectState);

  // 从 canvasStore 获取状态
  const blocks = useCanvasStore((state) => state.blocks);
  const isDirty = useCanvasStore((state) => state.isDirty);

  /**
   * 加载项目
   */
  const loadProject = useCallback(async () => {
    const result = await loadProjectAndSync(projectId, threadId);
    
    if (result.success) {
      onSync?.(result);
    } else {
      onError?.(result.error || 'Failed to load project');
    }

    return result;
  }, [projectId, threadId, onSync, onError]);

  /**
   * 手动刷新同步
   */
  const refresh = useCallback(async () => {
    const result = await syncCheckpointToStores(projectId);
    
    if (result.success) {
      onSync?.(result);
    } else {
      onError?.(result.error || 'Failed to sync');
    }

    return result;
  }, [projectId, onSync, onError]);

  // 初始加载
  useEffect(() => {
    if (!isLoadedRef.current && projectId) {
      isLoadedRef.current = true;
      loadProject();
    }
  }, [projectId, loadProject]);

  // 自动订阅变化
  useEffect(() => {
    if (autoSubscribe && projectId) {
      unsubscribeRef.current = subscribeToCheckpointChanges(projectId, (result) => {
        if (result.success) {
          onSync?.(result);
        }
      });
    }

    return () => {
      unsubscribeRef.current?.();
    };
  }, [autoSubscribe, projectId, onSync]);

  return {
    // 状态
    isLoading,
    error,
    projectState,
    blocks,
    isDirty,

    // 操作
    loadProject,
    refresh,
  };
}

/**
 * 简化版同步 Hook - 仅用于已知项目 ID 的场景
 */
export function useCheckpointSync(projectId: string | null) {
  const projectState = useProjectStore((state) => state.projectState);
  const blocks = useCanvasStore((state) => state.blocks);

  const sync = useCallback(async () => {
    if (!projectId) return { success: false, error: 'No project ID' };
    return syncCheckpointToStores(projectId);
  }, [projectId]);

  return {
    projectState,
    blocks,
    sync,
  };
}
