// ==========================================
// 世界观注入设置模块
// ==========================================
// 功能：
// 1. 定义世界观注入时机设置
// 2. 提供开关控制注入行为
// 3. 支持两种注入时机：分镜列表生成时、场景锚点生成时
// ==========================================

// ==========================================
// 类型定义
// ==========================================

/** 世界观注入设置 */
export interface WorldViewInjectionSettings {
  /** 是否启用世界观注入 */
  enabled: boolean;
  /** 是否在生成分镜列表时注入 */
  injectAtSceneList: boolean;
  /** 是否在生成场景锚点时注入 */
  injectAtSceneDescription: boolean;
}

/** 注入时机枚举 */
export const InjectionTiming = {
  /** 仅在生成分镜列表时注入 */
  SCENE_LIST: 'scene_list' as const,
  /** 仅在生成场景锚点时注入 */
  SCENE_DESCRIPTION: 'scene_description' as const,
  /** 在两个时机都注入 */
  BOTH: 'both' as const,
  /** 不注入 */
  NONE: 'none' as const,
};

export type InjectionTimingType = typeof InjectionTiming[keyof typeof InjectionTiming];

// ==========================================
// 默认设置
// ==========================================

/** 默认注入设置 - 两个时机都启用 */
export const DEFAULT_INJECTION_SETTINGS: WorldViewInjectionSettings = {
  enabled: true,
  injectAtSceneList: true,
  injectAtSceneDescription: true,
};

// ==========================================
// 存储键名
// ==========================================
const STORAGE_KEY_PREFIX = 'aixs_worldview_injection_';

// ==========================================
// 设置持久化
// ==========================================

/**
 * 获取项目的世界观注入设置
 * @param projectId 项目ID
 * @returns 注入设置（如果未保存则返回默认值）
 */
export function getInjectionSettings(projectId: string): WorldViewInjectionSettings {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 合并默认值，确保新增字段有默认值
      return {
        ...DEFAULT_INJECTION_SETTINGS,
        ...parsed,
      };
    }
  } catch (error) {
    console.error('Failed to load injection settings:', error);
  }
  return { ...DEFAULT_INJECTION_SETTINGS };
}

/**
 * 保存项目的世界观注入设置
 * @param projectId 项目ID
 * @param settings 注入设置
 */
export function saveInjectionSettings(
  projectId: string, 
  settings: WorldViewInjectionSettings
): void {
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${projectId}`,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error('Failed to save injection settings:', error);
  }
}

// ==========================================
// 注入时机判断
// ==========================================

/**
 * 判断是否应该在分镜列表生成时注入世界观
 * @param settings 注入设置
 * @returns 是否应该注入
 */
export function shouldInjectAtSceneList(settings: WorldViewInjectionSettings): boolean {
  return settings.enabled && settings.injectAtSceneList;
}

/**
 * 判断是否应该在场景锚点生成时注入世界观
 * @param settings 注入设置
 * @returns 是否应该注入
 */
export function shouldInjectAtSceneDescription(settings: WorldViewInjectionSettings): boolean {
  return settings.enabled && settings.injectAtSceneDescription;
}

/**
 * 根据注入时机枚举创建设置
 * @param timing 注入时机
 * @returns 对应的注入设置
 */
export function createSettingsFromTiming(timing: InjectionTimingType): WorldViewInjectionSettings {
  switch (timing) {
    case InjectionTiming.SCENE_LIST:
      return {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: false,
      };
    case InjectionTiming.SCENE_DESCRIPTION:
      return {
        enabled: true,
        injectAtSceneList: false,
        injectAtSceneDescription: true,
      };
    case InjectionTiming.BOTH:
      return {
        enabled: true,
        injectAtSceneList: true,
        injectAtSceneDescription: true,
      };
    case InjectionTiming.NONE:
      return {
        enabled: false,
        injectAtSceneList: false,
        injectAtSceneDescription: false,
      };
    default:
      return { ...DEFAULT_INJECTION_SETTINGS };
  }
}

/**
 * 根据设置推断注入时机
 * @param settings 注入设置
 * @returns 注入时机枚举值
 */
export function getTimingFromSettings(settings: WorldViewInjectionSettings): InjectionTimingType {
  if (!settings.enabled) {
    return InjectionTiming.NONE;
  }
  
  if (settings.injectAtSceneList && settings.injectAtSceneDescription) {
    return InjectionTiming.BOTH;
  }
  
  if (settings.injectAtSceneList) {
    return InjectionTiming.SCENE_LIST;
  }
  
  if (settings.injectAtSceneDescription) {
    return InjectionTiming.SCENE_DESCRIPTION;
  }
  
  return InjectionTiming.NONE;
}
