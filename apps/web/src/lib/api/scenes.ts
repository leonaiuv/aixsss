import type { Scene } from '@/types';
import { apiRequest } from './http';

export type ApiScene = Scene & { createdAt?: string; updatedAt?: string };

export async function apiListScenes(projectId: string) {
  return apiRequest<ApiScene[]>(`/projects/${encodeURIComponent(projectId)}/scenes`, {
    method: 'GET',
  });
}

export async function apiCreateScene(
  projectId: string,
  input: Partial<ApiScene> & Pick<Scene, 'order'>,
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
  return apiRequest<ApiScene>(`/projects/${encodeURIComponent(projectId)}/scenes`, {
    method: 'POST',
    body,
  });
}

export async function apiUpdateScene(
  projectId: string,
  sceneId: string,
  updates: Partial<ApiScene>,
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
  return apiRequest<ApiScene>(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
    { method: 'PATCH', body },
  );
}

export async function apiDeleteScene(projectId: string, sceneId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`,
    { method: 'DELETE' },
  );
}

export async function apiReorderScenes(projectId: string, sceneIds: string[]) {
  return apiRequest<ApiScene[]>(`/projects/${encodeURIComponent(projectId)}/scenes/reorder`, {
    method: 'POST',
    body: { sceneIds },
  });
}
