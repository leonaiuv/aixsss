import { apiRequest } from './http';

export type ApiAIProfile = {
  id: string;
  teamId?: string;
  name: string;
  provider: 'deepseek' | 'kimi' | 'gemini' | 'openai-compatible';
  model: string;
  baseURL: string | null;
  generationParams: unknown | null;
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
  }>,
) {
  return apiRequest<ApiAIProfile>(`/ai-profiles/${encodeURIComponent(profileId)}`, { method: 'PATCH', body: updates });
}

export async function apiDeleteAIProfile(profileId: string) {
  return apiRequest<{ ok: true }>(`/ai-profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
}


