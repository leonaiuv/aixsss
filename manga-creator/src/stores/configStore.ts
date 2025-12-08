import { create } from 'zustand';
import { ChatMessage, UserConfig } from '@/types';
import { getConfig, saveConfig as saveConfigStorage, clearConfig } from '@/lib/storage';
import { AIFactory } from '@/lib/ai/factory';

interface ConfigStore {
  config: UserConfig | null;
  isConfigured: boolean;
  
  // 操作方法
  loadConfig: () => void;
  saveConfig: (config: UserConfig) => void;
  clearConfig: () => void;
  testConnection: (config: UserConfig) => Promise<boolean>;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  isConfigured: false,
  
  loadConfig: () => {
    const config = getConfig();
    set({ 
      config, 
      isConfigured: config !== null 
    });
  },
  
  saveConfig: (config: UserConfig) => {
    saveConfigStorage(config);
    set({ 
      config, 
      isConfigured: true 
    });
  },
  
  clearConfig: () => {
    clearConfig();
    set({ 
      config: null, 
      isConfigured: false 
    });
  },
  
  testConnection: async (config: UserConfig): Promise<boolean> => {
    try {
      const client = AIFactory.createClient(config);
      const pingMessage: ChatMessage[] = [{ role: 'user', content: 'ping' }];
      
      const response = await client.chat(pingMessage);
      return Boolean(response?.content);
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  },
}));
