'use client';

import React from 'react';
import { useCanvasStore, CanvasBlock } from '@/stores/canvasStore';
import { SceneCard } from './SceneCard';
import type { SceneStatus } from '@/types';

/**
 * 项目信息卡片
 */
function ProjectCard({ content }: { content: CanvasBlock['content'] }) {
  const title = (content.title as string) || '未命名项目';
  const summary = content.summary as string | undefined;
  const artStyle = content.artStyle as string | undefined;
  const protagonist = content.protagonist as string | undefined;

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4 bg-blue-50 dark:bg-blue-950">
      <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100 mb-2">
        {title}
      </h2>
      {summary && (
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">
          {summary}
        </p>
      )}
      {artStyle && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          画风: {artStyle}
        </p>
      )}
      {protagonist && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          主角: {protagonist}
        </p>
      )}
    </div>
  );
}

/**
 * 导出结果卡片
 */
function ExportCard({ content }: { content: CanvasBlock['content'] }) {
  const format = content.format as string;
  const downloadUrl = content.downloadUrl as string | undefined;
  const exportContent = content.content as string | undefined;

  return (
    <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4 bg-green-50 dark:bg-green-950">
      <h3 className="text-lg font-medium text-green-900 dark:text-green-100 mb-2">
        导出结果 ({format})
      </h3>
      {downloadUrl && (
        <a
          href={downloadUrl}
          className="text-green-600 dark:text-green-400 underline"
          download
        >
          下载文件
        </a>
      )}
      {exportContent && (
        <pre className="mt-2 p-2 bg-white dark:bg-gray-900 rounded text-xs overflow-auto max-h-40">
          {exportContent}
        </pre>
      )}
    </div>
  );
}

/**
 * 空状态提示
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-6xl mb-4">🎬</div>
      <h2 className="text-xl font-medium text-gray-700 dark:text-gray-300 mb-2">
        开始创作您的漫剧
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md">
        在右侧对话框中告诉AI助手您想创作的故事，它将帮助您生成分镜和提示词
      </p>
    </div>
  );
}

/**
 * 画布内容组件
 * 
 * 根据 canvasStore 中的 blocks 渲染相应的卡片
 */
export function CanvasContent() {
  const blocks = useCanvasStore((state) => state.blocks);

  if (blocks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="p-4 overflow-auto h-full">
      {blocks.map((block) => {
        switch (block.type) {
          case 'project':
            return <ProjectCard key={block.id} content={block.content} />;
          
          case 'scene':
            return (
              <SceneCard
                key={block.id}
                id={block.id}
                order={block.content.order as number}
                summary={block.content.summary as string}
                status={block.content.status as SceneStatus}
                sceneDescription={block.content.sceneDescription as string | undefined}
                keyframePrompt={block.content.keyframePrompt as string | undefined}
                spatialPrompt={block.content.spatialPrompt as string | undefined}
              />
            );
          
          case 'export':
            return <ExportCard key={block.id} content={block.content} />;
          
          default:
            return (
              <div key={block.id} className="p-4 border rounded mb-2">
                <pre className="text-xs">{JSON.stringify(block, null, 2)}</pre>
              </div>
            );
        }
      })}
    </div>
  );
}
