import { create } from 'zustand';
import { Character, PortraitPrompts } from '@/types';

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
    try {
      const stored = localStorage.getItem(`aixs_characters_${projectId}`);
      const characters = stored ? JSON.parse(stored) : [];
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
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      relationships: characterData.relationships || [],
      appearances: characterData.appearances || [],
      createdAt: now,
      updatedAt: now,
    };
    
    const characters = [...get().characters, newCharacter];
    set({ characters });
    saveCharacters(projectId, characters);
    
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
    saveCharacters(projectId, updated);
  },
  
  deleteCharacter: (projectId: string, characterId: string) => {
    const characters = get().characters.filter(char => char.id !== characterId);
    set({ characters });
    saveCharacters(projectId, characters);
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
    saveCharacters(projectId, updated);
  },
  
  updatePortraitPrompts: (projectId: string, characterId: string, prompts: PortraitPrompts) => {
    const characters = get().characters;
    const updated = characters.map(char =>
      char.id === characterId
        ? { ...char, portraitPrompts: prompts, updatedAt: new Date().toISOString() }
        : char
    );
    
    set({ characters: updated });
    saveCharacters(projectId, updated);
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
