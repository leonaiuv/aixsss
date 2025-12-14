import { AIProvider, AIProviderConfig, type AIRequestOptions } from '../types';
import { ChatMessage, AIResponse } from '@/types';

export class DeepSeekProvider implements AIProvider {
  name = 'DeepSeek';

  private buildURL(baseURL?: string) {
    const base = (baseURL || 'https://api.deepseek.com').replace(/\/$/, '');
    return `${base}/v1/chat/completions`;
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
    throw new Error(`DeepSeek API error (${response.status} ${response.statusText})${suffix}`);
  }

  async chat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const url = this.buildURL(config.baseURL);
    const params = config.generationParams;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        messages,
        ...(typeof params?.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.maxTokens === 'number' ? { max_tokens: params.maxTokens } : {}),
        ...(typeof params?.presencePenalty === 'number'
          ? { presence_penalty: params.presencePenalty }
          : {}),
        ...(typeof params?.frequencyPenalty === 'number'
          ? { frequency_penalty: params.frequencyPenalty }
          : {}),
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      await this.throwResponseError(response);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      tokenUsage: {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      },
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<string> {
    const url = this.buildURL(config.baseURL);
    const params = config.generationParams;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        messages,
        stream: true,
        ...(typeof params?.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.maxTokens === 'number' ? { max_tokens: params.maxTokens } : {}),
        ...(typeof params?.presencePenalty === 'number'
          ? { presence_penalty: params.presencePenalty }
          : {}),
        ...(typeof params?.frequencyPenalty === 'number'
          ? { frequency_penalty: params.frequencyPenalty }
          : {}),
      }),
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
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const json = JSON.parse(data);
            const content = json.choices[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }
}
