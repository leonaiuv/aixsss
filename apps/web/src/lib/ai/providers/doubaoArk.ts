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

function normalizeApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  return trimmed.replace(/^Bearer\s+/i, '').trim().replace(/\s+/g, '');
}

function normalizeArkModel(model: string): string {
  const trimmed = (model || '').trim();
  if (!trimmed) return '';
  // 允许用户粘贴「接入点名称 + ID」等复杂文本：优先从中提取 ep-xxxx
  const endpointMatch = trimmed.match(/\bep-[0-9a-zA-Z][0-9a-zA-Z-]*\b/);
  if (endpointMatch?.[0]) return endpointMatch[0];
  // Model ID/Endpoint ID 均不应包含空白
  return trimmed.replace(/\s+/g, '');
}

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
    const hint =
      response.status === 401 || response.status === 403
        ? '\n提示：请确认使用“方舟控制台”生成的 API Key（不是火山引擎 AccessKey/SecretKey），且不要包含 `Bearer ` 前缀或多余空格/换行。'
        : '';
    const err = new Error(
      `Doubao/ARK error (${response.status} ${response.statusText})${suffix}${hint}`,
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
    const apiKey = normalizeApiKey(config.apiKey);
    if (!apiKey) {
      throw new Error('Doubao/ARK API Key 为空：请在「AI 设置」中填写正确的 API Key（无需包含 Bearer 前缀）。');
    }
    const model = normalizeArkModel(config.model);
    if (!model) {
      throw new Error(
        'Doubao/ARK 模型/接入点为空：请在「AI 设置」中填写推理接入点 ID（ep-...）或 Model ID（如 doubao-seed-1-8-251215）。',
      );
    }
    const url = `${normalizeBaseURL(config.baseURL)}/responses`;
    const p = config.generationParams;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: messages,
        ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
        ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
        ...(typeof p?.maxTokens === 'number' ? { max_output_tokens: p.maxTokens } : {}),
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
