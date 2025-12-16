import type { Project } from '@/types';
import { apiRequest } from './http';

export type ApiProject = Project & { teamId?: string; deletedAt?: string | null };

export async function apiListProjects() {
  return apiRequest<ApiProject[]>('/projects', { method: 'GET' });
}

export async function apiGetProject(projectId: string) {
  return apiRequest<ApiProject>(`/projects/${encodeURIComponent(projectId)}`, { method: 'GET' });
}

export async function apiCreateProject(input: Partial<ApiProject> & Pick<Project, 'title'>) {
  const body = {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    title: input.title,
    summary: input.summary ?? '',
    protagonist: input.protagonist ?? '',
    style: input.style ?? '',
    artStyleConfig: input.artStyleConfig ?? undefined,
  };
  return apiRequest<ApiProject>('/projects', { method: 'POST', body });
}

export async function apiUpdateProject(projectId: string, updates: Partial<ApiProject>) {
  const body: Record<string, unknown> = {
    ...(typeof updates.title === 'string' ? { title: updates.title } : {}),
    ...(typeof updates.summary === 'string' ? { summary: updates.summary } : {}),
    ...(typeof updates.protagonist === 'string' ? { protagonist: updates.protagonist } : {}),
    ...(typeof updates.style === 'string' ? { style: updates.style } : {}),
    ...(updates.artStyleConfig !== undefined ? { artStyleConfig: updates.artStyleConfig } : {}),
    ...(updates.contextCache !== undefined ? { contextCache: updates.contextCache } : {}),
    ...(typeof updates.workflowState === 'string' ? { workflowState: updates.workflowState } : {}),
    ...(typeof updates.currentSceneOrder === 'number'
      ? { currentSceneOrder: updates.currentSceneOrder }
      : {}),
    ...(typeof updates.currentSceneStep === 'string'
      ? { currentSceneStep: updates.currentSceneStep }
      : {}),
  };
  return apiRequest<ApiProject>(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body,
  });
}

export async function apiDeleteProject(projectId: string) {
  return apiRequest<{ ok: true }>(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}
