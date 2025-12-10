'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { CheckCircle, Clock, AlertCircle, Loader2, FileText, Download, Film, Settings } from 'lucide-react';
import type { SceneStatus } from '@/types';

/**
 * 场景数据类型
 */
interface SceneData {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
  sceneDescription?: string;
  keyframePrompt?: string;
  spatialPrompt?: string;
}

/**
 * 工具返回结果通用类型
 */
interface ToolResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 状态图标组件
 */
const StatusIcon = ({ status }: { status: SceneStatus }) => {
  switch (status) {
    case 'completed':
    case 'keyframe_confirmed':
    case 'scene_confirmed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'in_progress':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
};

/**
 * 状态标签
 */
const statusLabels: Record<SceneStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  scene_confirmed: '场景已确认',
  keyframe_confirmed: '关键帧已确认',
  completed: '已完成',
  error: '出错',
};

/**
 * 分镜卡片组件
 */
const SceneCard = ({ scene }: { scene: SceneData }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
    <div className="flex-shrink-0 mt-0.5">
      <StatusIcon status={scene.status} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">#{scene.order}</span>
        <span className="text-xs text-muted-foreground">
          {statusLabels[scene.status]}
        </span>
      </div>
      <p className="text-sm text-foreground mt-1 line-clamp-2">{scene.summary}</p>
    </div>
  </div>
);

/**
 * create_project 工具 UI
 * 
 * 显示创建项目的结果
 */
export const CreateProjectToolUI = makeAssistantToolUI<
  { title: string },
  ToolResult<{ projectId: string; title: string; createdAt: string }>
>({
  toolName: 'createProject',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-blue-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700">
              正在创建项目「{args.title}」...
            </span>
          </div>
        </div>
      );
    }

    if (!result?.success) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-700">创建项目失败</span>
          </div>
          <p className="text-sm text-red-600 mt-1">{result?.error || result?.message}</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-green-50 p-4 my-2">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">
            项目创建成功
          </span>
        </div>
        <div className="text-sm text-green-800">
          <p><span className="font-medium">项目名称：</span>{result.data?.title}</p>
          <p className="text-xs text-green-600 mt-1">{result.message}</p>
        </div>
      </div>
    );
  },
});

/**
 * generate_scenes 工具 UI
 * 
 * 显示生成的分镜列表
 */
export const SceneListToolUI = makeAssistantToolUI<
  { count: number },
  { scenes: SceneData[] } // tool 直接返回 scenes 数据
>({
  toolName: 'generateScenes',
  render: function GenerateScenesUI({ args, result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-blue-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700">
              正在生成 {args.count} 个分镜...
            </span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete' && status.reason === 'error') {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-700">生成分镜失败</span>
          </div>
        </div>
      );
    }

    // tool 直接返回 { scenes: [...] }
    if (!result?.scenes || !Array.isArray(result.scenes)) {
      return (
        <div className="rounded-lg border bg-yellow-50 p-4 my-2">
          <p className="text-sm text-yellow-700">生成失败：数据格式错误</p>
        </div>
      );
    }

    const scenes = result.scenes;

    return (
      <div className="rounded-lg border bg-card p-4 my-2">
        <div className="flex items-center gap-2 mb-3">
          <Film className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">
            生成了 {scenes.length} 个分镜
          </span>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {scenes.map((scene: SceneData) => (
            <SceneCard key={scene.id} scene={scene} />
          ))}
        </div>
      </div>
    );
  },
});

/**
 * refine_scene 工具 UI
 * 
 * 显示细化后的分镜详情
 */
export const SceneDetailToolUI = makeAssistantToolUI<
  { sceneId: string },
  ToolResult<{
    sceneId: string;
    sceneDescription?: string;
    keyframePrompt?: string;
    spatialPrompt?: string;
    fullPrompt?: string;
    status: string;
  }>
>({
  toolName: 'refineScene',
  render: function RefineSceneUI({ result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-purple-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
            <span className="text-sm font-medium text-purple-700">
              正在细化分镜...
            </span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete' && status.reason === 'error') {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-700">细化分镜失败</span>
          </div>
        </div>
      );
    }

    if (!result?.success || !result.data) {
      return (
        <div className="rounded-lg border bg-yellow-50 p-4 my-2">
          <p className="text-sm text-yellow-700">{result?.message || result?.error || '细化失败'}</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-card p-4 my-2">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">分镜细化完成</span>
        </div>

        <div className="space-y-3">
          {result.data.sceneDescription && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                场景描述
              </h4>
              <p className="text-sm">{result.data.sceneDescription}</p>
            </div>
          )}

          {result.data.keyframePrompt && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                关键帧提示词
              </h4>
              <code className="block text-xs bg-muted p-2 rounded whitespace-pre-wrap">
                {result.data.keyframePrompt}
              </code>
            </div>
          )}

          {result.data.fullPrompt && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                完整提示词（含画风）
              </h4>
              <code className="block text-xs bg-blue-50 p-2 rounded whitespace-pre-wrap border border-blue-100">
                {result.data.fullPrompt}
              </code>
            </div>
          )}

          {result.data.spatialPrompt && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1">
                时空提示词
              </h4>
              <code className="block text-xs bg-purple-50 p-2 rounded whitespace-pre-wrap border border-purple-100">
                {result.data.spatialPrompt}
              </code>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{result.message}</p>
      </div>
    );
  },
});

/**
 * set_project_info 工具 UI
 * 
 * 显示项目信息设置结果
 */
export const BasicInfoToolUI = makeAssistantToolUI<
  { title?: string; summary?: string; artStyle?: string; protagonist?: string },
  ToolResult<{ title?: string; summary?: string; artStyle?: string; protagonist?: string }>
