import { ChatMessage, AIResponse, ProviderType, AIGenerationParams } from '@/types';

export interface AIProviderConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL?: string;
  model: string;
  generationParams?: AIGenerationParams;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  /** 关联的任务ID，用于更新DevPanel中的流式输出监控 */
  taskId?: string;
}

export interface AIProvider {
  name: string;
  chat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse>;
  streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<string>;
}
