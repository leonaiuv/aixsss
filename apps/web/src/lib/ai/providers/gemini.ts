import { AIProvider, AIProviderConfig, type AIRequestOptions } from '../types';
import { ChatMessage, AIResponse } from '@/types';

export class GeminiProvider implements AIProvider {
  name = 'Gemini';

  private buildURL(baseURL?: string, model?: string) {
    const base = (baseURL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const modelName = model || 'gemini-pro';
    return `${base}/v1beta/models/${modelName}:generateContent`;
  }

  private buildStreamURL(baseURL?: string, model?: string) {
    const base = (baseURL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const modelName = model || 'gemini-pro';
    return `${base}/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
  }

  private convertMessagesToGeminiFormat(messages: ChatMessage[]) {
    // Gemini uses 'contents' with 'parts' structure
    // System messages need to be handled separately or converted to user messages
    const contents = messages
      .filter((msg) => msg.role !== 'system') // Gemini doesn't support system role in the same way
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    // If there's a system message, prepend it as a user message with context
    const systemMessage = messages.find((msg) => msg.role === 'system');
    if (systemMessage) {
      contents.unshift({
        role: 'user',
        parts: [{ text: `System instruction: ${systemMessage.content}` }],
      });
    }

    return { contents };
  }

  private async throwResponseError(response: Response): Promise<never> {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error?.message || JSON.stringify(data);
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
    }

    const suffix = detail ? ` - ${detail}` : '';
    throw new Error(`Gemini API error (${response.status} ${response.statusText})${suffix}`);
  }

  async chat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const url = this.buildURL(config.baseURL, config.model);
    const params = config.generationParams;
    const requestBody: Record<string, unknown> = {
      ...this.convertMessagesToGeminiFormat(messages),
    };

    if (params) {
      requestBody.generationConfig = {
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params.topP === 'number' ? { topP: params.topP } : {}),
        ...(typeof params.maxTokens === 'number' ? { maxOutputTokens: params.maxTokens } : {}),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      await this.throwResponseError(response);
    }

    const data = await response.json();

    // Extract text from Gemini's response format
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      tokenUsage: data.usageMetadata
        ? {
            prompt: data.usageMetadata.promptTokenCount,
            completion: data.usageMetadata.candidatesTokenCount,
            total: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<string> {
    const url = this.buildStreamURL(config.baseURL, config.model);
    const params = config.generationParams;
    const requestBody: Record<string, unknown> = {
      ...this.convertMessagesToGeminiFormat(messages),
    };

    if (params) {
      requestBody.generationConfig = {
        ...(typeof params.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params.topP === 'number' ? { topP: params.topP } : {}),
        ...(typeof params.maxTokens === 'number' ? { maxOutputTokens: params.maxTokens } : {}),
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal,
    });

    if (!response.ok) {
      await this.throwResponseError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) yield content;
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }
}
