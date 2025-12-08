import { ChatMessage, AIResponse, ProviderType } from '@/types';

export interface AIProviderConfig {
  provider: ProviderType;
  apiKey: string;
  baseURL?: string;
  model: string;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], config: AIProviderConfig): Promise<AIResponse>;
  streamChat(messages: ChatMessage[], config: AIProviderConfig): AsyncGenerator<string>;
}
