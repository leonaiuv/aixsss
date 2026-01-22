import { AIProvider, AIProviderConfig, type AIRequestOptions } from '../types';
import { ChatMessage, AIResponse } from '@/types';

type OpenAIResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  // 兼容旧字段
  prompt_tokens?: number;
  completion_tokens?: number;
};

type OpenAIResponsesOutputPart = {
  type?: string;
  text?: string;
};

type OpenAIResponsesOutputItem = {
  content?: OpenAIResponsesOutputPart[];
};

type OpenAIResponsesResponse = {
  output_text?: string;
  output?: OpenAIResponsesOutputItem[];
  usage?: OpenAIResponsesUsage;
};

type OpenAIHttpError = Error & {
  status?: number;
  statusText?: string;
  detail?: string;
};

function normalizeBaseURL(baseURL?: string): string {
  let base = (baseURL || '').trim();
  if (!base) base = 'https://api.openai.com';
  base = base.replace(/\/$/, '');
  // 避免用户误填了 /v1 或 /v1beta 导致重复拼接
  base = base.replace(/\/(v1beta|v1)$/, '');
  return base;
}

function buildChatCompletionsUrl(baseURL?: string): string {
  return `${normalizeBaseURL(baseURL)}/v1/chat/completions`;
}

function buildResponsesUrl(baseURL?: string): string {
  return `${normalizeBaseURL(baseURL)}/v1/responses`;
}

function shouldPreferResponses(model: string): boolean {
  const m = (model || '').toLowerCase().trim();
  if (!m) return false;
  if (m.includes('gpt-5')) return true;
  if (/(^|\/)o\d/.test(m)) return true;
  return false;
}

function normalizeReasoningEffortForModel(model: string, effort: unknown): string | undefined {
  if (!effort || typeof effort !== 'string') return undefined;
  const m = (model || '').toLowerCase();
  const isGpt52 = m.includes('gpt-5.2') || m.includes('gpt5.2');
  const isGpt5 = (m.includes('gpt-5') || m.includes('gpt5')) && !isGpt52;
  const isO = /(^|\/)o\d/.test(m);

  if (isGpt52) {
    if (effort === 'minimal') return 'none';
    return effort;
  }

  if (isGpt5) {
    if (effort === 'xhigh') return 'high';
    if (effort === 'none') return 'minimal';
    return effort;
  }

  if (isO) {
    if (effort === 'minimal') return 'low';
    if (effort === 'xhigh') return 'high';
    if (effort === 'none') return undefined;
    return effort;
  }

  return effort;
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

  if (typeof prompt !== 'number' || typeof completion !== 'number' || typeof total !== 'number') {
    return undefined;
  }
  return { prompt, completion, total };
}

function extractResponsesText(data: OpenAIResponsesResponse): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const output = data?.output;
  if (!Array.isArray(output)) return '';

  const prefer: string[] = [];
  const fallback: string[] = [];

  for (const item of output) {
    const parts = item?.content;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const text = typeof part?.text === 'string' ? part.text : '';
      if (!text) continue;
      const partType = typeof part?.type === 'string' ? part.type : '';
      if (!partType || partType === 'output_text') prefer.push(text);
      else fallback.push(text);
    }
  }

  if (prefer.length) return prefer.join('');
  return fallback.join('');
}

function isEndpointOrModelUnsupportedForResponses(err: unknown): boolean {
  const e = err as OpenAIHttpError | undefined;
  const status = e?.status;
  const detail = (e?.detail || e?.message || '').toLowerCase();
  if (status === 404) return true;
  if (status === 400) {
    if (
      /unknown endpoint|not found|no such endpoint|unsupported.*responses|invalid.*endpoint/.test(
        detail,
      )
    )
      return true;
  }
  return false;
}

function shouldFallbackToResponsesFromChat(err: unknown): boolean {
  const e = err as OpenAIHttpError | undefined;
  const status = e?.status;
  const detail = (e?.detail || e?.message || '').toLowerCase();
  if (status === 400 || status === 404) {
    if (
      /\/v1\/responses|use responses|requires responses|responses api|not support.*chat|unsupported.*chat/.test(
        detail,
      )
    )
      return true;
    if (/max_tokens.*deprecated|max_completion_tokens/.test(detail)) return true;
  }
  return false;
}

export class OpenAICompatibleProvider implements AIProvider {
  name = 'OpenAI Compatible';

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
    const err = new Error(
      `OpenAI API error (${response.status} ${response.statusText})${suffix}`,
    ) as OpenAIHttpError;
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
    const params = config.generationParams;
    const preferResponses = shouldPreferResponses(config.model);

    const callChatCompletions = async (opts?: { safeForResponsesPreferredModel?: boolean }) => {
      const safe = Boolean(opts?.safeForResponsesPreferredModel);
      const url = buildChatCompletionsUrl(config.baseURL);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          ...(safe
            ? {}
            : {
                ...(typeof params?.temperature === 'number'
                  ? { temperature: params.temperature }
                  : {}),
                ...(typeof params?.topP === 'number' ? { top_p: params.topP } : {}),
                ...(typeof params?.presencePenalty === 'number'
                  ? { presence_penalty: params.presencePenalty }
                  : {}),
                ...(typeof params?.frequencyPenalty === 'number'
                  ? { frequency_penalty: params.frequencyPenalty }
                  : {}),
              }),
          ...(typeof params?.maxTokens === 'number'
            ? safe
              ? { max_completion_tokens: params.maxTokens }
              : { max_tokens: params.maxTokens }
            : {}),
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        await this.throwResponseError(response);
      }

      const data = await response.json();
      return {
        content: data.choices?.[0]?.message?.content ?? '',
        tokenUsage: data.usage
          ? {
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
              total: data.usage.total_tokens,
            }
          : undefined,
      } satisfies AIResponse;
    };

    const callResponses = async () => {
      const url = buildResponsesUrl(config.baseURL);
      const normalizedEffort = normalizeReasoningEffortForModel(
        config.model,
        params?.reasoningEffort,
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: messages,
          ...(typeof params?.maxTokens === 'number' ? { max_output_tokens: params.maxTokens } : {}),
          ...(normalizedEffort ? { reasoning: { effort: normalizedEffort } } : {}),
        }),
        signal: options?.signal,
      });

      if (!response.ok) {
        await this.throwResponseError(response);
      }

      const data = (await response.json()) as OpenAIResponsesResponse;
      return {
        content: extractResponsesText(data) || '',
        tokenUsage: mapUsageToTokenUsage(data?.usage),
      } satisfies AIResponse;
    };

    if (preferResponses) {
      try {
        return await callResponses();
      } catch (err) {
        if (isEndpointOrModelUnsupportedForResponses(err)) {
          return await callChatCompletions({ safeForResponsesPreferredModel: true });
        }
        throw err;
      }
    }

    try {
      return await callChatCompletions();
    } catch (err) {
      if (shouldFallbackToResponsesFromChat(err)) {
        return await callResponses();
      }
      throw err;
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig,
    options?: AIRequestOptions,
  ): AsyncGenerator<string> {
    // GPT-5 / o 系列优先走 Responses API，但这里先保证“可用性”：
    // 以非流式 responses 调用兜底，避免 streamChat 因 endpoint/参数不兼容直接失败。
    if (shouldPreferResponses(config.model)) {
      const res = await this.chat(messages, config, options);
      yield res.content;
      return;
    }

    const url = buildChatCompletionsUrl(config.baseURL);
    const params = config.generationParams;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
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
