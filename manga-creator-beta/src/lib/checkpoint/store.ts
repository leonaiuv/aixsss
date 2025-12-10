import type { WorkflowState, SceneStatus } from '@/types';

export type { WorkflowState, SceneStatus };

/**
 * 分镜数据结构
 */
export interface Scene {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
  sceneDescription?: string;
  keyframePrompt?: string;
  spatialPrompt?: string;
  error?: string;
}

/**
 * 项目检查点数据结构
 */
export interface ProjectCheckpoint {
  /** 项目唯一 ID */
  projectId: string;
  /** 对话线程 ID */
  threadId: string;
  /** 当前工作流状态 */
  workflowState: WorkflowState;
  /** 项目标题 */
  title: string;
  /** 故事简介/梗概 */
  summary: string;
  /** 画风风格 */
  artStyle: string;
  /** 主角信息 */
  protagonist: string;
  /** 分镜列表 */
  scenes: Scene[];
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 检查点存储接口
 */
export interface CheckpointStore {
  /** 保存检查点 */
  save(checkpoint: ProjectCheckpoint): Promise<string>;
  /** 加载检查点 */
  load(projectId: string): Promise<ProjectCheckpoint | null>;
  /** 列出所有检查点 */
  list(): Promise<ProjectCheckpoint[]>;
  /** 删除检查点 */
  delete(projectId: string): Promise<void>;
}

/**
 * 创建内存检查点存储
 * 
 * 用于开发和测试环境，数据不会持久化
 * 
 * @returns CheckpointStore 实例
 */
export function createMemoryCheckpointStore(): CheckpointStore {
  const store = new Map<string, ProjectCheckpoint>();

  return {
    async save(checkpoint: ProjectCheckpoint): Promise<string> {
      const { projectId } = checkpoint;
      const now = new Date().toISOString();
      
      const existing = store.get(projectId);
      const savedCheckpoint: ProjectCheckpoint = {
        ...checkpoint,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      
      store.set(projectId, savedCheckpoint);
      return projectId;
    },

    async load(projectId: string): Promise<ProjectCheckpoint | null> {
      return store.get(projectId) ?? null;
    },

    async list(): Promise<ProjectCheckpoint[]> {
      return Array.from(store.values());
    },

    async delete(projectId: string): Promise<void> {
      store.delete(projectId);
    },
  };
}

/**
 * 创建空的检查点
 */
export function createEmptyCheckpoint(projectId: string, threadId: string): ProjectCheckpoint {
  const now = new Date().toISOString();
  return {
    projectId,
    threadId,
    workflowState: 'IDLE',
    title: '',
    summary: '',
    artStyle: '',
    protagonist: '',
    scenes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 单例内存存储（开发用）
 */
let memoryStore: CheckpointStore | null = null;

export function getMemoryCheckpointStore(): CheckpointStore {
  if (!memoryStore) {
    memoryStore = createMemoryCheckpointStore();
  }
  return memoryStore;
}

/**
 * 重置内存存储（仅用于测试）
 */
export function resetMemoryCheckpointStore(): void {
  memoryStore = null;
}

/**
 * 获取检查点存储
 * 
 * 根据环境变量决定使用内存存储还是 SQLite 存储
 * - USE_SQLITE_STORE=true: 使用 SQLite 存储
 * - 默认: 使用内存存储
 */
export async function getCheckpointStore(): Promise<CheckpointStore> {
  if (process.env.USE_SQLITE_STORE === 'true') {
    // 动态导入以避免在不需要 SQLite 时加载
    const { getSQLiteCheckpointStore } = await import('./sqlite-store');
    return getSQLiteCheckpointStore();
  }
  return getMemoryCheckpointStore();
}
