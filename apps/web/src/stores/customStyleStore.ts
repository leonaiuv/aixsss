import { create } from 'zustand';
import {
  CustomArtStyle,
  ArtStyleConfig,
  composeStyleFullPrompt,
  isCustomStyleId,
  ART_STYLE_PRESETS,
  ArtStylePreset,
  getArtStyleConfig as getBuiltInStyleConfig,
} from '@/types';

// LocalStorage 键名
const CUSTOM_STYLES_KEY = 'aixs_custom_styles';

/**
 * 从 LocalStorage 加载自定义画风列表
 */
function loadCustomStyles(): CustomArtStyle[] {
  try {
    const data = localStorage.getItem(CUSTOM_STYLES_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('加载自定义画风失败:', error);
  }
  return [];
}

/**
 * 保存自定义画风列表到 LocalStorage
 */
function saveCustomStyles(styles: CustomArtStyle[]): void {
  try {
    localStorage.setItem(CUSTOM_STYLES_KEY, JSON.stringify(styles));
  } catch (error) {
    console.error('保存自定义画风失败:', error);
  }
}

/**
 * 生成自定义画风ID
 */
function generateCustomStyleId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface CustomStyleStore {
  /** 所有自定义画风列表 */
  customStyles: CustomArtStyle[];
  /** 是否已加载 */
  isLoaded: boolean;

  // 操作方法
  /** 加载自定义画风 */
  loadCustomStyles: () => void;
  /** 创建自定义画风 */
  createCustomStyle: (
    style: Omit<CustomArtStyle, 'id' | 'createdAt' | 'updatedAt'>,
  ) => CustomArtStyle;
  /** 更新自定义画风 */
  updateCustomStyle: (
    id: string,
    updates: Partial<Omit<CustomArtStyle, 'id' | 'createdAt'>>,
  ) => void;
  /** 删除自定义画风 */
  deleteCustomStyle: (id: string) => void;
  /** 根据ID获取自定义画风 */
  getCustomStyleById: (id: string) => CustomArtStyle | null;
  /** 根据ID获取 ArtStyleConfig（用于项目中使用） */
  getArtStyleConfigById: (id: string) => ArtStyleConfig | null;
  /** 从现有配置创建自定义画风 */
  createFromConfig: (
    name: string,
    description: string,
    config: Omit<ArtStyleConfig, 'presetId'>,
  ) => CustomArtStyle;
  /** 复制现有自定义画风 */
  duplicateCustomStyle: (id: string) => CustomArtStyle | null;
}

export const useCustomStyleStore = create<CustomStyleStore>((set, get) => ({
  customStyles: [],
  isLoaded: false,

  loadCustomStyles: () => {
    const styles = loadCustomStyles();
    set({ customStyles: styles, isLoaded: true });
  },

  createCustomStyle: (styleData) => {
    const now = new Date().toISOString();
    const newStyle: CustomArtStyle = {
      ...styleData,
      id: generateCustomStyleId(),
      createdAt: now,
      updatedAt: now,
    };

    // 确保 fullPrompt 存在
    if (!newStyle.config.fullPrompt) {
      newStyle.config.fullPrompt = composeStyleFullPrompt(newStyle.config);
    }

    set((state) => {
      const newStyles = [...state.customStyles, newStyle];
      saveCustomStyles(newStyles);
      return { customStyles: newStyles };
    });

    return newStyle;
  },

  updateCustomStyle: (id, updates) => {
    set((state) => {
      const updatedStyles = state.customStyles.map((style) => {
        if (style.id !== id) return style;

        const updatedStyle: CustomArtStyle = {
          ...style,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // 如果更新了配置，重新生成 fullPrompt
        if (updates.config) {
          updatedStyle.config = {
            ...style.config,
            ...updates.config,
          };
          if (!updates.config.fullPrompt) {
            updatedStyle.config.fullPrompt = composeStyleFullPrompt(updatedStyle.config);
          }
        }

        return updatedStyle;
      });

      saveCustomStyles(updatedStyles);
      return { customStyles: updatedStyles };
    });
  },

  deleteCustomStyle: (id) => {
    set((state) => {
      const filteredStyles = state.customStyles.filter((s) => s.id !== id);
      saveCustomStyles(filteredStyles);
      return { customStyles: filteredStyles };
    });
  },

  getCustomStyleById: (id) => {
    const { customStyles } = get();
    return customStyles.find((s) => s.id === id) || null;
  },

  getArtStyleConfigById: (id) => {
    if (!isCustomStyleId(id)) {
      return null;
    }
    const style = get().getCustomStyleById(id);
    if (!style) return null;

    return {
      presetId: style.id,
      ...style.config,
    };
  },

  createFromConfig: (name, description, config) => {
    const { createCustomStyle } = get();
    return createCustomStyle({
      name,
      description,
      config: {
        ...config,
        fullPrompt: config.fullPrompt || composeStyleFullPrompt(config),
      },
    });
  },

  duplicateCustomStyle: (id) => {
    const style = get().getCustomStyleById(id);
    if (!style) return null;

    const { createCustomStyle } = get();
    return createCustomStyle({
      name: `${style.name} (副本)`,
      description: style.description,
      config: { ...style.config },
    });
  },
}));

/**
 * 获取所有可用画风（内置预设 + 自定义画风）的工具函数
 * 用于在 UI 中展示完整的画风选择列表
 */
export function getAllAvailableStyles(): Array<{
  id: string;
  label: string;
  description: string;
  isCustom: boolean;
  config: Omit<ArtStyleConfig, 'presetId'>;
}> {
  const { customStyles } = useCustomStyleStore.getState();

  // 转换内置预设
  const builtInStyles = ART_STYLE_PRESETS.map((preset: ArtStylePreset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    isCustom: false,
    config: preset.config,
  }));

  // 转换自定义画风
  const customStyleItems = customStyles.map((style) => ({
    id: style.id,
    label: style.name,
    description: style.description,
    isCustom: true,
    config: style.config,
  }));

  return [...builtInStyles, ...customStyleItems];
}

/**
 * 根据画风ID获取ArtStyleConfig（支持内置和自定义）
 */
export function getStyleConfigById(styleId: string): ArtStyleConfig | null {
  if (isCustomStyleId(styleId)) {
    return useCustomStyleStore.getState().getArtStyleConfigById(styleId);
  }

  // 使用内置函数获取
  return getBuiltInStyleConfig(styleId);
}
