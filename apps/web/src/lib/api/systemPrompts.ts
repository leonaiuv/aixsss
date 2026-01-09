import { apiRequest } from './http';

export type ApiSystemPromptCategory =
  | 'workflow'
  | 'workflow.fix'
  | 'workflow.actionBeats'
  | 'workflow.narrativeCausalChain';

export type ApiSystemPrompt = {
  key: string;
  title: string;
  description: string | null;
  category: ApiSystemPromptCategory | (string & {});
  content: string;
  defaultContent: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function apiListSystemPrompts() {
  return apiRequest<ApiSystemPrompt[]>('/system-prompts', { method: 'GET' });
}

export async function apiUpdateSystemPrompt(key: string, input: { content: string }) {
  return apiRequest<ApiSystemPrompt>(`/system-prompts/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: input,
  });
}

