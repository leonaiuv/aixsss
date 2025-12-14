import type { ChatMessage, ChatResult, ProviderChatConfig } from './types.js';

type GeminiCandidate = { content?: { parts?: Array<{ text?: string }> } };
type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsage;
  error?: { message?: string };
};

function buildUrl(baseURL: string, model: string): string {
  const base = baseURL.replace(/\/$/, '');
  return `${base}/v1beta/models/${model}:generateContent`;
}

function toGeminiContents(messages: ChatMessage[]) {
  const system = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (system) {
    contents.unshift({
      role: 'user',
      parts: [{ text: `System instruction: ${system.content}` }],
    });
  }

  return { contents };
}

async function throwResponseError(response: Response): Promise<never> {
  let detail = '';
  try {
    const data = (await response.json()) as GeminiResponse;
    detail = data?.error?.message || JSON.stringify(data);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }
  const suffix = detail ? ` - ${detail}` : '';
  throw new Error(`Gemini error (${response.status} ${response.statusText})${suffix}`);
}

export async function chatGemini(config: ProviderChatConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const baseURL = config.baseURL || 'https://generativelanguage.googleapis.com';
  const model = config.model || 'gemini-pro';

  const body: Record<string, unknown> = {
    ...toGeminiContents(messages),
  };

  const p = config.params;
  if (p) {
    body.generationConfig = {
      ...(typeof p.temperature === 'number' ? { temperature: p.temperature } : {}),
      ...(typeof p.topP === 'number' ? { topP: p.topP } : {}),
      ...(typeof p.maxTokens === 'number' ? { maxOutputTokens: p.maxTokens } : {}),
    };
  }

  const response = await fetch(buildUrl(baseURL, model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) await throwResponseError(response);
  const data = (await response.json()) as GeminiResponse;

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata;
  return {
    content,
    tokenUsage: usage
      ? {
          prompt: usage.promptTokenCount ?? 0,
          completion: usage.candidatesTokenCount ?? 0,
          total: usage.totalTokenCount ?? 0,
        }
      : undefined,
  };
}


