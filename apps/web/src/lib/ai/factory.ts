import { AIProvider, type AIRequestOptions } from './types';
import { ProviderType, UserConfig, ChatMessage, AIResponse } from '@/types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAICompatibleProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { KimiProvider } from './providers/kimi';
import { BackendProvider } from './providers/backend';
import { isApiMode } from '@/lib/runtime/mode';

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

  chat(messages: ChatMessage[], options?: AIRequestOptions): Promise<AIResponse> {
    return this.provider.chat(messages, this.config, options);
  }

  streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncGenerator<string> {
    return this.provider.streamChat(messages, this.config, options);
  }
}

export class AIFactory {
  static createClient(config: UserConfig): AIClient {
    // 后端模式：浏览器不持有 apiKey，通过 aiProfileId 走服务端调用
    if (isApiMode()) {
      if (!config?.aiProfileId) {
        throw new Error('AI配置未绑定到服务端档案（aiProfileId 缺失）。请在「设置」中保存配置后再试。');
      }
      return new AIClient(new BackendProvider(), config);
    }

    // 本地模式：沿用旧逻辑（用于测试/离线/兼容）
    if (!config?.provider || !config?.apiKey || !config?.model) {
      throw new Error('AI配置不完整, 请检查供应商、API Key与模型');
    }

    const provider = createAIProvider(config.provider);
    return new AIClient(provider, config);
  }
}
