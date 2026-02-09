import type { CharacterRelationshipRecord } from '@/types';
import { apiRequest } from './http';

export async function apiListCharacterRelationships(projectId: string) {
  return apiRequest<CharacterRelationshipRecord[]>(
    `/projects/${encodeURIComponent(projectId)}/character-relationships`,
    { method: 'GET' },
  );
}

export async function apiCreateCharacterRelationship(
  projectId: string,
  input: {
    fromCharacterId: string;
    toCharacterId: string;
    type: string;
    label?: string;
    description?: string;
    intensity?: number;
    arc?: unknown;
  },
) {
  return apiRequest<CharacterRelationshipRecord>(
    `/projects/${encodeURIComponent(projectId)}/character-relationships`,
    { method: 'POST', body: input },
  );
}

export async function apiUpdateCharacterRelationship(
  projectId: string,
  relationshipId: string,
  updates: Partial<{
    fromCharacterId: string;
    toCharacterId: string;
    type: string;
    label: string;
    description: string;
    intensity: number;
    arc: unknown;
  }>,
) {
  return apiRequest<CharacterRelationshipRecord>(
    `/projects/${encodeURIComponent(projectId)}/character-relationships/${encodeURIComponent(
      relationshipId,
    )}`,
    { method: 'PATCH', body: updates },
  );
}

export async function apiDeleteCharacterRelationship(projectId: string, relationshipId: string) {
  return apiRequest<{ ok: true }>(
    `/projects/${encodeURIComponent(projectId)}/character-relationships/${encodeURIComponent(
      relationshipId,
    )}`,
    { method: 'DELETE' },
  );
}
