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
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], config: AIProviderConfig, options?: AIRequestOptions): Promise<AIResponse>;
  streamChat(messages: ChatMessage[], config: AIProviderConfig, options?: AIRequestOptions): AsyncGenerator<string>;
}
