import { ChatMessage, AIResponse, ProviderType, AIGenerationParams } from '@/types';

export interface AIProviderConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL?: string;
  model: string;
  generationParams?: AIGenerationParams;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], config: AIProviderConfig): Promise<AIResponse>;
  streamChat(messages: ChatMessage[], config: AIProviderConfig): AsyncGenerator<string>;
}
