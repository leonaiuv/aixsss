import type { Scene } from '@/types';
import { apiRequest } from './http';

export type ApiEpisodeScene = Scene & { createdAt?: string; updatedAt?: string };

export async function apiListEpisodeScenes(projectId: string, episodeId: string) {
  return apiRequest<ApiEpisodeScene[]>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/scenes`,
    { method: 'GET' },
  );
}

export async function apiCreateEpisodeScene(
  projectId: string,
  episodeId: string,
  input: Partial<ApiEpisodeScene> & Pick<Scene, 'order'>,
) {
  const body = {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    order: input.order,
    summary: input.summary ?? '',
    sceneDescription: input.sceneDescription ?? '',
    actionDescription: input.actionDescription ?? '',
    shotPrompt: input.shotPrompt ?? '',
    motionPrompt: input.motionPrompt ?? '',
    dialogues: input.dialogues ?? undefined,
    contextSummary: input.contextSummary ?? undefined,
    status: input.status ?? undefined,
    notes: input.notes ?? '',
  };
  return apiRequest<ApiEpisodeScene>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/scenes`,
    { method: 'POST', body },
  );
}

export async function apiUpdateEpisodeScene(
  projectId: string,
  episodeId: string,
  sceneId: string,
  updates: Partial<ApiEpisodeScene>,
) {
  const body: Record<string, unknown> = {
    ...(typeof updates.order === 'number' ? { order: updates.order } : {}),
    ...(typeof updates.summary === 'string' ? { summary: updates.summary } : {}),
    ...(typeof updates.sceneDescription === 'string'
      ? { sceneDescription: updates.sceneDescription }
      : {}),
    ...(typeof updates.actionDescription === 'string'
      ? { actionDescription: updates.actionDescription }
      : {}),
    ...(typeof updates.shotPrompt === 'string' ? { shotPrompt: updates.shotPrompt } : {}),
    ...(typeof updates.motionPrompt === 'string' ? { motionPrompt: updates.motionPrompt } : {}),
    ...(updates.dialogues !== undefined ? { dialogues: updates.dialogues } : {}),
    ...(updates.contextSummary !== undefined ? { contextSummary: updates.contextSummary } : {}),
    ...(typeof updates.status === 'string' ? { status: updates.status } : {}),
    ...(typeof updates.notes === 'string' ? { notes: updates.notes } : {}),
  };
  return apiRequest<ApiEpisodeScene>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(
      episodeId,
    )}/scenes/${encodeURIComponent(sceneId)}`,
    { method: 'PATCH', body },
  );
}

export async function apiDeleteEpisodeScene(projectId: string, episodeId: string, sceneId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(
      episodeId,
    )}/scenes/${encodeURIComponent(sceneId)}`,
    { method: 'DELETE' },
  );
}

export async function apiReorderEpisodeScenes(projectId: string, episodeId: string, sceneIds: string[]) {
  return apiRequest<ApiEpisodeScene[]>(
    `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/scenes/reorder`,
    { method: 'POST', body: { sceneIds } },
  );
}

