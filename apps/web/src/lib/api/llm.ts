import type { ChatMessage, AIResponse } from '@/types';
import { apiRequest } from './http';

export async function apiLlmChat(input: { aiProfileId: string; messages: ChatMessage[] }) {
  return apiRequest<AIResponse & { jobId?: string }>('/llm/chat', { method: 'POST', body: input });
}



