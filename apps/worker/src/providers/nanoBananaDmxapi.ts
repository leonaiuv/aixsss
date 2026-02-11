import type { ImageGenerationResult, ProviderImageConfig } from './types.js';

type NanoBananaErrorResponse = {
  error?: { message?: string };
  message?: string;
};

type NanoBananaInlineData = {
  mimeType?: string;
  data?: string;
};

type NanoBananaFileData = {
  fileUri?: string;
};

type NanoBananaPart = {
  inlineData?: NanoBananaInlineData;
  text?: string;
  fileData?: NanoBananaFileData;
  thoughtSignature?: string;
};

type NanoBananaResponse = {
  candidates?: Array<{
    content?: {
      parts?: NanoBananaPart[];
    };
  }>;
};

type NanoBananaHttpError = Error & {
  status?: number;
  statusText?: string;
  detail?: string;
};

type AuthMode = 'x-goog-api-key' | 'authorization' | 'authorization-bearer';

function normalizeApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  return trimmed.replace(/^Bearer\s+/i, '').trim().replace(/\s+/g, '');
}

function normalizeBaseURL(baseURL?: string): string {
  const raw = (baseURL || '').trim();
  if (!raw) return 'https://www.dmxapi.cn';
  return raw.replace(/\/+$/, '');
}

function normalizeModel(model?: string): string {
  const raw = (model || '').trim();
  if (!raw) return 'gemini-3-pro-image-preview';
  return raw;
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    clearTimeout(timer);
  }
}

function normalizeImageSize(size?: string): string | undefined {
  const raw = (size || '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === '1K' || raw === '2K' || raw === '4K') return raw;
  if (/^1024([X*]1024)?$/.test(raw)) return '1K';
  if (/^2048([X*]2048)?$/.test(raw)) return '2K';
  if (/^4096([X*]4096)?$/.test(raw)) return '4K';
  return undefined;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function normalizeAspectRatio(size?: string): string | undefined {
  const raw = (size || '').trim();
  if (!raw) return undefined;
  const ratioMatch = raw.match(/^(\d+)\s*:\s*(\d+)$/);
  if (ratioMatch) return `${ratioMatch[1]}:${ratioMatch[2]}`;
  const wh = raw.match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  if (!wh) return undefined;
  const width = Number(wh[1]);
  const height = Number(wh[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const d = gcd(width, height);
  return `${Math.floor(width / d)}:${Math.floor(height / d)}`;
}

function buildUrl(baseURL: string, model: string): string {
  return `${baseURL}/v1beta/models/${model}:generateContent`;
}

function buildHeaders(authMode: AuthMode, apiKey: string): Record<string, string> {
  if (authMode === 'x-goog-api-key') {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }
  if (authMode === 'authorization') {
    return {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    };
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as NanoBananaErrorResponse;
    return data?.error?.message || data?.message || JSON.stringify(data);
  } catch {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }
}

function throwResponseError(status: number, statusText: string, detail: string): never {
  const suffix = detail ? ` - ${detail}` : '';
  const hint =
    status === 401 || status === 403
      ? '\n提示：DMXAPI 优先使用 `x-goog-api-key`，若仍失败请检查 key 是否有效，或改用 Authorization 头。'
      : '';
  const err = new Error(`NanoBanana/DMXAPI error (${status} ${statusText})${suffix}${hint}`) as NanoBananaHttpError;
  err.status = status;
  err.statusText = statusText;
  err.detail = detail;
  throw err;
}

function extractDataUriFromText(text: string): string | null {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;
  const m = trimmed.match(/(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/);
  return m?.[1] ?? null;
}

function extractImageUrls(data: NanoBananaResponse): string[] {
  const urls: string[] = [];
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData;
      if (inlineData?.data) {
        const mimeType = inlineData.mimeType || 'image/png';
        urls.push(`data:${mimeType};base64,${inlineData.data}`);
        continue;
      }

      if (typeof part?.text === 'string') {
        const dataUri = extractDataUriFromText(part.text);
        if (dataUri) {
          urls.push(dataUri);
          continue;
        }
      }

      const fileUri = part?.fileData?.fileUri;
      if (typeof fileUri === 'string' && fileUri.trim()) {
        urls.push(fileUri.trim());
      }
    }
  }
  return urls;
}

export async function generateImagesNanoBananaDmxapi(
  config: ProviderImageConfig,
  prompt: string,
): Promise<ImageGenerationResult> {
  const apiKey = normalizeApiKey(config.apiKey);
  if (!apiKey) throw new Error('NanoBanana/DMXAPI API Key 为空：请在 AI 设置中填写正确的 API Key。');

  const baseURL = normalizeBaseURL(config.baseURL);
  const model = normalizeModel(config.model);
  const url = buildUrl(baseURL, model);

  const imageSize = normalizeImageSize(config.params?.size);
  const aspectRatio = normalizeAspectRatio(config.params?.size);
  const imageConfig: Record<string, unknown> = {
    ...(imageSize ? { imageSize } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
  };

  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    },
  };

  const authModes: AuthMode[] = ['x-goog-api-key', 'authorization', 'authorization-bearer'];
  let lastStatus = 500;
  let lastStatusText = 'Request Failed';
  let lastDetail = '';

  for (let i = 0; i < authModes.length; i += 1) {
    const authMode = authModes[i];
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: buildHeaders(authMode, apiKey),
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = (await response.json()) as NanoBananaResponse;
      const urls = extractImageUrls(data);
      if (!urls.length) {
        throw new Error('NanoBanana/DMXAPI 返回中未找到图片数据（支持 inlineData / text data URI / fileUri）。');
      }
      return {
        images: urls.map((u) => ({ url: u })),
      };
    }

    lastStatus = response.status;
    lastStatusText = response.statusText;
    lastDetail = await readErrorDetail(response);

    const authFailed = response.status === 401 || response.status === 403;
    const hasNext = i < authModes.length - 1;
    if (!(authFailed && hasNext)) {
      throwResponseError(lastStatus, lastStatusText, lastDetail);
    }
  }

  throwResponseError(lastStatus, lastStatusText, lastDetail);
}
