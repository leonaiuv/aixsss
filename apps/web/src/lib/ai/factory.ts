import { AIProvider, type AIRequestOptions } from './types';
import { ProviderType, UserConfig, ChatMessage, AIResponse } from '@/types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAICompatibleProvider } from './providers/openai';
import { GeminiProvider } from './providers/gemini';
import { KimiProvider } from './providers/kimi';
import { DoubaoArkProvider } from './providers/doubaoArk';
import { BackendProvider } from './providers/backend';
import { isApiMode } from '@/lib/runtime/mode';
import { useAIProgressStore } from '@/stores/aiProgressStore';

// 工厂函数 - 根据供应商类型创建适配器
export function createAIProvider(provider: ProviderType): AIProvider {
  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider();
    case 'kimi':
      return new KimiProvider();
    case 'doubao-ark':
      return new DoubaoArkProvider();
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

  async *streamChat(messages: ChatMessage[], options?: AIRequestOptions): AsyncGenerator<string> {
    const taskId = options?.taskId;
    const store = taskId ? useAIProgressStore.getState() : null;

    // 包装底层生成器，拦截每个 chunk 并更新 store
    const baseGenerator = this.provider.streamChat(messages, this.config, options);

    try {
      for await (const chunk of baseGenerator) {
        // 如果有 taskId，追加输出到 store
        if (taskId && store) {
          store.appendTaskOutput(taskId, chunk);
        }
        yield chunk;
      }
    } catch (error) {
      // 错误时也更新 store，保留当前已收到的输出
      if (taskId && store) {
        const task = store.getTask(taskId);
        if (task) {
          console.debug(
            `[AIClient] Stream error for task ${taskId}, raw output length: ${task.currentOutput?.length ?? 0}`,
          );
        }
      }
      throw error;
    }
  }
}

export class AIFactory {
  static createClient(config: UserConfig): AIClient {
    // 后端模式：浏览器不持有 apiKey，通过 aiProfileId 走服务端调用
    if (isApiMode()) {
      if (!config?.aiProfileId) {
        throw new Error(
          'AI配置未绑定到服务端档案（aiProfileId 缺失）。请在「设置」中保存配置后再试。',
        );
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
