export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type GenerationParams = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
};

export type ProviderKind = 'openai_compatible' | 'gemini';

export type ProviderChatConfig = {
  kind: ProviderKind;
  apiKey: string;
  baseURL?: string;
  model: string;
  params?: GenerationParams;
};

export type ChatResult = {
  content: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
};