>({
  toolName: 'setProjectInfo',
  render: function SetProjectInfoUI({ args, result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-blue-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700">
              正在保存项目信息...
            </span>
          </div>
        </div>
      );
    }

    if (!result?.success) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <p className="text-sm text-red-700">{result?.message || result?.error || '保存失败'}</p>
        </div>
      );
    }

    const data = result.data || args;

    return (
      <div className="rounded-lg border bg-green-50 p-4 my-2">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="h-5 w-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">
            项目信息已更新
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {data.title && (
            <div>
              <span className="text-muted-foreground">标题: </span>
              <span>{data.title}</span>
            </div>
          )}
          {data.artStyle && (
            <div>
              <span className="text-muted-foreground">画风: </span>
              <span>{data.artStyle}</span>
            </div>
          )}
          {data.summary && (
            <div className="col-span-2">
              <span className="text-muted-foreground">简介: </span>
              <span>{data.summary}</span>
            </div>
          )}
          {data.protagonist && (
            <div className="col-span-2">
              <span className="text-muted-foreground">主角: </span>
              <span>{data.protagonist}</span>
            </div>
          )}
        </div>
        <p className="text-xs text-green-600 mt-2">{result.message}</p>
      </div>
    );
  },
});

/**
 * export_prompts 工具 UI
 * 
 * 显示导出结果
 */
export const ExportToolUI = makeAssistantToolUI<
  { format?: 'json' | 'csv' | 'text' },
  ToolResult<{ format: string; content: string; scenesCount: number; downloadUrl?: string | null }>
>({
  toolName: 'exportPrompts',
  render: function ExportPromptsUI({ result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-blue-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700">
              正在导出提示词...
            </span>
          </div>
        </div>
      );
    }

    if (!result?.success || !result.data) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <p className="text-sm text-red-700">{result?.message || result?.error || '导出失败'}</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-green-50 p-4 my-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-green-500" />
            <span className="text-sm font-semibold text-green-700">
              导出完成 ({result.data.format})
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            共 {result.data.scenesCount} 个分镜
          </span>
        </div>
        {result.data.content && (
          <pre className="text-xs bg-white p-2 rounded border max-h-40 overflow-auto">
            {result.data.content.slice(0, 500)}
            {result.data.content.length > 500 && '...'}
          </pre>
        )}
        <p className="text-xs text-green-600 mt-2">{result.message}</p>
      </div>
    );
  },
});

/**
 * batch_refine_scenes 工具 UI
 * 
 * 显示批量细化结果
 */
export const BatchRefineToolUI = makeAssistantToolUI<
  { sceneIds: string[] },
  ToolResult<{ results: Array<{ sceneId: string; status: string }> }>
>({
  toolName: 'batchRefineScenes',
  render: function BatchRefineUI({ args, result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-purple-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
            <span className="text-sm font-medium text-purple-700">
              正在批量细化 {args.sceneIds.length} 个分镜...
            </span>
          </div>
        </div>
      );
    }

    if (!result?.success || !result.data) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <p className="text-sm text-red-700">{result?.message || result?.error || '批量细化失败'}</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border bg-green-50 p-4 my-2">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">
            批量细化完成
          </span>
        </div>
        <p className="text-sm text-green-700">
          已成功细化 {result.data.results.length} 个分镜
        </p>
        <p className="text-xs text-green-600 mt-1">{result.message}</p>
      </div>
    );
  },
});

/**
 * get_project_state 工具 UI
 * 
 * 显示项目状态
 */
export const ProjectStateToolUI = makeAssistantToolUI<
  { projectId?: string },
  ToolResult<{
    projectId: string;
    workflowState: string;
    title: string;
    summary: string;
    artStyle: string;
    protagonist: string;
    scenesCount: number;
  }>
>({
  toolName: 'getProjectState',
  render: function GetProjectStateUI({ result, status }) {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-blue-50 p-4 my-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-blue-700">
              正在获取项目状态...
            </span>
          </div>
        </div>
      );
    }

    if (!result?.success || !result.data) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-2">
          <p className="text-sm text-red-700">{result?.message || result?.error || '获取失败'}</p>
        </div>
      );
    }

    const data = result.data;
    const stateLabels: Record<string, string> = {
      IDLE: '空闲',
      COLLECTING_BASIC_INFO: '收集基础信息',
      BASIC_INFO_COMPLETE: '基础信息完成',
      GENERATING_SCENES: '生成分镜中',
      SCENE_LIST_EDITING: '分镜编辑中',
      REFINING_SCENES: '细化分镜中',
      ALL_SCENES_COMPLETE: '所有分镜完成',
      EXPORTING: '导出中',
      EXPORTED: '已导出',
    };

    return (
      <div className="rounded-lg border bg-blue-50 p-4 my-2">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">
            {data.title || '未命名项目'}
          </span>
          <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
            {stateLabels[data.workflowState] || data.workflowState}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {data.summary && (
            <div className="col-span-2">
              <span className="text-muted-foreground">简介: </span>
              <span className="text-blue-800">{data.summary}</span>
            </div>
          )}
          {data.artStyle && (
            <div>
              <span className="text-muted-foreground">画风: </span>
              <span className="text-blue-800">{data.artStyle}</span>
            </div>
          )}
          {data.protagonist && (
            <div>
              <span className="text-muted-foreground">主角: </span>
              <span className="text-blue-800">{data.protagonist}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">分镜数: </span>
            <span className="text-blue-800">{data.scenesCount}</span>
          </div>
        </div>
      </div>
    );
  },
});
