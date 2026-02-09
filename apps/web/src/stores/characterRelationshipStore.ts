import { create } from 'zustand';
import type { CharacterRelationshipRecord } from '@/types';
import { isApiMode } from '@/lib/runtime/mode';
import { apiWaitForAIJob } from '@/lib/api/aiJobs';
import {
  apiCreateCharacterRelationship,
  apiDeleteCharacterRelationship,
  apiListCharacterRelationships,
  apiUpdateCharacterRelationship,
} from '@/lib/api/characterRelationships';
import { apiWorkflowGenerateCharacterRelationships } from '@/lib/api/workflow';

interface CharacterRelationshipStore {
  relationships: CharacterRelationshipRecord[];
  isLoading: boolean;
  isGenerating: boolean;
  lastJobId: string | null;
  error: string | null;
  loadRelationships: (projectId: string) => Promise<void>;
  createRelationship: (
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
  ) => Promise<CharacterRelationshipRecord>;
  updateRelationship: (
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
  ) => Promise<CharacterRelationshipRecord>;
  deleteRelationship: (projectId: string, relationshipId: string) => Promise<void>;
  generateRelationships: (input: { projectId: string; aiProfileId: string }) => Promise<void>;
}

export const useCharacterRelationshipStore = create<CharacterRelationshipStore>((set, get) => ({
  relationships: [],
  isLoading: false,
  isGenerating: false,
  lastJobId: null,
  error: null,

  loadRelationships: async (projectId) => {
    if (!isApiMode()) {
      set({ relationships: [], isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const relationships = await apiListCharacterRelationships(projectId);
      set({ relationships, isLoading: false });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set({ isLoading: false, error: detail });
      throw error;
    }
  },

  createRelationship: async (projectId, input) => {
    if (!isApiMode()) {
      throw new Error('角色关系仅在 API 模式可用');
    }
    set({ error: null });
    const created = await apiCreateCharacterRelationship(projectId, input);
    set((state) => ({ relationships: [created, ...state.relationships] }));
    return created;
  },

  updateRelationship: async (projectId, relationshipId, updates) => {
    if (!isApiMode()) {
      throw new Error('角色关系仅在 API 模式可用');
    }
    set({ error: null });
    const updated = await apiUpdateCharacterRelationship(projectId, relationshipId, updates);
    set((state) => ({
      relationships: state.relationships.map((r) => (r.id === relationshipId ? updated : r)),
    }));
    return updated;
  },

  deleteRelationship: async (projectId, relationshipId) => {
    if (!isApiMode()) {
      throw new Error('角色关系仅在 API 模式可用');
    }
    set({ error: null });
    await apiDeleteCharacterRelationship(projectId, relationshipId);
    set((state) => ({
      relationships: state.relationships.filter((r) => r.id !== relationshipId),
    }));
  },

  generateRelationships: async (input) => {
    if (!isApiMode()) {
      throw new Error('角色关系图谱生成仅在 API 模式可用');
    }
    set({ isGenerating: true, error: null, lastJobId: null });
    try {
      const job = await apiWorkflowGenerateCharacterRelationships(input);
      set({ lastJobId: job.id });
      await apiWaitForAIJob(job.id, {
        onProgress: () => undefined,
      });
      await get().loadRelationships(input.projectId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      set({ error: detail });
      throw error;
    } finally {
      set({ isGenerating: false });
    }
  },
}));
