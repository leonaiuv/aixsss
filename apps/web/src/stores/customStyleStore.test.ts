import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCustomStyleStore, getAllAvailableStyles, getStyleConfigById } from './customStyleStore';
import { ART_STYLE_PRESETS } from '@/types';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('customStyleStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useCustomStyleStore.setState({
      customStyles: [],
      isLoaded: false,
    });
    mockLocalStorage.clear();
  });

  describe('loadCustomStyles', () => {
    it('应该从空 localStorage 加载空列表', () => {
      const { loadCustomStyles } = useCustomStyleStore.getState();
      loadCustomStyles();

      const { customStyles, isLoaded } = useCustomStyleStore.getState();
      expect(customStyles).toEqual([]);
      expect(isLoaded).toBe(true);
    });

    it('应该从 localStorage 加载已保存的自定义画风', () => {
      const savedStyles = [
        {
          id: 'custom_123',
          name: '测试画风',
          description: '测试描述',
          config: {
            baseStyle: 'test style',
            technique: 'test technique',
            colorPalette: 'test palette',
            culturalFeature: 'test feature',
            fullPrompt: 'test style, test technique, test palette, test feature',
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify(savedStyles));

      const { loadCustomStyles } = useCustomStyleStore.getState();
      loadCustomStyles();

      const { customStyles } = useCustomStyleStore.getState();
      expect(customStyles).toHaveLength(1);
      expect(customStyles[0].name).toBe('测试画风');
    });
  });

  describe('createCustomStyle', () => {
    it('应该创建新的自定义画风', () => {
      const { createCustomStyle } = useCustomStyleStore.getState();

      const newStyle = createCustomStyle({
        name: '我的画风',
        description: '这是我的自定义画风',
        config: {
          baseStyle: 'custom base',
          technique: 'custom technique',
          colorPalette: 'custom colors',
          culturalFeature: 'custom culture',
          fullPrompt: 'custom base, custom technique, custom colors, custom culture',
        },
      });

      expect(newStyle.id).toMatch(/^custom_/);
      expect(newStyle.name).toBe('我的画风');
      expect(newStyle.createdAt).toBeDefined();

      const { customStyles } = useCustomStyleStore.getState();
      expect(customStyles).toHaveLength(1);
    });

    it('应该自动生成 fullPrompt 如果未提供', () => {
      const { createCustomStyle } = useCustomStyleStore.getState();

      const newStyle = createCustomStyle({
        name: '无提示词画风',
        description: '测试',
        config: {
          baseStyle: 'base',
          technique: 'tech',
          colorPalette: 'colors',
          culturalFeature: 'culture',
          fullPrompt: '',
        },
      });

      expect(newStyle.config.fullPrompt).toBe('base, tech, colors, culture');
    });

    it('应该保存到 localStorage', () => {
      const { createCustomStyle } = useCustomStyleStore.getState();

      createCustomStyle({
        name: '测试',
        description: '测试',
        config: {
          baseStyle: 'test',
          technique: 'test',
          colorPalette: 'test',
          culturalFeature: 'test',
          fullPrompt: 'test',
        },
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('updateCustomStyle', () => {
    it('应该更新自定义画风', () => {
      const { createCustomStyle, updateCustomStyle, getCustomStyleById } =
        useCustomStyleStore.getState();

      const style = createCustomStyle({
        name: '原始名称',
        description: '原始描述',
        config: {
          baseStyle: 'original',
          technique: 'original',
          colorPalette: 'original',
          culturalFeature: 'original',
          fullPrompt: 'original',
        },
      });

      updateCustomStyle(style.id, {
        name: '更新后的名称',
      });

      const updated = getCustomStyleById(style.id);
      expect(updated?.name).toBe('更新后的名称');
      expect(updated?.description).toBe('原始描述'); // 未更新的字段保持不变
    });

    it('更新配置时应该重新生成 fullPrompt', () => {
      const { createCustomStyle, updateCustomStyle, getCustomStyleById } =
        useCustomStyleStore.getState();

      const style = createCustomStyle({
        name: '测试',
        description: '测试',
        config: {
          baseStyle: 'old',
          technique: 'old',
          colorPalette: 'old',
          culturalFeature: 'old',
          fullPrompt: 'old',
        },
      });

      updateCustomStyle(style.id, {
        config: {
          baseStyle: 'new base',
          technique: 'new tech',
          colorPalette: 'new colors',
          culturalFeature: 'new culture',
          fullPrompt: '', // 空值应该触发重新生成
        },
      });

      const updated = getCustomStyleById(style.id);
      expect(updated?.config.fullPrompt).toBe('new base, new tech, new colors, new culture');
    });
  });

  describe('deleteCustomStyle', () => {
    it('应该删除自定义画风', () => {
      const { createCustomStyle, deleteCustomStyle, getCustomStyleById } =
        useCustomStyleStore.getState();

      const style = createCustomStyle({
        name: '将被删除',
        description: '测试',
        config: {
          baseStyle: 'test',
          technique: 'test',
          colorPalette: 'test',
          culturalFeature: 'test',
          fullPrompt: 'test',
        },
      });

      expect(getCustomStyleById(style.id)).not.toBeNull();

      deleteCustomStyle(style.id);

      expect(getCustomStyleById(style.id)).toBeNull();
    });
  });

  describe('getArtStyleConfigById', () => {
    it('应该返回自定义画风的 ArtStyleConfig', () => {
      const { createCustomStyle, getArtStyleConfigById } = useCustomStyleStore.getState();

      const style = createCustomStyle({
        name: '测试',
        description: '测试',
        config: {
          baseStyle: 'custom base',
          technique: 'custom tech',
          colorPalette: 'custom colors',
          culturalFeature: 'custom culture',
          fullPrompt: 'full prompt',
        },
      });

      const config = getArtStyleConfigById(style.id);

      expect(config).not.toBeNull();
      expect(config?.presetId).toBe(style.id);
      expect(config?.baseStyle).toBe('custom base');
      expect(config?.fullPrompt).toBe('full prompt');
    });

    it('对于非自定义ID应该返回null', () => {
      const { getArtStyleConfigById } = useCustomStyleStore.getState();

      const config = getArtStyleConfigById('anime_cel');
      expect(config).toBeNull();
    });
  });

  describe('duplicateCustomStyle', () => {
    it('应该复制自定义画风', () => {
      const { createCustomStyle, duplicateCustomStyle } = useCustomStyleStore.getState();

      const original = createCustomStyle({
        name: '原始画风',
        description: '原始描述',
        config: {
          baseStyle: 'original',
          technique: 'original',
          colorPalette: 'original',
          culturalFeature: 'original',
          fullPrompt: 'original',
        },
      });

      const duplicated = duplicateCustomStyle(original.id);

      expect(duplicated).not.toBeNull();
      expect(duplicated?.id).not.toBe(original.id);
      expect(duplicated?.name).toBe('原始画风 (副本)');
      expect(duplicated?.config.baseStyle).toBe('original');

      const { customStyles: updatedStyles } = useCustomStyleStore.getState();
      expect(updatedStyles).toHaveLength(2);
    });
  });

  describe('createFromConfig', () => {
    it('应该从现有配置创建自定义画风', () => {
      const { createFromConfig } = useCustomStyleStore.getState();

      const style = createFromConfig('从配置创建', '测试描述', {
        baseStyle: 'from config',
        technique: 'from config',
        colorPalette: 'from config',
        culturalFeature: 'from config',
        fullPrompt: '',
      });

      expect(style.name).toBe('从配置创建');
      expect(style.config.fullPrompt).toBe('from config, from config, from config, from config');
    });
  });
});

describe('getAllAvailableStyles', () => {
  beforeEach(() => {
    useCustomStyleStore.setState({
      customStyles: [],
      isLoaded: false,
    });
  });

  it('应该返回所有内置预设', () => {
    const styles = getAllAvailableStyles();

    // 应该包含所有内置预设
    expect(styles.length).toBeGreaterThanOrEqual(ART_STYLE_PRESETS.length);

    // 验证第一个内置预设
    const animeCel = styles.find((s) => s.id === 'anime_cel');
    expect(animeCel).toBeDefined();
    expect(animeCel?.isCustom).toBe(false);
  });

  it('应该包含自定义画风', () => {
    const { createCustomStyle } = useCustomStyleStore.getState();

    createCustomStyle({
      name: '自定义测试',
      description: '测试',
      config: {
        baseStyle: 'test',
        technique: 'test',
        colorPalette: 'test',
        culturalFeature: 'test',
        fullPrompt: 'test',
      },
    });

    const styles = getAllAvailableStyles();

    const customStyle = styles.find((s) => s.label === '自定义测试');
    expect(customStyle).toBeDefined();
    expect(customStyle?.isCustom).toBe(true);
  });
});

describe('getStyleConfigById', () => {
  beforeEach(() => {
    useCustomStyleStore.setState({
      customStyles: [],
      isLoaded: false,
    });
  });

  it('应该获取内置预设配置', () => {
    const config = getStyleConfigById('anime_cel');

    expect(config).not.toBeNull();
    expect(config?.presetId).toBe('anime_cel');
  });

  it('应该获取自定义画风配置', () => {
    const { createCustomStyle } = useCustomStyleStore.getState();

    const style = createCustomStyle({
      name: '自定义',
      description: '测试',
      config: {
        baseStyle: 'custom',
        technique: 'custom',
        colorPalette: 'custom',
        culturalFeature: 'custom',
        fullPrompt: 'custom full',
      },
    });

    const config = getStyleConfigById(style.id);

    expect(config).not.toBeNull();
    expect(config?.presetId).toBe(style.id);
    expect(config?.fullPrompt).toBe('custom full');
  });

  it('对于不存在的ID应该返回null', () => {
    const config = getStyleConfigById('nonexistent_id');
    expect(config).toBeNull();
  });
});
