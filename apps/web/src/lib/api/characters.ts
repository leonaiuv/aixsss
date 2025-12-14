import type { Character } from '@/types';
import { apiRequest } from './http';

export type ApiCharacter = Character & { createdAt?: string; updatedAt?: string };

export async function apiListCharacters(projectId: string) {
  return apiRequest<ApiCharacter[]>(`/projects/${encodeURIComponent(projectId)}/characters`, { method: 'GET' });
}

export async function apiCreateCharacter(projectId: string, input: Partial<ApiCharacter> & Pick<Character, 'name'>) {
  const body: Record<string, unknown> = {
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    name: input.name,
    ...(typeof input.briefDescription === 'string' ? { briefDescription: input.briefDescription } : {}),
    ...(typeof input.avatar === 'string' ? { avatar: input.avatar } : {}),
    ...(typeof input.appearance === 'string' ? { appearance: input.appearance } : {}),
    ...(typeof input.personality === 'string' ? { personality: input.personality } : {}),
    ...(typeof input.background === 'string' ? { background: input.background } : {}),
    ...(input.portraitPrompts !== undefined ? { portraitPrompts: input.portraitPrompts } : {}),
    ...(typeof input.customStyle === 'string' ? { customStyle: input.customStyle } : {}),
    ...(input.relationships !== undefined ? { relationships: input.relationships } : {}),
    ...(input.appearances !== undefined ? { appearances: input.appearances } : {}),
    ...(typeof input.themeColor === 'string' ? { themeColor: input.themeColor } : {}),
    ...(typeof input.primaryColor === 'string' ? { primaryColor: input.primaryColor } : {}),
    ...(typeof input.secondaryColor === 'string' ? { secondaryColor: input.secondaryColor } : {}),
  };
  return apiRequest<ApiCharacter>(`/projects/${encodeURIComponent(projectId)}/characters`, { method: 'POST', body });
}

export async function apiUpdateCharacter(projectId: string, characterId: string, updates: Partial<ApiCharacter>) {
  const body: Record<string, unknown> = {
    ...(typeof updates.name === 'string' ? { name: updates.name } : {}),
    ...(typeof updates.briefDescription === 'string' ? { briefDescription: updates.briefDescription } : {}),
    ...(typeof updates.avatar === 'string' ? { avatar: updates.avatar } : {}),
    ...(typeof updates.appearance === 'string' ? { appearance: updates.appearance } : {}),
    ...(typeof updates.personality === 'string' ? { personality: updates.personality } : {}),
    ...(typeof updates.background === 'string' ? { background: updates.background } : {}),
    ...(updates.portraitPrompts !== undefined ? { portraitPrompts: updates.portraitPrompts } : {}),
    ...(typeof updates.customStyle === 'string' ? { customStyle: updates.customStyle } : {}),
    ...(updates.relationships !== undefined ? { relationships: updates.relationships } : {}),
    ...(updates.appearances !== undefined ? { appearances: updates.appearances } : {}),
    ...(typeof updates.themeColor === 'string' ? { themeColor: updates.themeColor } : {}),
    ...(typeof updates.primaryColor === 'string' ? { primaryColor: updates.primaryColor } : {}),
    ...(typeof updates.secondaryColor === 'string' ? { secondaryColor: updates.secondaryColor } : {}),
  };
  return apiRequest<ApiCharacter>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`,
    { method: 'PATCH', body },
  );
}

export async function apiDeleteCharacter(projectId: string, characterId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`,
    { method: 'DELETE' },
  );
}


