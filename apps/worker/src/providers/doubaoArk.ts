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
  const output = data?.output;
  if (!Array.isArray(output)) return '';

  // 优先只取最终 assistant message 的 output_text，避免误取 reasoning/summary 导致 JSON 解析失败
  const prefer: string[] = [];
  const fallback: string[] = [];

  for (const item of output) {
    const parts = item?.content;
    if (!Array.isArray(parts)) continue;

    const itemType = typeof item?.type === 'string' ? item.type : '';
    const isMessage = !itemType || itemType === 'message';

    for (const part of parts) {
      const text = typeof part?.text === 'string' ? part.text : '';
      if (!text) continue;

      const partType = typeof part?.type === 'string' ? part.type : '';
      const isOutputText = !partType || partType === 'output_text';

      if (isMessage && isOutputText) {
        prefer.push(text);
      } else {
        fallback.push(text);
      }
    }
  }

  if (prefer.length) return prefer.join('');
  return fallback.join('');
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
  const apiKey = normalizeApiKey(config.apiKey);
  if (!apiKey) throw new Error('Doubao/ARK API Key 为空：请在 AI 设置中填写正确的 API Key（无需包含 Bearer 前缀）。');
  const model = normalizeArkModel(config.model);
  if (!model) {
    throw new Error(
      'Doubao/ARK 模型/接入点为空：请在 AI 设置中填写推理接入点 ID（ep-...）或 Model ID（如 doubao-seed-1-8-251215）。',
    );
  }

  const body: Record<string, unknown> = {
    model,
    input: messages,
    ...(typeof p?.temperature === 'number' ? { temperature: p.temperature } : {}),
    ...(typeof p?.topP === 'number' ? { top_p: p.topP } : {}),
    ...(typeof p?.maxTokens === 'number' ? { max_output_tokens: p.maxTokens } : {}),
    ...(responseFormat ? arkTextFormat(responseFormat) : {}),
    // 文档建议：对“必须可解析 JSON”的链路优先关闭思考，提升一致性
    ...(responseFormat ? { thinking: { type: 'disabled' } } : {}),
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
  const apiKey = normalizeApiKey(config.apiKey);
  if (!apiKey) throw new Error('Doubao/ARK API Key 为空：请在 AI 设置中填写正确的 API Key（无需包含 Bearer 前缀）。');
  const model = normalizeArkModel(config.model ?? '') || 'doubao-seedream-4-5-251128';
  const params = config.params;
  const isSeedEdit = model.toLowerCase().includes('seededit');

  const body: Record<string, unknown> = {
    model,
    prompt,
    ...(params?.size ? { size: params.size } : {}),
    ...(isSeedEdit && typeof params?.seed === 'number' ? { seed: params.seed } : {}),
    response_format: 'url',
    // Seedream 默认支持 watermark；这里默认关闭，避免生成内容带水印影响后续 I2V。
    watermark: false,
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
