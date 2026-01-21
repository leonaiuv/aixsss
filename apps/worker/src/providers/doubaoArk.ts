import type {
  ChatMessage,
  ChatResult,
  ImageGenerationResult,
  ProviderChatConfig,
  ProviderImageConfig,
  ResponseFormat,
} from './types.js';

type ArkErrorResponse = {
  error?: { message?: string };
  message?: string;
};

type ArkResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
};

type ArkResponsesOutputPart = {
  type?: string;
  text?: string;
};

type ArkResponsesOutputItem = {
  type?: string;
  content?: ArkResponsesOutputPart[];
};

type ArkResponsesResponse = {
  id?: string;
  output_text?: string;
  output?: ArkResponsesOutputItem[];
  usage?: ArkResponsesUsage;
};

type ArkImageData = {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
};

type ArkImageResponse = {
  data?: ArkImageData[];
};

type ArkHttpError = Error & {
  status?: number;
  statusText?: string;
  detail?: string;
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
      err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    if (isAbort) {
      throw new Error(`上游请求超时（>${timeoutMs}ms）。请检查网络/VPN/供应商可用性，或提高 AI_REQUEST_TIMEOUT_MS。`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function normalizeBaseURL(baseURL?: string): string {
  let base = (baseURL || '').trim();
  if (!base) base = 'https://ark.cn-beijing.volces.com/api/v3';
  return base.replace(/\/+$/, '');
}

async function throwResponseError(response: Response): Promise<never> {
  let detail = '';
  try {
    const data = (await response.json()) as ArkErrorResponse;
    detail = data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }

  const suffix = detail ? ` - ${detail}` : '';
  const err = new Error(`Doubao/ARK error (${response.status} ${response.statusText})${suffix}`) as ArkHttpError;
  err.status = response.status;
  err.statusText = response.statusText;
  err.detail = detail;
  throw err;
}

function mapUsageToTokenUsage(usage: unknown): ChatResult['tokenUsage'] | undefined {
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

  if (typeof prompt !== 'number' || typeof completion !== 'number' || typeof total !== 'number') return undefined;
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

function arkTextFormat(responseFormat: ResponseFormat): Record<string, unknown> {
  if (responseFormat.type === 'json_object') {
    return { text: { format: { type: 'json_object' } } };
  }

  // json_schema
  return {
    text: {
      format: {
        type: 'json_schema',
        name: responseFormat.json_schema.name,
        strict: responseFormat.json_schema.strict,
        schema: responseFormat.json_schema.schema,
      },
    },
  };
}

export async function chatDoubaoArk(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const baseURL = normalizeBaseURL(config.baseURL);
  const url = `${baseURL}/responses`;
  const p = config.params;
  const responseFormat = config.responseFormat;

  const body: Record<string, unknown> = {
    model: config.model,
    input: messages,
    ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
    ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
    ...(typeof p?.maxTokens === 'number' ? { max_output_tokens: p.maxTokens } : {}),
    ...(typeof p?.presencePenalty === 'number' && !responseFormat
      ? { presence_penalty: p.presencePenalty }
      : {}),
    ...(typeof p?.frequencyPenalty === 'number' && !responseFormat
      ? { frequency_penalty: p.frequencyPenalty }
      : {}),
    ...(responseFormat ? arkTextFormat(responseFormat) : {}),
    // 文档建议：对“必须可解析 JSON”的链路优先关闭思考，提升一致性
    ...(responseFormat ? { thinking: { type: 'disabled' } } : {}),
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
  const data = (await response.json()) as ArkResponsesResponse;

  return {
    content: extractResponsesText(data) || '',
    tokenUsage: mapUsageToTokenUsage(data?.usage),
  };
}

export async function generateImagesDoubaoArk(
  config: ProviderImageConfig,
  prompt: string,
): Promise<ImageGenerationResult> {
  const baseURL = normalizeBaseURL(config.baseURL);
  const url = `${baseURL}/images/generations`;
  const model = config.model || 'doubao-seedream-4-5-251128';
  const params = config.params;

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: params?.n ?? 1,
    ...(params?.size ? { size: params.size } : {}),
    ...(params?.quality ? { quality: params.quality } : {}),
    ...(params?.style ? { style: params.style } : {}),
    ...(typeof params?.seed === 'number' ? { seed: params.seed } : {}),
    response_format: 'url',
    // Seedream 默认支持 watermark；这里默认关闭，避免生成内容带水印影响后续 I2V。
    watermark: false,
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

  const data = (await response.json()) as ArkImageResponse;
  const images = Array.isArray(data?.data)
    ? data.data
        .map((item) => {
          if (typeof item?.url !== 'string' || !item.url) return null;
          return {
            url: item.url,
            ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
          };
        })
        .filter((item): item is { url: string; revisedPrompt?: string } => item !== null)
    : [];

  return { images };
}

