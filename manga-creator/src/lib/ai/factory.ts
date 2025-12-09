import { AIProvider } from './types';
import { ProviderType, UserConfig, ChatMessage, AIResponse } from '@/types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAICompatibleProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { KimiProvider } from './providers/kimi';

// 工厂函数 - 根据供应商类型创建适配器
export function createAIProvider(provider: ProviderType): AIProvider {
  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider();
    case 'kimi':
      return new KimiProvider();
    case 'openai-compatible':
      return new OpenAICompatibleProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

class AIClient {
  private provider: AIProvider;
  private config: UserConfig;

  constructor(provider: AIProvider, config: UserConfig) {
    this.provider = provider;
    this.config = config;
  }

  get providerName(): string {
    return this.provider.name;
  }

  chat(messages: ChatMessage[]): Promise<AIResponse> {
    return this.provider.chat(messages, this.config);
  }

  streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
    return this.provider.streamChat(messages, this.config);
  }
}

export class AIFactory {
  static createClient(config: UserConfig): AIClient {
    if (!config?.provider || !config?.apiKey || !config?.model) {
      throw new Error('AI配置不完整, 请检查供应商、API Key与模型');
    }

    const provider = createAIProvider(config.provider);
    return new AIClient(provider, config);
  }
}
