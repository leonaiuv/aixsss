import { create } from 'zustand';
import { Character, PortraitPrompts, type CharacterRelationship, type SceneAppearance } from '@/types';
import { isApiMode } from '@/lib/runtime/mode';
import { apiCreateCharacter, apiDeleteCharacter, apiListCharacters, apiUpdateCharacter } from '@/lib/api/characters';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizePortraitPrompts(value: unknown): PortraitPrompts | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as any;
  const midjourney = safeString(v.midjourney).trim();
  const stableDiffusion = safeString(v.stableDiffusion).trim();
  const general = safeString(v.general).trim();
  if (!midjourney && !stableDiffusion && !general) return undefined;
  return {
    midjourney,
    stableDiffusion,
    general,
  };
}

function normalizeRelationships(value: unknown): CharacterRelationship[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as any) : null))
    .filter(Boolean)
    .map((v) => ({
      targetCharacterId: safeString(v.targetCharacterId),
      relationshipType: safeString(v.relationshipType),
      description: safeString(v.description),
    }))
    .filter((r) => r.targetCharacterId && r.relationshipType);
}

function normalizeAppearances(value: unknown): SceneAppearance[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as any) : null))
    .filter(Boolean)
    .map((v) => ({
      sceneId: safeString(v.sceneId),
      role: (safeString(v.role) as any) || 'supporting',
      notes: safeString(v.notes),
    }))
    .filter((a) => a.sceneId);
}

