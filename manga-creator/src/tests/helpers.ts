/**
 * 测试辅助工具函数库
 * 提供通用的测试数据生成、mock设置等工具
 */

import { Project, Scene, Character, UserConfig, WorldViewElement, ArtStyleConfig } from '@/types';
import { vi } from 'vitest';

// ==========================================
// 测试数据生成工厂
// ==========================================

/**
 * 生成测试项目数据
 */
export function createMockProject(overrides?: Partial<Project>): Project {
  const now = new Date().toISOString();
  const defaultArtStyleConfig: ArtStyleConfig = {
    presetId: 'anime_cel',
    baseStyle: 'anime style, cel shaded, clean lineart',
    technique: 'flat color blocking, sharp outlines, gradient shading',
    colorPalette: 'vibrant saturated colors, high contrast shadows',
    culturalFeature: 'Japanese animation aesthetics, expressive eyes',
    fullPrompt: 'anime style, cel shaded, clean lineart, flat color blocking, sharp outlines, gradient shading, vibrant saturated colors, high contrast shadows, Japanese animation aesthetics, expressive eyes',
  };

  return {
    id: `test-project-${Math.random().toString(36).substring(7)}`,
    title: '测试项目',
    summary: '这是一个测试项目的故事简介',
    style: 'anime',
    artStyleConfig: defaultArtStyleConfig,
    protagonist: '主角是一个勇敢的少年',
    workflowState: 'IDLE',
    currentSceneOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * 生成测试分镜数据
 */
export function createMockScene(overrides?: Partial<Scene>): Scene {
  return {
    id: `test-scene-${Math.random().toString(36).substring(7)}`,
    projectId: 'test-project-1',
    order: 1,
    summary: '测试分镜摘要',
    sceneDescription: '场景锚点:教室内景，靠窗一侧，下午自然光',
    actionDescription: '动作描述:主角站起来',
    shotPrompt: '关键帧提示词（KF0/KF1/KF2）:anime style, classroom, student standing',
    motionPrompt: '时空/运动提示词:camera pans from left to right',
    status: 'pending',
    notes: '',
    ...overrides,
  };
}

/**
 * 生成测试角色数据
 */
export function createMockCharacter(overrides?: Partial<Character>): Character {
  const now = new Date().toISOString();
  return {
    id: `test-character-${Math.random().toString(36).substring(7)}`,
    projectId: 'test-project-1',
    name: '测试角色',
    briefDescription: '一个勇敢的少年',
    appearance: '黑色短发,身穿校服,眼神坚定',
    personality: '勇敢、正义、善良',
    background: '普通高中生',
    relationships: [],
    appearances: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * 生成测试世界观要素数据
 */
export function createMockWorldViewElement(overrides?: Partial<WorldViewElement>): WorldViewElement {
  const now = new Date().toISOString();
  return {
    id: `test-worldview-${Math.random().toString(36).substring(7)}`,
    projectId: 'test-project-1',
    type: 'era',
    title: '测试时代背景',
    content: '这是一个和平的时代',
    order: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * 生成测试用户配置
 */
export function createMockUserConfig(overrides?: Partial<UserConfig>): UserConfig {
  return {
    provider: 'deepseek',
    apiKey: 'test-api-key-12345678',
    model: 'deepseek-chat',
    ...overrides,
  };
}

// ==========================================
// Store辅助函数
// ==========================================

/**
 * 重置所有store到初始状态
 */
export async function resetAllStores() {
  // 清空localStorage
  localStorage.clear();
  
  // 动态导入所有store并重置
  const { useProjectStore } = await import('@/stores/projectStore');
  const { useStoryboardStore } = await import('@/stores/storyboardStore');
  const { useConfigStore } = await import('@/stores/configStore');
  const { useCharacterStore } = await import('@/stores/characterStore');
  const { useWorldViewStore } = await import('@/stores/worldViewStore');
  const { useThemeStore } = await import('@/stores/themeStore');
  const { useTemplateStore } = await import('@/stores/templateStore');
  const { useVersionStore } = await import('@/stores/versionStore');
  const { useSearchStore } = await import('@/stores/searchStore');
  const { useStatisticsStore } = await import('@/stores/statisticsStore');
  const { useAIProgressStore } = await import('@/stores/aiProgressStore');

  // 重置每个store的状态
  useProjectStore.setState({ projects: [], currentProject: null, isLoading: false });
  useStoryboardStore.setState({ scenes: [], currentSceneId: null, isGenerating: false });
  useConfigStore.setState({ config: null, isConfigured: false });
  useCharacterStore.setState({ characters: [], currentCharacterId: null, isLoading: false });
  useWorldViewStore.setState({ elements: [], currentElementId: null, isLoading: false });
  useThemeStore.setState({ mode: 'system' });
  useTemplateStore.setState({ templates: [], currentTemplateId: null });
  useVersionStore.setState({ versions: [], maxVersions: 50 });
  useSearchStore.setState({ query: '', filters: { query: '' }, results: { projects: [], scenes: [] }, isSearching: false, searchHistory: [] });
  useStatisticsStore.setState({ statistics: null, dateRange: { start: '', end: '' } });
  useAIProgressStore.setState({ 
    tasks: [], 
    activeTaskId: null, 
    stats: { total: 0, success: 0, error: 0, running: 0 },
    listeners: new Map()
  });
}

/**
 * 初始化store并填充测试数据
 */
export async function setupStoreWithData(data: {
  projects?: Project[];
  scenes?: Record<string, Scene[]>;
  characters?: Character[];
  worldView?: WorldViewElement[];
  config?: UserConfig;
}) {
  await resetAllStores();

  if (data.projects) {
    const { useProjectStore } = await import('@/stores/projectStore');
    useProjectStore.setState({ projects: data.projects });
  }

  if (data.scenes) {
    const { useStoryboardStore } = await import('@/stores/storyboardStore');
    const projectId = Object.keys(data.scenes)[0];
    if (projectId) {
      useStoryboardStore.setState({ scenes: data.scenes[projectId] });
    }
  }

  if (data.characters) {
    const { useCharacterStore } = await import('@/stores/characterStore');
    useCharacterStore.setState({ characters: data.characters });
  }

  if (data.worldView) {
    const { useWorldViewStore } = await import('@/stores/worldViewStore');
    useWorldViewStore.setState({ elements: data.worldView });
  }

  if (data.config) {
    const { useConfigStore } = await import('@/stores/configStore');
    useConfigStore.setState({ config: data.config, isConfigured: true });
  }
}

// ==========================================
// 异步辅助函数
// ==========================================

/**
 * 等待异步状态更新完成
 */
export function waitForAsyncUpdate(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待条件满足
 */
export async function waitFor(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 1000, interval = 50 } = options;
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout');
    }
    await waitForAsyncUpdate(interval);
  }
}

// ==========================================
// Mock辅助函数
// ==========================================

/**
 * 模拟AI响应
 */
export function mockAIResponse(content: string, tokenUsage?: { prompt: number; completion: number; total: number }) {
  return {
    content,
    tokenUsage: tokenUsage || {
      prompt: 100,
      completion: 200,
      total: 300,
    },
  };
}

/**
 * 模拟fetch成功响应
 */
export function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  } as Response);
}

/**
 * 模拟fetch失败响应
 */
export function mockFetchError(status: number, message: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: { message } }),
  } as Response);
}

