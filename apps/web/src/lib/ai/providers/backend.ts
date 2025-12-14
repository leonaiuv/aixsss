import type { AIProvider, AIProviderConfig, AIRequestOptions } from '../types';
import type { ChatMessage } from '@/types';
import { apiLlmChat } from '@/lib/api/llm';

export class BackendProvider implements AIProvider {
  name = 'backend';

  async chat(messages: ChatMessage[], config: AIProviderConfig, _options?: AIRequestOptions) {
    const aiProfileId = (config as any)?.aiProfileId as string | undefined;
    if (!aiProfileId) {
      throw new Error('未绑定 AI Profile：请先在「设置」中保存配置');
    }
    return apiLlmChat({ aiProfileId, messages });
  }

  async *streamChat(messages: ChatMessage[], config: AIProviderConfig, options?: AIRequestOptions): AsyncGenerator<string> {
    const res = await this.chat(messages, config, options);
    yield res.content;
  }
}



