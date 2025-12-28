import type {
  ChatMessage,
  ChatResult,
  ImageGenerationResult,
  ProviderChatConfig,
  ProviderImageConfig,
} from './types.js';

type OpenAIErrorResponse = {
  error?: { message?: string };
};

type OpenAIChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

type OpenAIResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  // 一些 OpenAI 兼容实现仍可能用旧字段名
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

type OpenAIImageData = {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
};

type OpenAIImageResponse = {
  data?: OpenAIImageData[];
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

type OpenAICompatibleHttpError = Error & {
  status?: number;
  statusText?: string;
  detail?: string;
};

function normalizeBaseURL(baseURL: string): string {
  let base = (baseURL || '').trim();
  if (!base) base = 'https://api.openai.com';
  base = base.replace(/\/$/, '');
  // 避免用户/预设填写了 /v1 或 /v1beta 导致重复拼接
  base = base.replace(/\/(v1beta|v1)$/, '');
  return base;
}

function buildChatCompletionsUrl(baseURL: string): string {
  const base = normalizeBaseURL(baseURL);
  return `${base}/v1/chat/completions`;
}

function buildResponsesUrl(baseURL: string): string {
  const base = normalizeBaseURL(baseURL);
  return `${base}/v1/responses`;
}

function shouldPreferResponses(model: string): boolean {
  const m = (model || '').toLowerCase().trim();
  if (!m) return false;
  // GPT-5 系列
  if (m.includes('gpt-5')) return true;
  // OpenAI o 系列（常见：o1/o3/o4 等；也可能带前缀如 openai/o1）
  if (/(^|\/)o\d/.test(m)) return true;
  return false;
}

function normalizeReasoningEffortForModel(
  model: string,
  effort: ProviderChatConfig['params'] extends infer P
    ? P extends { reasoningEffort?: infer E }
      ? E
      : undefined
    : undefined,
): string | undefined {
  if (!effort || typeof effort !== 'string') return undefined;
  const m = (model || '').toLowerCase();
  const isGpt52 = m.includes('gpt-5.2') || m.includes('gpt5.2');
  const isGpt5 = (m.includes('gpt-5') || m.includes('gpt5')) && !isGpt52;
  const isO = /(^|\/)o\d/.test(m);

  if (isGpt52) {
    // AiHubMix gpt-5.2: minimal 不支持，自动降级为 none
    if (effort === 'minimal') return 'none';
    return effort;
  }

  if (isGpt5) {
    // GPT-5: xhigh 通常不存在；none 可能不被支持，保守映射为 minimal
    if (effort === 'xhigh') return 'high';
    if (effort === 'none') return 'minimal';
    return effort;
  }

  if (isO) {
    // o 系列：minimal/xhigh/none 可能不兼容，做保守降级
    if (effort === 'minimal') return 'low';
    if (effort === 'xhigh') return 'high';
    if (effort === 'none') return undefined; // 不传，使用供应商默认
    return effort;
  }

  return effort;
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

  if (
    typeof prompt !== 'number' ||
    typeof completion !== 'number' ||
    typeof total !== 'number'
  ) {
    return undefined;
  }

  return { prompt, completion, total };
}

function extractResponsesText(data: OpenAIResponsesResponse): string {
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

function isEndpointOrModelUnsupportedForResponses(err: unknown): boolean {
  const e = err as OpenAICompatibleHttpError | undefined;
  const status = e?.status;
  const detail = (e?.detail || e?.message || '').toLowerCase();

  // 404 常见于端点未实现；部分兼容服务也会用 400 返回 unknown endpoint
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
  const e = err as OpenAICompatibleHttpError | undefined;
  const status = e?.status;
  const detail = (e?.detail || e?.message || '').toLowerCase();

  // chat/completions 对某些模型可能提示必须使用 responses
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

function isResponseFormatUnsupportedError(err: unknown): boolean {
  const e = err as OpenAICompatibleHttpError | undefined;
  const status = e?.status;
  const detail = (e?.detail || e?.message || '').toLowerCase();
  if (status !== 400) return false;
  return detail.includes('response_format') || detail.includes('json_schema') || detail.includes('structured');
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
  const err = new Error(
    `OpenAI-compatible error (${response.status} ${response.statusText})${suffix}`,
  ) as OpenAICompatibleHttpError;
  err.status = response.status;
  err.statusText = response.statusText;
  err.detail = detail;
  throw err;
}

export async function chatOpenAICompatible(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const p = config.params;
  const baseURL = normalizeBaseURL(config.baseURL || 'https://api.openai.com');
  const preferResponses = shouldPreferResponses(config.model);
  const responseFormat = config.responseFormat;
  const normalizedEffort = normalizeReasoningEffortForModel(config.model, p?.reasoningEffort);

  const chatBody = (opts?: { safeForResponsesPreferredModel?: boolean }) => {
    const safe = Boolean(opts?.safeForResponsesPreferredModel);
    return {
      model: config.model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(safe
        ? {}
        : {
            ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
            ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
            ...(typeof p?.presencePenalty === 'number'
              ? { presence_penalty: p.presencePenalty }
              : {}),
            ...(typeof p?.frequencyPenalty === 'number'
              ? { frequency_penalty: p.frequencyPenalty }
              : {}),
          }),
      ...(typeof p?.maxTokens === 'number'
        ? safe
          ? { max_completion_tokens: p.maxTokens }
          : { max_tokens: p.maxTokens }
        : {}),
    } as Record<string, unknown>;
  };

  const responsesBody = (opts?: { omitResponseFormat?: boolean }) => {
    const body: Record<string, unknown> = {
      model: config.model,
      input: messages,
      ...(typeof p?.maxTokens === 'number' ? { max_output_tokens: p.maxTokens } : {}),
      ...(normalizedEffort ? { reasoning: { effort: normalizedEffort } } : {}),
      ...(responseFormat && !opts?.omitResponseFormat ? { response_format: responseFormat } : {}),
    };
    return body;
  };

  const callChatCompletions = async (opts?: { safeForResponsesPreferredModel?: boolean }) => {
    const url = buildChatCompletionsUrl(baseURL);
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(chatBody(opts)),
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
    } satisfies ChatResult;
  };

  const callResponses = async (opts?: { omitResponseFormat?: boolean }) => {
    const url = buildResponsesUrl(baseURL);
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(responsesBody(opts)),
    });
    if (!response.ok) await throwResponseError(response);
    const data = (await response.json()) as OpenAIResponsesResponse;
    return {
      content: extractResponsesText(data) || '',
      tokenUsage: mapUsageToTokenUsage(data?.usage),
    } satisfies ChatResult;
  };

  if (preferResponses) {
    try {
      return await callResponses();
    } catch (err) {
      if (isResponseFormatUnsupportedError(err) && responseFormat) {
        // 兼容：上游不支持 structured outputs 时回退为普通输出（仍可由后续 parse/fix 处理）
        return await callResponses({ omitResponseFormat: true });
      }
      if (isEndpointOrModelUnsupportedForResponses(err)) {
        return await callChatCompletions({ safeForResponsesPreferredModel: true });
      }
      throw err;
    }
  }

  try {
    return await callChatCompletions();
  } catch (err) {
    if (isResponseFormatUnsupportedError(err) && responseFormat) {
      // chat/completions 不支持 response_format：回退重试一次（不带 schema）
      const cfgNoFormat = { ...config, responseFormat: undefined };
      return await chatOpenAICompatible(cfgNoFormat, messages);
    }
    if (shouldFallbackToResponsesFromChat(err)) {
      return await callResponses();
    }
    throw err;
  }
}

export async function generateImagesOpenAICompatible(
  config: ProviderImageConfig,
  prompt: string,
): Promise<ImageGenerationResult> {
  const baseURL = normalizeBaseURL(config.baseURL || 'https://api.openai.com');
  const url = `${baseURL}/v1/images/generations`;
  const model = config.model || 'gpt-image-1';
  const params = config.params;
  const body = {
    model,
    prompt,
    n: params?.n ?? 1,
    ...(params?.size ? { size: params.size } : {}),
    ...(params?.quality ? { quality: params.quality } : {}),
    ...(params?.style ? { style: params.style } : {}),
    ...(typeof params?.seed === 'number' ? { seed: params.seed } : {}),
    response_format: 'url',
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  const data = (await response.json()) as OpenAIImageResponse;
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

