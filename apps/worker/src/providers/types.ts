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
  /**
   * 推理强度（Thinking/Reasoning effort）
   * - 仅 GPT-5 / 推理类模型在 Responses API 下生效
   */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
};

export type ProviderKind = 'openai_compatible' | 'gemini';

export type JsonSchemaResponseFormat = {
  type: 'json_schema';
  json_schema: {
    name: string;
    /**
     * strict=true 会要求模型严格按 schema 输出（建议 additionalProperties=false）
     */
    strict: boolean;
    schema: Record<string, unknown>;
  };
};

export type ResponseFormat = JsonSchemaResponseFormat | { type: 'json_object' };

export type ProviderChatConfig = {
  kind: ProviderKind;
  apiKey: string;
  baseURL?: string;
  model: string;
  params?: GenerationParams;
  /**
   * 结构化输出（OpenAI Structured Outputs / Responses API）
   * - 仅 openai_compatible 支持；其它 provider 会忽略
   */
  responseFormat?: ResponseFormat;
};

export type ChatResult = {
  content: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
};


