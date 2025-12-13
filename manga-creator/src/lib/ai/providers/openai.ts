import { AIProvider, AIProviderConfig } from '../types';
import { ChatMessage, AIResponse } from '@/types';

export class OpenAICompatibleProvider implements AIProvider {
  name = 'OpenAI Compatible';

  async chat(messages: ChatMessage[], config: AIProviderConfig): Promise<AIResponse> {
    const url = `${config.baseURL || 'https://api.openai.com'}/v1/chat/completions`;
    const params = config.generationParams;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(typeof params?.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.maxTokens === 'number' ? { max_tokens: params.maxTokens } : {}),
        ...(typeof params?.presencePenalty === 'number' ? { presence_penalty: params.presencePenalty } : {}),
        ...(typeof params?.frequencyPenalty === 'number' ? { frequency_penalty: params.frequencyPenalty } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
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
    const url = `${config.baseURL || 'https://api.openai.com'}/v1/chat/completions`;
    const params = config.generationParams;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        ...(typeof params?.temperature === 'number' ? { temperature: params.temperature } : {}),
        ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
        ...(typeof params?.maxTokens === 'number' ? { max_tokens: params.maxTokens } : {}),
        ...(typeof params?.presencePenalty === 'number' ? { presence_penalty: params.presencePenalty } : {}),
        ...(typeof params?.frequencyPenalty === 'number' ? { frequency_penalty: params.frequencyPenalty } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
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
