import type { AIProvider, AIProviderConfig, AIRequestOptions } from '../types';
import type { ChatMessage, AIResponse } from '@/types';

type ArkResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
};

type ArkResponsesOutputPart = {
  type?: string;
  text?: string;
};

type ArkResponsesOutputItem = {
  content?: ArkResponsesOutputPart[];
};

type ArkResponsesResponse = {
  output_text?: string;
  output?: ArkResponsesOutputItem[];
  usage?: ArkResponsesUsage;
};

type ArkHttpError = Error & { status?: number; statusText?: string; detail?: string };

function normalizeBaseURL(baseURL?: string): string {
  let base = (baseURL || '').trim();
  if (!base) base = 'https://ark.cn-beijing.volces.com/api/v3';
  return base.replace(/\/+$/, '');
}

function mapUsageToTokenUsage(usage: unknown): AIResponse['tokenUsage'] | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const u = usage as Record<string, unknown>;
  const prompt =
    typeof u.prompt_tokens === 'number'
      ? u.prompt_tokens
      : typeof u.input_tokens === 'number'
        ? u.input_tokens
        : undefined;
  const completion =
    typeof u.completion_tokens === 'number'
      ? u.completion_tokens
      : typeof u.output_tokens === 'number'
        ? u.output_tokens
        : undefined;
  const total =
    typeof u.total_tokens === 'number'
      ? u.total_tokens
      : typeof prompt === 'number' || typeof completion === 'number'
        ? (prompt ?? 0) + (completion ?? 0)
        : undefined;

  if (typeof prompt !== 'number' || typeof completion !== 'number' || typeof total !== 'number')
    return undefined;
  return { prompt, completion, total };
}

function extractResponsesText(data: ArkResponsesResponse): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const output = data?.output;
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    const parts = item?.content;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text) return part.text;
    }
  }
  return '';
}

export class DoubaoArkProvider implements AIProvider {
  name = 'Doubao / ARK';

  private async throwResponseError(response: Response): Promise<never> {
    let detail = '';
    try {
      const data = await response.json();
      detail = JSON.stringify(data);
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
    }
    const suffix = detail ? ` - ${detail}` : '';
    const err = new Error(
      `Doubao/ARK error (${response.status} ${response.statusText})${suffix}`,
    ) as ArkHttpError;
    err.status = response.status;
    err.statusText = response.statusText;
    err.detail = detail;
    throw err;
  }

  async chat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): Promise<AIResponse> {
    const url = `${normalizeBaseURL(config.baseURL)}/responses`;
    const p = config.generationParams;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: messages,
        ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
        ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
        ...(typeof p?.maxTokens === 'number' ? { max_output_tokens: p.maxTokens } : {}),
        ...(typeof p?.presencePenalty === 'number' ? { presence_penalty: p.presencePenalty } : {}),
        ...(typeof p?.frequencyPenalty === 'number'
          ? { frequency_penalty: p.frequencyPenalty }
          : {}),
      }),
      signal: options?.signal,
    });

    if (!response.ok) await this.throwResponseError(response);
    const data = (await response.json()) as ArkResponsesResponse;
    return {
      content: extractResponsesText(data) || '',
      tokenUsage: mapUsageToTokenUsage(data?.usage),
    };
  }

  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<string> {
    // 先保证“可用性”：以非流式调用兜底
    const res = await this.chat(messages, config, options);
    yield res.content;
  }
}
