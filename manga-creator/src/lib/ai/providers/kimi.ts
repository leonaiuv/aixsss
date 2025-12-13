import { AIProvider, AIProviderConfig } from '../types';
import { ChatMessage, AIResponse } from '@/types';

const KIMI_BASE_URL = 'https://api.moonshot.cn';

export class KimiProvider implements AIProvider {
  name = 'Kimi';

  async chat(messages: ChatMessage[], config: AIProviderConfig): Promise<AIResponse> {
    const url = `${KIMI_BASE_URL}/v1/chat/completions`;
    const model = config.model || 'moonshot-v1-8k';
    const isThinkingModel = model.includes('thinking');
    const params = config.generationParams;

    const temperature = isThinkingModel
      ? 1.0
      : typeof params?.temperature === 'number'
      ? params.temperature
      : 0.6;

    const maxTokens = isThinkingModel
      ? Math.max(16000, typeof params?.maxTokens === 'number' ? params.maxTokens : 16000)
      : typeof params?.maxTokens === 'number'
      ? params.maxTokens
      : 4096;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.presencePenalty === 'number' ? { presence_penalty: params.presencePenalty } : {}),
        ...(typeof params?.frequencyPenalty === 'number' ? { frequency_penalty: params.frequencyPenalty } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Kimi API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Kimi API错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      tokenUsage: data.usage ? {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      } : undefined,
    };
  }

  async *streamChat(messages: ChatMessage[], config: AIProviderConfig): AsyncGenerator<string> {
    const url = `${KIMI_BASE_URL}/v1/chat/completions`;
    const model = config.model || 'moonshot-v1-8k';
    const isThinkingModel = model.includes('thinking');
    const params = config.generationParams;

    const temperature = isThinkingModel
      ? 1.0
      : typeof params?.temperature === 'number'
      ? params.temperature
      : 0.6;

    const maxTokens = isThinkingModel
      ? Math.max(16000, typeof params?.maxTokens === 'number' ? params.maxTokens : 16000)
      : typeof params?.maxTokens === 'number'
      ? params.maxTokens
      : 4096;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature,
        max_tokens: maxTokens,
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.presencePenalty === 'number' ? { presence_penalty: params.presencePenalty } : {}),
        ...(typeof params?.frequencyPenalty === 'number' ? { frequency_penalty: params.frequencyPenalty } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Kimi API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Kimi API错误 (${response.status}): ${errorText}`);
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
            const delta = json.choices[0]?.delta;
            // Kimi K2 Thinking 模型: 只返回 content (推理结果)，不返回 reasoning_content
            const content = delta?.content;
            if (content) yield content;
          } catch (e) {
            console.error('Failed to parse Kimi SSE data:', e);
          }
        }
      }
    }
  }
}
