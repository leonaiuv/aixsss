import type { Episode } from '@/types';
import { apiRequest } from './http';

export async function apiListEpisodes(projectId: string) {
  return apiRequest<Episode[]>(`/projects/${encodeURIComponent(projectId)}/episodes`, {
    method: 'GET',
  });
}

export async function apiGetEpisode(projectId: string, episodeId: string) {
  return apiRequest<Episode>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`,
    { method: 'GET' },
  );
}

export async function apiCreateEpisode(
  projectId: string,
  input: Partial<Episode> & Pick<Episode, 'order'>,
) {
  const body = {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    order: input.order,
    title: input.title ?? '',
    summary: input.summary ?? '',
    outline: input.outline ?? undefined,
    coreExpression: input.coreExpression ?? undefined,
    contextCache: input.contextCache ?? undefined,
    workflowState: input.workflowState ?? undefined,
  };
  return apiRequest<Episode>(`/projects/${encodeURIComponent(projectId)}/episodes`, {
    method: 'POST',
    body,
  });
}

export async function apiUpdateEpisode(
  projectId: string,
  episodeId: string,
  updates: Partial<Episode>,
) {
  const body: Record<string, unknown> = {
    ...(typeof updates.order === 'number' ? { order: updates.order } : {}),
    ...(typeof updates.title === 'string' ? { title: updates.title } : {}),
    ...(typeof updates.summary === 'string' ? { summary: updates.summary } : {}),
    ...(updates.outline !== undefined ? { outline: updates.outline } : {}),
    ...(updates.coreExpression !== undefined ? { coreExpression: updates.coreExpression } : {}),
    ...(updates.contextCache !== undefined ? { contextCache: updates.contextCache } : {}),
    ...(typeof updates.workflowState === 'string' ? { workflowState: updates.workflowState } : {}),
  };
  return apiRequest<Episode>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`,
    { method: 'PATCH', body },
  );
}

export async function apiDeleteEpisode(projectId: string, episodeId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`,
    { method: 'DELETE' },
  );
}
