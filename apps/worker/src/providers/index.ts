import type {
  ProviderChatConfig,
  ProviderImageConfig,
  ChatMessage,
  ChatResult,
  ImageGenerationResult,
} from './types.js';
import { chatOpenAICompatible, generateImagesOpenAICompatible } from './openaiCompatible.js';
import { chatDoubaoArk, generateImagesDoubaoArk } from './doubaoArk.js';
import { chatGemini } from './gemini.js';
import { generateImagesNanoBananaDmxapi } from './nanoBananaDmxapi.js';

export async function chatWithProvider(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  switch (config.kind) {
    case 'openai_compatible':
      return chatOpenAICompatible(config, messages);
    case 'doubao_ark':
      return chatDoubaoArk(config, messages);
    case 'gemini':
      return chatGemini(config, messages);
    default: {
      const _exhaustive: never = config.kind;
      throw new Error(`Unsupported provider kind: ${_exhaustive}`);
    }
  }
}

export async function generateImagesWithProvider(
  config: ProviderImageConfig,
  prompt: string,
): Promise<ImageGenerationResult> {
  switch (config.kind) {
    case 'openai_compatible':
      return generateImagesOpenAICompatible(config, prompt);
    case 'doubao_ark':
      return generateImagesDoubaoArk(config, prompt);
    case 'gemini':
      throw new Error('Gemini image generation not supported yet');
    case 'nanobanana_dmxapi':
      return generateImagesNanoBananaDmxapi(config, prompt);
    default: {
      const _exhaustive: never = config.kind;
      throw new Error(`Unsupported provider kind: ${_exhaustive}`);
    }
  }
}