/**
 * 模拟localStorage QuotaExceededError
 */
export function mockLocalStorageQuotaExceeded() {
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = vi.fn(() => {
    const error = new Error('QuotaExceededError');
    error.name = 'QuotaExceededError';
    throw error;
  });
  return () => {
    Storage.prototype.setItem = originalSetItem;
  };
}

/**
 * 模拟performance.now
 */
export function mockPerformanceNow() {
  let currentTime = 0;
  const original = performance.now;
  performance.now = vi.fn(() => currentTime);
  return {
    advance: (ms: number) => { currentTime += ms; },
    restore: () => { performance.now = original; },
  };
}

// ==========================================
// 批量数据生成
// ==========================================

/**
 * 批量生成项目
 */
export function createMockProjects(count: number): Project[] {
  return Array.from({ length: count }, (_, i) => 
    createMockProject({ 
      id: `project-${i}`,
      title: `项目${i}`,
      order: i,
    } as Partial<Project>)
  );
}

/**
 * 批量生成分镜
 */
export function createMockScenes(count: number, projectId: string): Scene[] {
  return Array.from({ length: count }, (_, i) => 
    createMockScene({ 
      id: `scene-${i}`,
      projectId,
      order: i + 1,
      summary: `分镜${i + 1}`,
    })
  );
}

/**
 * 批量生成角色
 */
export function createMockCharacters(count: number, projectId: string): Character[] {
  return Array.from({ length: count }, (_, i) => 
    createMockCharacter({ 
      id: `character-${i}`,
      projectId,
      name: `角色${i}`,
    })
  );
}
