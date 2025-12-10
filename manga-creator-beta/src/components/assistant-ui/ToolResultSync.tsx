'use client';

import { useEffect, useRef } from 'react';
import { useThreadRuntime } from '@assistant-ui/react';
import { useToolCallSync } from '@/hooks/useToolCallSync';

/**
 * Tool 结果同步组件
 * 
 * 监听 Thread 中的消息变化，当检测到 tool 调用完成时，
 * 自动同步结果到 Canvas。
 */
export function ToolResultSync() {
  const threadRuntime = useThreadRuntime();
  const { handleToolResult } = useToolCallSync();
  const processedToolCalls = useRef<Set<string>>(new Set());

  useEffect(() => {
    // 订阅消息变化
    const unsubscribe = threadRuntime.subscribe(() => {
      const messages = threadRuntime.getState().messages;
      
      for (const message of messages) {
        if (message.role !== 'assistant') continue;
        
        // 遍历消息中的所有 parts
        for (const part of message.content) {
          if (part.type !== 'tool-call') continue;
          
          const toolCallId = part.toolCallId;
          
          // 跳过已处理的 tool call
          if (processedToolCalls.current.has(toolCallId)) continue;
          
          // 检查是否有结果（在后续消息中查找 tool-result）
          const resultMessage = messages.find(m => 
            m.role === 'tool' && 
            m.content.some((c: { type: string; toolCallId?: string }) => 
              c.type === 'tool-result' && c.toolCallId === toolCallId
            )
          );
          
          if (resultMessage) {
            const resultPart = resultMessage.content.find(
              (c: { type: string; toolCallId?: string }) => 
                c.type === 'tool-result' && c.toolCallId === toolCallId
            ) as { type: string; toolCallId: string; result: unknown } | undefined;
            
            if (resultPart && resultPart.result) {
              console.log(`[ToolResultSync] Syncing ${part.toolName}:`, resultPart.result);
              
              handleToolResult({
                toolName: part.toolName,
                result: resultPart.result as Record<string, unknown>,
              });
              
              processedToolCalls.current.add(toolCallId);
            }
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [threadRuntime, handleToolResult]);

  // 这个组件不渲染任何 UI
  return null;
}
