"use client";

import { FC, useEffect, useMemo, useCallback, useRef, useState } from "react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { customBlockSchema } from "./custom-blocks";
import { useCanvasStore, type CanvasBlock } from "@/stores/canvasStore";
import { useProjectStore } from "@/stores/projectStore";

export interface EditorProps {
  className?: string;
  /** 同步防抖时间（毫秒） */
  syncDebounceMs?: number;
}

export const Editor: FC<EditorProps> = ({ className, syncDebounceMs = 1000 }) => {
  const { blocks, markSynced, markDirty, isDirty, setBlocks } = useCanvasStore();
  const { projectState } = useProjectStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 将 Canvas Store 中的 blocks 转换为 BlockNote 格式
  const initialContent = useMemo(() => {
    if (blocks.length === 0) {
      return [
        {
          type: "paragraph" as const,
          content: "开始创作你的漫剧故事...",
        },
      ];
    }

    // 转换 CanvasBlock 到 BlockNote Block
    return blocks.map((block) => {
      if (block.type === 'project') {
        return {
          type: 'basicInfo' as const,
          props: {
            title: (block.content.title as string) || '',
            summary: (block.content.summary as string) || '',
            artStyle: (block.content.artStyle as string) || '',
            protagonist: (block.content.protagonist as string) || '',
          },
        };
      } else if (block.type === 'scene') {
        return {
          type: 'scene' as const,
          props: {
            sceneId: block.id,
            order: (block.content.order as number) || 0,
            summary: (block.content.summary as string) || '',
            status: (block.content.status as string) || 'pending',
            sceneDescription: (block.content.sceneDescription as string) || '',
            keyframePrompt: (block.content.keyframePrompt as string) || '',
            spatialPrompt: (block.content.spatialPrompt as string) || '',
            fullPrompt: (block.content.fullPrompt as string) || '',
          },
        };
      }
      return {
        type: "paragraph" as const,
        content: JSON.stringify(block.content),
      };
    });
  }, [blocks]);

  // 创建 BlockNote 编辑器实例，使用自定义 schema
  const editor = useCreateBlockNote({
    schema: customBlockSchema,
    initialContent,
  });

  // 当 blocks 变化时，更新编辑器内容
  useEffect(() => {
    if (blocks.length > 0 && editor) {
      const newBlocks = blocks.map((block) => {
        if (block.type === 'project') {
          return {
            type: 'basicInfo' as const,
            props: {
              title: (block.content.title as string) || '',
              summary: (block.content.summary as string) || '',
              artStyle: (block.content.artStyle as string) || '',
              protagonist: (block.content.protagonist as string) || '',
            },
          };
        } else if (block.type === 'scene') {
          return {
            type: 'scene' as const,
            props: {
              sceneId: block.id,
              order: (block.content.order as number) || 0,
              summary: (block.content.summary as string) || '',
              status: (block.content.status as string) || 'pending',
              sceneDescription: (block.content.sceneDescription as string) || '',
              keyframePrompt: (block.content.keyframePrompt as string) || '',
              spatialPrompt: (block.content.spatialPrompt as string) || '',
              fullPrompt: (block.content.fullPrompt as string) || '',
            },
          };
        }
        return {
          type: "paragraph" as const,
          content: JSON.stringify(block.content),
        };
      });

      // 使用 setTimeout 避免 flushSync 在 React 渲染期间被调用
      setTimeout(() => {
        editor.replaceBlocks(editor.document, newBlocks as never[]);
        markSynced();
      }, 0);
    }
  }, [blocks, editor, markSynced]);

  /**
   * 将 BlockNote 块转换为 Canvas Store 格式
   */
  const convertBlockNoteToCanvasBlocks = useCallback((): CanvasBlock[] => {
    if (!editor) return [];

    const canvasBlocks: CanvasBlock[] = [];
    
    for (const block of editor.document) {
      const blockType = (block as { type?: string }).type;
      const blockProps = (block as { props?: Record<string, unknown> }).props || {};
      const blockId = (block as { id?: string }).id || `block-${Date.now()}`;

      if (blockType === 'basicInfo') {
        canvasBlocks.push({
          id: blockId,
          type: 'project',
          content: {
            title: blockProps.title || '',
            summary: blockProps.summary || '',
            artStyle: blockProps.artStyle || '',
            protagonist: blockProps.protagonist || '',
          },
        });
      } else if (blockType === 'scene') {
        canvasBlocks.push({
          id: blockProps.sceneId as string || blockId,
          type: 'scene',
          content: {
            order: blockProps.order || 0,
            summary: blockProps.summary || '',
            status: blockProps.status || 'pending',
            sceneDescription: blockProps.sceneDescription || '',
            keyframePrompt: blockProps.keyframePrompt || '',
            spatialPrompt: blockProps.spatialPrompt || '',
            fullPrompt: blockProps.fullPrompt || '',
          },
        });
      }
    }

    return canvasBlocks;
  }, [editor]);

  /**
   * 同步画布变化到 Agent 状态
   */
  const syncToAgent = useCallback(async (canvasBlocks: CanvasBlock[]) => {
    const projectId = projectState?.projectId;
    if (!projectId) {
      console.warn('[Editor] 无法同步: 缺少 projectId');
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const response = await fetch('/api/agent/update-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, blocks: canvasBlocks }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '同步失败');
      }

      // 更新本地状态
      setBlocks(canvasBlocks);
      markSynced();
      console.log('[Editor] 画布已同步到 Agent');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '同步失败';
      setLastSyncError(errorMsg);
      console.error('[Editor] 同步失败:', errorMsg);
    } finally {
      setIsSyncing(false);
    }
  }, [projectState?.projectId, setBlocks, markSynced]);

  /**
   * 处理编辑器内容变化（防抖同步）
   */
  const handleChange = useCallback(() => {
    // 标记为脏数据
    markDirty();

    // 清除之前的定时器
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // 设置新的防抖定时器
    syncTimeoutRef.current = setTimeout(() => {
      const canvasBlocks = convertBlockNoteToCanvasBlocks();
      if (canvasBlocks.length > 0) {
        syncToAgent(canvasBlocks);
      }
    }, syncDebounceMs);
  }, [markDirty, convertBlockNoteToCanvasBlocks, syncToAgent, syncDebounceMs]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`flex h-full flex-col ${className ?? ""}`}>
      {/* 编辑器头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">创作画布</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isSyncing && (
            <span className="text-blue-500">同步中...</span>
          )}
          {!isSyncing && isDirty && (
            <span className="text-amber-500">有未保存的更改</span>
          )}
          {!isSyncing && !isDirty && (
            <span className="text-green-500">已保存</span>
          )}
          {lastSyncError && (
            <span className="text-red-500" title={lastSyncError}>同步失败</span>
          )}
        </div>
      </div>

      {/* BlockNote 编辑器 */}
      <div className="flex-1 overflow-y-auto">
        <BlockNoteView
          editor={editor}
          theme="light"
          className="min-h-full"
          onChange={handleChange}
        />
      </div>
    </div>
  );
};
