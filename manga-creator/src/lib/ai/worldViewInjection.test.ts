import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  WorldViewInjectionSettings, 
  DEFAULT_INJECTION_SETTINGS,
  getInjectionSettings,
  saveInjectionSettings,
  shouldInjectAtSceneList,
  shouldInjectAtSceneDescription,
  InjectionTiming,
} from './worldViewInjection';

describe('WorldViewInjection - 世界观注入设置', () => {
  beforeEach(() => {
    // 清理localStorage
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ==========================================
  // 默认设置测试
  // ==========================================
  describe('默认设置', () => {
    it('应该有正确的默认注入设置', () => {
      expect(DEFAULT_INJECTION_SETTINGS).toHaveProperty('injectAtSceneList');
      expect(DEFAULT_INJECTION_SETTINGS).toHaveProperty('injectAtSceneDescription');
      expect(DEFAULT_INJECTION_SETTINGS).toHaveProperty('enabled');
    });

    it('默认应该启用世界观注入', () => {
      expect(DEFAULT_INJECTION_SETTINGS.enabled).toBe(true);
    });

    it('默认应该在分镜列表生成时注入', () => {
      expect(DEFAULT_INJECTION_SETTINGS.injectAtSceneList).toBe(true);
    });

    it('默认应该在场景描述生成时注入', () => {
      expect(DEFAULT_INJECTION_SETTINGS.injectAtSceneDescription).toBe(true);
    });
  });

  // ==========================================
  // 设置持久化测试
  // ==========================================
  describe('设置持久化', () => {
    it('应该能保存注入设置', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: false,
      };
      
      saveInjectionSettings('project-1', settings);
      
      const loaded = getInjectionSettings('project-1');
      expect(loaded.injectAtSceneList).toBe(true);
      expect(loaded.injectAtSceneDescription).toBe(false);
    });

    it('未保存设置时应该返回默认值', () => {
      const settings = getInjectionSettings('unknown-project');
      
      expect(settings).toEqual(DEFAULT_INJECTION_SETTINGS);
    });

    it('应该能更新现有设置', () => {
      saveInjectionSettings('project-1', {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: true,
      });
      
      saveInjectionSettings('project-1', {
        enabled: true,
        injectAtSceneList: false,
        injectAtSceneDescription: true,
      });
      
      const loaded = getInjectionSettings('project-1');
      expect(loaded.injectAtSceneList).toBe(false);
      expect(loaded.injectAtSceneDescription).toBe(true);
    });
  });

  // ==========================================
  // 注入时机判断测试
  // ==========================================
  describe('注入时机判断', () => {
    it('当启用并开启分镜列表注入时，应该在分镜列表生成时注入', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: false,
      };
      
      expect(shouldInjectAtSceneList(settings)).toBe(true);
    });

    it('当禁用时，不应该在任何时机注入', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: false,
        injectAtSceneList: true,
        injectAtSceneDescription: true,
      };
      
      expect(shouldInjectAtSceneList(settings)).toBe(false);
      expect(shouldInjectAtSceneDescription(settings)).toBe(false);
    });

    it('当启用并开启场景描述注入时，应该在场景描述生成时注入', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: true,
        injectAtSceneList: false,
        injectAtSceneDescription: true,
      };
      
      expect(shouldInjectAtSceneDescription(settings)).toBe(true);
    });

    it('可以同时在两个时机注入', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: true,
      };
      
      expect(shouldInjectAtSceneList(settings)).toBe(true);
      expect(shouldInjectAtSceneDescription(settings)).toBe(true);
    });

    it('可以都不在任何时机注入（但仍启用）', () => {
      const settings: WorldViewInjectionSettings = {
        enabled: true,
        injectAtSceneList: false,
        injectAtSceneDescription: false,
      };
      
      expect(shouldInjectAtSceneList(settings)).toBe(false);
      expect(shouldInjectAtSceneDescription(settings)).toBe(false);
    });
  });

  // ==========================================
  // 注入时机枚举测试
  // ==========================================
  describe('注入时机枚举', () => {
    it('应该定义所有支持的注入时机', () => {
      expect(InjectionTiming.SCENE_LIST).toBe('scene_list');
      expect(InjectionTiming.SCENE_DESCRIPTION).toBe('scene_description');
      expect(InjectionTiming.BOTH).toBe('both');
      expect(InjectionTiming.NONE).toBe('none');
    });
  });
});
