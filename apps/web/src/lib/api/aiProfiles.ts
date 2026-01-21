import { apiRequest } from './http';

export type ApiAIPricing = {
  currency: 'USD';
  promptPer1K: number;
  completionPer1K: number;
  cachedPromptPer1K?: number;
} | null;

export type ApiAIProfile = {
  id: string;
  teamId?: string;
  name: string;
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai-compatible' | 'doubao-ark';
  model: string;
  baseURL: string | null;
  generationParams: unknown | null;
  pricing: ApiAIPricing;
  createdAt: string;
  updatedAt: string;
};

export async function apiListAIProfiles() {
  return apiRequest<ApiAIProfile[]>('/ai-profiles', { method: 'GET' });
}

export async function apiCreateAIProfile(input: {
  id?: string;
  name: string;
  provider: ApiAIProfile['provider'];
  apiKey: string;
  baseURL?: string;
  model: string;
  generationParams?: unknown;
  pricing?: Exclude<ApiAIPricing, null>;
}) {
  return apiRequest<ApiAIProfile>('/ai-profiles', { method: 'POST', body: input });
}

export async function apiUpdateAIProfile(
  profileId: string,
  updates: Partial<{
    name: string;
    provider: ApiAIProfile['provider'];
    apiKey: string;
    baseURL: string;
    model: string;
    generationParams: unknown | null;
    pricing: ApiAIPricing;
  }>,
) {
  return apiRequest<ApiAIProfile>(`/ai-profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    body: updates,
  });
}

export async function apiDeleteAIProfile(profileId: string) {
  return apiRequest<{ ok: true }>(`/ai-profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
  });
}
