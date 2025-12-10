import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * DeepSeek API 配置
 */
export interface DeepSeekConfig {
  /** API 密钥 (必需) */
  apiKey: string;
  /** 模型名称 */
  model?: string;
  /** API 基础 URL */
  baseURL?: string;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 温度参数 */
  temperature?: number;
}

/**
 * DeepSeek 客户端接口
 */
export interface DeepSeekClient {
  /** 聊天模型实例 */
  chat: LanguageModel;
  /** 配置信息 */
  config: Required<DeepSeekConfig>;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  model: 'deepseek-chat',
  baseURL: 'https://api.deepseek.com/v1',
  maxTokens: 4096,
  temperature: 0.7,
} as const;

/**
 * 创建 DeepSeek API 客户端
 * 
 * DeepSeek 使用 OpenAI 兼容的 API 接口，所以可以直接使用 @ai-sdk/openai
 * 
 * @param config - 客户端配置
 * @returns DeepSeek 客户端实例
 * @throws 如果未提供 API Key
 * 
 * @example
 * ```ts
 * const client = createDeepSeekClient({
 *   apiKey: process.env.DEEPSEEK_API_KEY!,
 * });
 * 
 * const result = await streamText({
 *   model: client.chat,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */
export function createDeepSeekClient(config: DeepSeekConfig): DeepSeekClient {
  if (!config.apiKey) {
    throw new Error('API Key is required');
  }

  const fullConfig: Required<DeepSeekConfig> = {
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_CONFIG.model,
    baseURL: config.baseURL ?? DEFAULT_CONFIG.baseURL,
    maxTokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
  };

  // 使用 OpenAI 兼容客户端
  const openai = createOpenAI({
    apiKey: fullConfig.apiKey,
    baseURL: fullConfig.baseURL,
  });

  return {
    chat: openai(fullConfig.model),
    config: fullConfig,
  };
}

/**
 * 从环境变量创建默认客户端
 */
export function createDefaultDeepSeekClient(): DeepSeekClient {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }

  return createDeepSeekClient({ apiKey });
}
