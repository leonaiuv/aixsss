'use client';

import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';
import type { SceneStatus } from '@/types';
import { CheckCircle, Clock, AlertCircle, Loader2, Palette, User, FileText, Film } from 'lucide-react';

/**
 * 状态显示配置
 */
const statusConfig: Record<SceneStatus, { label: string; className: string; icon: typeof CheckCircle }> = {
  pending: {
    label: '待处理',
    className: 'bg-yellow-100 text-yellow-800',
    icon: Clock,
  },
  in_progress: {
    label: '处理中',
    className: 'bg-blue-100 text-blue-800',
    icon: Loader2,
  },
  scene_confirmed: {
    label: '场景已确认',
    className: 'bg-indigo-100 text-indigo-800',
    icon: CheckCircle,
  },
  keyframe_confirmed: {
    label: '关键帧已确认',
    className: 'bg-purple-100 text-purple-800',
    icon: CheckCircle,
  },
  completed: {
    label: '已完成',
    className: 'bg-green-100 text-green-800',
    icon: CheckCircle,
  },
  error: {
    label: '出错',
    className: 'bg-red-100 text-red-800',
    icon: AlertCircle,
  },
};

/**
 * 分镜块规格定义
 * 
 * 显示单个分镜的详细信息，包括场景描述、关键帧提示词和时空提示词
 */
export const SceneBlock = createReactBlockSpec(
  {
    type: 'scene' as const,
    propSchema: {
      sceneId: { default: '' as string },
      order: { default: 0 as number },
      summary: { default: '' as string },
      status: { default: 'pending' as string },
      sceneDescription: { default: '' as string },
      keyframePrompt: { default: '' as string },
      spatialPrompt: { default: '' as string },
      fullPrompt: { default: '' as string },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { order, summary, status, sceneDescription, keyframePrompt, spatialPrompt, fullPrompt } = props.block.props;
      const statusInfo = statusConfig[status as SceneStatus] || statusConfig.pending;
      const StatusIcon = statusInfo.icon;
      const isSpinning = status === 'in_progress';

      return (
        <div className="border border-gray-200 rounded-lg p-4 my-2 bg-white shadow-sm hover:shadow-md transition-shadow">
          {/* 头部：序号和状态 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Film className="h-5 w-5 text-gray-500" />
              <h3 className="text-lg font-semibold">分镜 {order}</h3>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
              <StatusIcon className={`h-3 w-3 ${isSpinning ? 'animate-spin' : ''}`} />
              {statusInfo.label}
            </span>
          </div>

          {/* 摘要 */}
          <p className="text-gray-700 text-sm mb-3 leading-relaxed">{summary}</p>

          {/* 详细内容 */}
          {sceneDescription && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                <FileText className="h-4 w-4" />
                场景描述
              </h4>
              <p className="text-sm text-gray-600 leading-relaxed">{sceneDescription}</p>
            </div>
          )}

          {keyframePrompt && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-1.5">关键帧提示词</h4>
              <p className="text-sm text-gray-600 font-mono bg-gray-50 p-2.5 rounded-md">
                {keyframePrompt}
              </p>
            </div>
          )}

          {fullPrompt && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-1.5">完整提示词（含画风）</h4>
              <p className="text-sm text-gray-600 font-mono bg-blue-50 p-2.5 rounded-md border border-blue-100">
                {fullPrompt}
              </p>
            </div>
          )}

          {spatialPrompt && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <h4 className="text-sm font-medium text-gray-700 mb-1.5">时空提示词</h4>
              <p className="text-sm text-gray-600 font-mono bg-purple-50 p-2.5 rounded-md border border-purple-100">
                {spatialPrompt}
              </p>
            </div>
          )}
        </div>
      );
    },
  }
);

/**
 * 项目信息块规格定义
 * 
 * 显示项目的基础信息，包括标题、简介、画风和主角
 */
export const BasicInfoBlock = createReactBlockSpec(
  {
    type: 'basicInfo' as const,
    propSchema: {
      title: { default: '' as string },
      summary: { default: '' as string },
      artStyle: { default: '' as string },
      protagonist: { default: '' as string },
    },
    content: 'none' as const,
  },
  {
    render: (props) => {
      const { title, summary, artStyle, protagonist } = props.block.props;

      return (
        <div className="border-2 border-blue-200 rounded-lg p-5 my-3 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
          {/* 标题 */}
          <h3 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title || '未命名项目'}
          </h3>
          
          {/* 信息网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary && (
              <div className="col-span-full">
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-blue-700 whitespace-nowrap">故事简介：</span>
                  <p className="text-sm text-blue-800 leading-relaxed">{summary}</p>
                </div>
              </div>
            )}
            
            {artStyle && (
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">画风：</span>
                <span className="text-sm text-blue-800 bg-white/50 px-2 py-0.5 rounded">{artStyle}</span>
              </div>
            )}
            
            {protagonist && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">主角：</span>
                <span className="text-sm text-blue-800 bg-white/50 px-2 py-0.5 rounded">{protagonist}</span>
              </div>
            )}
          </div>
        </div>
      );
    },
  }
);

/**
 * 创建包含自定义块的 schema
 * 注：createReactBlockSpec 返回工厂函数，需要调用 () 来创建 BlockSpec
 */
export const customBlockSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    scene: SceneBlock(),
    basicInfo: BasicInfoBlock(),
  },
});

export type CustomBlockSchema = typeof customBlockSchema;
