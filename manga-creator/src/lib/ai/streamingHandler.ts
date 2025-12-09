// ==========================================
// 流式响应处理器
// ==========================================
// 功能：
// 1. 处理AI流式响应（SSE/WebSocket）
// 2. 提供实时内容更新
// 3. 支持中断生成
// 4. 显示生成进度
// ==========================================

import { ChatMessage, UserConfig } from '@/types';

// 流式响应回调
export type StreamCallback = (chunk: string, isComplete: boolean) => void;

// 流式响应选项
export interface StreamOptions {
  onChunk: StreamCallback;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  signal?: AbortSignal;
}

/**
 * 创建可中断的AbortController
 */
export function createAbortController(): AbortController {
  return new AbortController();
}

/**
 * 流式调用OpenAI兼容API
 */
export async function streamChat(
  messages: ChatMessage[],
  config: UserConfig,
  options: StreamOptions
): Promise<void> {
  const { onChunk, onError, onComplete, signal } = options;
  
  try {
    const response = await fetch(config.baseURL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
      }),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('Response body is null');
    }
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
          continue;
        }
        
        if (trimmedLine.startsWith('data: ')) {
          try {
            const jsonStr = trimmedLine.slice(6);
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            
            if (content) {
              onChunk(content, false);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
      }
    }
    
    onChunk('', true);
    onComplete?.();
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        onError?.(error);
      }
    }
  }
}

/**
 * 流式调用DeepSeek API
 */
export async function streamChatDeepSeek(
  messages: ChatMessage[],
  config: UserConfig,
  options: StreamOptions
): Promise<void> {
  // DeepSeek使用标准OpenAI格式
  return streamChat(messages, config, options);
}

/**
 * 流式调用Kimi API
 */
export async function streamChatKimi(
  messages: ChatMessage[],
  config: UserConfig,
  options: StreamOptions
): Promise<void> {
  const { onChunk, onError, onComplete, signal } = options;
  
  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'moonshot-v1-8k',
        messages,
        stream: true,
      }),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('Response body is null');
    }
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
          continue;
        }
        
        if (trimmedLine.startsWith('data: ')) {
          try {
            const jsonStr = trimmedLine.slice(6);
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            
            if (content) {
              onChunk(content, false);
            }
          } catch (e) {
            console.warn('Failed to parse SSE data:', e);
          }
        }
      }
    }
    
    onChunk('', true);
    onComplete?.();
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        onError?.(error);
      }
    }
  }
}

/**
 * 流式调用Gemini API
 */
export async function streamChatGemini(
  messages: ChatMessage[],
  config: UserConfig,
  options: StreamOptions
): Promise<void> {
  const { onChunk, onError, onComplete, signal } = options;
  
  try {
    // Gemini API格式转换
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
        }),
        signal,
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error('Response body is null');
    }
    
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
          continue;
        }
        
        try {
          const data = JSON.parse(trimmedLine);
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (content) {
            onChunk(content, false);
          }
        } catch (e) {
          console.warn('Failed to parse Gemini response:', e);
        }
      }
    }
    
    onChunk('', true);
    onComplete?.();
    
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        onError?.(error);
      }
    }
  }
}

/**
 * 通用流式响应处理器（根据供应商自动选择）
 */
export async function streamChatUniversal(
  messages: ChatMessage[],
  config: UserConfig,
  options: StreamOptions
): Promise<void> {
  switch (config.provider) {
    case 'deepseek':
      return streamChatDeepSeek(messages, config, options);
    case 'kimi':
      return streamChatKimi(messages, config, options);
    case 'gemini':
      return streamChatGemini(messages, config, options);
    case 'openai-compatible':
      return streamChat(messages, config, options);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * 计算生成进度（基于内容长度估算）
 */
export function calculateProgress(
  currentLength: number,
  estimatedTotalLength: number
): number {
  if (estimatedTotalLength === 0) return 0;
  const progress = (currentLength / estimatedTotalLength) * 100;
  return Math.min(progress, 95); // 最多显示95%，等完成后再到100%
}

/**
 * 估算剩余时间（基于当前速度）
 */
export function estimateRemainingTime(
  currentLength: number,
  estimatedTotalLength: number,
  elapsedMs: number
): number {
  if (currentLength === 0) return 0;
  const speed = currentLength / elapsedMs; // 字符/毫秒
  const remaining = estimatedTotalLength - currentLength;
  return remaining / speed;
}
