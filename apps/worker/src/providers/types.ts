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

export type ProviderKind = 'openai_compatible' | 'doubao_ark' | 'gemini';

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
   * 结构化输出（JSON Schema / JSON Object）
   * - openai_compatible：透传为 `response_format`
   * - doubao_ark：透传为 Responses API 的 `text.format`
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

export type ImageGenerationParams = {
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  seed?: number;
};

export type ProviderImageConfig = {
  kind: ProviderKind;
  apiKey: string;
  baseURL?: string;
  model?: string;
  params?: ImageGenerationParams;
};

export type ImageResult = {
  url: string;
  revisedPrompt?: string;
};

export type ImageGenerationResult = {
  images: ImageResult[];
};
