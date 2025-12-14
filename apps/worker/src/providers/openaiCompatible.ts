import type { ChatMessage, ChatResult, ProviderChatConfig } from './types.js';

type OpenAIErrorResponse = {
  error?: { message?: string };
};

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function getRequestTimeoutMs(): number {
  const raw = process.env.AI_REQUEST_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 120_000;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = getRequestTimeoutMs();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    if (isAbort) {
      throw new Error(`上游请求超时（>${timeoutMs}ms）。请检查网络/VPN/供应商可用性，或提高 AI_REQUEST_TIMEOUT_MS。`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function buildUrl(baseURL: string): string {
  const base = baseURL.replace(/\/$/, '');
  return `${base}/v1/chat/completions`;
}

async function throwResponseError(response: Response): Promise<never> {
  let detail = '';
  try {
    const data = (await response.json()) as OpenAIErrorResponse;
    detail = data?.error?.message || JSON.stringify(data);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }
  const suffix = detail ? ` - ${detail}` : '';
  throw new Error(`OpenAI-compatible error (${response.status} ${response.statusText})${suffix}`);
}

export async function chatOpenAICompatible(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const url = buildUrl(config.baseURL || 'https://api.openai.com');
  const p = config.params;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
    ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
    ...(typeof p?.maxTokens === 'number' ? { max_tokens: p.maxTokens } : {}),
    ...(typeof p?.presencePenalty === 'number' ? { presence_penalty: p.presencePenalty } : {}),
    ...(typeof p?.frequencyPenalty === 'number' ? { frequency_penalty: p.frequencyPenalty } : {}),
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) await throwResponseError(response);
  const data = (await response.json()) as OpenAIChatResponse;

  return {
    content: data?.choices?.[0]?.message?.content || '',
    tokenUsage: data?.usage
      ? {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        }
      : undefined,
  };
}


