'use client';

import React from 'react';
import type { SceneStatus } from '@/types';

/**
 * SceneCard 组件 Props
 */
export interface SceneCardProps {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
  sceneDescription?: string;
  keyframePrompt?: string;
  spatialPrompt?: string;
  onToggle?: () => void;
}

/**
 * 状态显示配置
 */
const statusConfig: Record<SceneStatus, { label: string; className: string }> = {
  pending: {
    label: '待处理',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  in_progress: {
    label: '处理中',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  scene_confirmed: {
    label: '场景已确认',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  },
  keyframe_confirmed: {
    label: '关键帧已确认',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  completed: {
    label: '已完成',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  error: {
    label: '出错',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
};

/**
 * 分镜卡片组件
 * 
 * 展示单个分镜的信息，包括序号、摘要、状态和详细内容
 */
export function SceneCard({
  order,
  summary,
  status,
  sceneDescription,
  keyframePrompt,
  spatialPrompt,
  onToggle,
}: SceneCardProps) {
  const statusInfo = statusConfig[status];

  return (
    <article
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onToggle}
    >
      {/* 头部：序号和状态 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          分镜 {order}
        </h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* 摘要 */}
      <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{summary}</p>

      {/* 详细内容（如果有） */}
      {sceneDescription && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            场景描述
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {sceneDescription}
          </p>
        </div>
      )}

      {keyframePrompt && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            关键帧提示词
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
            {keyframePrompt}
          </p>
        </div>
      )}

      {spatialPrompt && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            时空提示词
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
            {spatialPrompt}
          </p>
        </div>
      )}
    </article>
  );
}