function normalizeCharacter(raw: unknown, projectId: string): Character {
  const now = new Date().toISOString();
  const v = raw && typeof raw === 'object' ? (raw as any) : ({} as any);

  const id = safeString(v.id) || `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  return {
    id,
    projectId: safeString(v.projectId) || projectId,
    name: safeString(v.name) || '未命名角色',
    briefDescription: safeString(v.briefDescription) || undefined,
    avatar: safeString(v.avatar) || undefined,
    appearance: safeString(v.appearance),
    personality: safeString(v.personality),
    background: safeString(v.background),
    portraitPrompts: normalizePortraitPrompts(v.portraitPrompts),
    customStyle: safeString(v.customStyle) || undefined,
    relationships: normalizeRelationships(v.relationships),
    appearances: normalizeAppearances(v.appearances),
    themeColor: safeString(v.themeColor) || undefined,
    primaryColor: safeString(v.primaryColor) || undefined,
    secondaryColor: safeString(v.secondaryColor) || undefined,
    createdAt: safeString(v.createdAt) || now,
    updatedAt: safeString(v.updatedAt) || now,
  };
}

interface CharacterStore {
  characters: Character[];
  currentCharacterId: string | null;
  isLoading: boolean;
  
  // 操作方法
  loadCharacters: (projectId: string) => void;
  addCharacter: (projectId: string, character: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>) => Character;
  updateCharacter: (projectId: string, characterId: string, updates: Partial<Character>) => void;
  deleteCharacter: (projectId: string, characterId: string) => void;
  setCurrentCharacter: (characterId: string | null) => void;
  recordAppearance: (projectId: string, characterId: string, sceneId: string, role: 'main' | 'supporting' | 'background', notes?: string) => void;
  updatePortraitPrompts: (projectId: string, characterId: string, prompts: PortraitPrompts) => void;
  getCharactersByProject: (projectId: string) => Character[];
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  currentCharacterId: null,
  isLoading: false,
  
  loadCharacters: (projectId: string) => {
    set({ isLoading: true });
    if (isApiMode()) {
      void (async () => {
        try {
          const characters = await apiListCharacters(projectId);
          set({ characters: characters.map((c) => normalizeCharacter(c, projectId)), isLoading: false });
        } catch (error) {
          console.error('Failed to load characters (api):', error);
          set({ isLoading: false });
        }
      })();
      return;
    }

    try {
      const stored = localStorage.getItem(`aixs_characters_${projectId}`);
      const raw = stored ? (JSON.parse(stored) as unknown[]) : [];
      const characters = Array.isArray(raw) ? raw.map((c) => normalizeCharacter(c, projectId)) : [];
      set({ characters, isLoading: false });
    } catch (error) {
      console.error('Failed to load characters:', error);
      set({ isLoading: false });
    }
  },
  
  addCharacter: (projectId: string, characterData) => {
    const now = new Date().toISOString();
    const newCharacter: Character = {
      ...characterData,
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      relationships: characterData.relationships || [],
      appearances: characterData.appearances || [],
      createdAt: now,
      updatedAt: now,
    };
    
    const characters = [...get().characters, newCharacter];
    set({ characters });

    if (!isApiMode()) {
      saveCharacters(projectId, characters);
    } else {
      void (async () => {
        try {
          const saved = await apiCreateCharacter(projectId, newCharacter);
          const normalized = normalizeCharacter(saved, projectId);
          set((state) => ({
            characters: state.characters.map((c) => (c.id === newCharacter.id ? normalized : c)),
          }));
        } catch (error) {
          console.error('Failed to create character (api):', error);
          get().loadCharacters(projectId);
        }
      })();
    }
    
    return newCharacter;
  },
  
  updateCharacter: (projectId: string, characterId: string, updates: Partial<Character>) => {
    const characters = get().characters;
    const updated = characters.map(char =>
      char.id === characterId
        ? { ...char, ...updates, updatedAt: new Date().toISOString() }
        : char
    );
    
    set({ characters: updated });
    if (!isApiMode()) {
      saveCharacters(projectId, updated);
    } else {
      void (async () => {
        try {
          const saved = await apiUpdateCharacter(projectId, characterId, updates);
          const normalized = normalizeCharacter(saved, projectId);
          set((state) => ({
            characters: state.characters.map((c) => (c.id === characterId ? normalized : c)),
          }));
        } catch (error) {
          console.error('Failed to update character (api):', error);
          get().loadCharacters(projectId);
        }
      })();
    }
  },
  
  deleteCharacter: (projectId: string, characterId: string) => {
    const characters = get().characters.filter(char => char.id !== characterId);
    set({ characters });
    if (!isApiMode()) {
      saveCharacters(projectId, characters);
    } else {
      void (async () => {
        try {
          await apiDeleteCharacter(projectId, characterId);
        } catch (error) {
          console.error('Failed to delete character (api):', error);
          get().loadCharacters(projectId);
        }
      })();
    }
  },
  
  setCurrentCharacter: (characterId: string | null) => {
    set({ currentCharacterId: characterId });
  },
  
  recordAppearance: (projectId: string, characterId: string, sceneId: string, role, notes = '') => {
    const characters = get().characters;
    const updated = characters.map(char => {
      if (char.id === characterId) {
        const appearances = [...char.appearances];
        const existingIndex = appearances.findIndex(a => a.sceneId === sceneId);
        
        if (existingIndex >= 0) {
          appearances[existingIndex] = { sceneId, role, notes };
        } else {
          appearances.push({ sceneId, role, notes });
        }
        
        return {
          ...char,
          appearances,
          updatedAt: new Date().toISOString(),
        };
      }
      return char;
    });
    
    set({ characters: updated });
    if (!isApiMode()) {
      saveCharacters(projectId, updated);
    } else {
      const character = updated.find((c) => c.id === characterId);
      void (async () => {
        try {
          const saved = await apiUpdateCharacter(projectId, characterId, { appearances: character?.appearances ?? [] });
          const normalized = normalizeCharacter(saved, projectId);
          set((state) => ({
            characters: state.characters.map((c) => (c.id === characterId ? normalized : c)),
          }));
        } catch (error) {
          console.error('Failed to update character appearances (api):', error);
          get().loadCharacters(projectId);
        }
      })();
    }
  },
  
  updatePortraitPrompts: (projectId: string, characterId: string, prompts: PortraitPrompts) => {
    const characters = get().characters;
    const updated = characters.map(char =>
      char.id === characterId
        ? { ...char, portraitPrompts: prompts, updatedAt: new Date().toISOString() }
        : char
    );
    
    set({ characters: updated });
    if (!isApiMode()) {
      saveCharacters(projectId, updated);
    } else {
      void (async () => {
        try {
          const saved = await apiUpdateCharacter(projectId, characterId, { portraitPrompts: prompts });
          const normalized = normalizeCharacter(saved, projectId);
          set((state) => ({
            characters: state.characters.map((c) => (c.id === characterId ? normalized : c)),
          }));
        } catch (error) {
          console.error('Failed to update character portrait prompts (api):', error);
          get().loadCharacters(projectId);
        }
      })();
    }
  },
  
  getCharactersByProject: (projectId: string) => {
    return get().characters.filter(char => char.projectId === projectId);
  },
}));

function saveCharacters(projectId: string, characters: Character[]) {
  try {
    localStorage.setItem(`aixs_characters_${projectId}`, JSON.stringify(characters));
  } catch (error) {
    console.error('Failed to save characters:', error);
  }
}
