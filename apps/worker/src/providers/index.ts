import type { ProviderChatConfig, ChatMessage, ChatResult } from './types.js';
import { chatOpenAICompatible } from './openaiCompatible.js';
import { chatGemini } from './gemini.js';

export async function chatWithProvider(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  switch (config.kind) {
    case 'openai_compatible':
      return chatOpenAICompatible(config, messages);
    case 'gemini':
      return chatGemini(config, messages);
    default: {
      const _exhaustive: never = config.kind;
      throw new Error(`Unsupported provider kind: ${_exhaustive}`);
    }
  }
}


