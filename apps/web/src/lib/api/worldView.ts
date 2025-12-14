import type { WorldViewElement } from '@/types';
import { apiRequest } from './http';

export type ApiWorldViewElement = WorldViewElement & { createdAt?: string; updatedAt?: string };

export async function apiListWorldViewElements(projectId: string) {
  return apiRequest<ApiWorldViewElement[]>(
    `/projects/${encodeURIComponent(projectId)}/world-view`,
    { method: 'GET' },
  );
}

export async function apiCreateWorldViewElement(
  projectId: string,
  input: Partial<ApiWorldViewElement> & Pick<WorldViewElement, 'type' | 'title' | 'order'>,
) {
  const body: Record<string, unknown> = {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    type: input.type,
    title: input.title,
    ...(typeof input.content === 'string' ? { content: input.content } : {}),
    order: input.order,
  };
  return apiRequest<ApiWorldViewElement>(`/projects/${encodeURIComponent(projectId)}/world-view`, {
    method: 'POST',
    body,
  });
}

export async function apiUpdateWorldViewElement(
  projectId: string,
  elementId: string,
  updates: Partial<ApiWorldViewElement>,
) {
  const body: Record<string, unknown> = {
    ...(typeof updates.type === 'string' ? { type: updates.type } : {}),
    ...(typeof updates.title === 'string' ? { title: updates.title } : {}),
    ...(typeof updates.content === 'string' ? { content: updates.content } : {}),
    ...(typeof updates.order === 'number' ? { order: updates.order } : {}),
  };
  return apiRequest<ApiWorldViewElement>(
    `/projects/${encodeURIComponent(projectId)}/world-view/${encodeURIComponent(elementId)}`,
    { method: 'PATCH', body },
  );
}

export async function apiDeleteWorldViewElement(projectId: string, elementId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/world-view/${encodeURIComponent(elementId)}`,
    { method: 'DELETE' },
  );
}

export async function apiReorderWorldViewElements(projectId: string, elementIds: string[]) {
  return apiRequest<ApiWorldViewElement[]>(
    `/projects/${encodeURIComponent(projectId)}/world-view/reorder`,
    { method: 'POST', body: { elementIds } },
  );
}
