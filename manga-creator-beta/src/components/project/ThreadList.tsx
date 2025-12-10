'use client';

import { FC, useState, useEffect, useCallback } from 'react';
import { getCheckpointStore, type ProjectCheckpoint } from '@/lib/checkpoint/store';
import { useProjectStore } from '@/stores/projectStore';
import { loadProjectAndSync } from '@/lib/sync/checkpoint-sync';
import { Plus, FolderOpen, Clock, ChevronRight, Trash2 } from 'lucide-react';

/**
 * 项目列表项属性
 */
interface ProjectListItemProps {
  project: ProjectCheckpoint;
  isSelected: boolean;
  onSelect: (projectId: string) => void;
  onDelete?: (projectId: string) => void;
}

/**
 * 项目列表项组件
 */
const ProjectListItem: FC<ProjectListItemProps> = ({
  project,
  isSelected,
  onSelect,
  onDelete,
}) => {
  const formattedDate = new Date(project.updatedAt).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const workflowLabel = getWorkflowLabel(project.workflowState);

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-100 text-blue-900'
          : 'hover:bg-gray-100 text-gray-700'
      }`}
      onClick={() => onSelect(project.projectId)}
    >
      <FolderOpen className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {project.title || '未命名项目'}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="truncate">{workflowLabel}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formattedDate}
          </span>
        </div>
      </div>
      {onDelete && (
        <button
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.projectId);
          }}
          title="删除项目"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </button>
      )}
      <ChevronRight className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
    </div>
  );
};

/**
 * 获取工作流状态的显示标签
 */
function getWorkflowLabel(state: string): string {
  const labels: Record<string, string> = {
    IDLE: '空闲',
    COLLECTING_BASIC_INFO: '收集信息',
    BASIC_INFO_COMPLETE: '信息完成',
    GENERATING_SCENES: '生成分镜中',
    SCENE_LIST_EDITING: '编辑分镜',
    SCENE_LIST_CONFIRMED: '分镜已确认',
    REFINING_SCENES: '细化中',
    ALL_SCENES_COMPLETE: '已完成',
    EXPORTING: '导出中',
    EXPORTED: '已导出',
  };
  return labels[state] || state;
}

/**
 * ThreadList 组件属性
 */
export interface ThreadListProps {
  className?: string;
  onProjectSelect?: (projectId: string) => void;
  onNewProject?: () => void;
}

/**
 * 项目列表组件
 * 
 * 显示所有项目并允许用户选择或创建新项目
 */
export const ThreadList: FC<ThreadListProps> = ({
  className,
  onProjectSelect,
  onNewProject,
}) => {
  const [projects, setProjects] = useState<ProjectCheckpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentThreadId = useProjectStore((state) => state.currentThreadId);
  const projectState = useProjectStore((state) => state.projectState);

  // 当前选中的项目 ID
  const selectedProjectId = projectState?.projectId || null;

  /**
   * 加载项目列表
   */
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const store = await getCheckpointStore();
      const list = await store.list();
      // 按更新时间降序排序
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 选择项目
   */
  const handleSelect = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.projectId === projectId);
    if (project) {
      await loadProjectAndSync(projectId, project.threadId);
      onProjectSelect?.(projectId);
    }
  }, [projects, onProjectSelect]);

  /**
   * 删除项目
   */
  const handleDelete = useCallback(async (projectId: string) => {
    if (!confirm('确定要删除这个项目吗？此操作不可撤销。')) {
      return;
    }

    try {
      const store = await getCheckpointStore();
      await store.delete(projectId);
      await loadProjects();
    } catch (err) {
      console.error('删除项目失败:', err);
    }
  }, [loadProjects]);

  // 初始加载
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-lg font-semibold">项目列表</h2>
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          onClick={onNewProject}
        >
          <Plus className="h-4 w-4" />
          新建
        </button>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            加载中...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-red-500">
            <p>{error}</p>
            <button
              className="mt-2 text-sm text-blue-500 hover:underline"
              onClick={loadProjects}
            >
              重试
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <FolderOpen className="h-8 w-8 mb-2" />
            <p>暂无项目</p>
            <button
              className="mt-2 text-sm text-blue-500 hover:underline"
              onClick={onNewProject}
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => (
              <ProjectListItem
                key={project.projectId}
                project={project}
                isSelected={project.projectId === selectedProjectId}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* 统计信息 */}
      {projects.length > 0 && (
        <div className="px-4 py-2 border-t text-xs text-gray-500">
          共 {projects.length} 个项目
        </div>
      )}
    </div>
  );
};

export default ThreadList;
