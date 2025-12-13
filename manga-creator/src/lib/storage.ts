import CryptoJS from 'crypto-js';
import { Project, Scene, UserConfig, type ConfigProfile, type UserConfigState } from '@/types';
import { debounce, BatchQueue } from './performance';
import { ENCRYPTION_CHECK_KEY, KeyManager, KeyPurpose } from './keyManager';

// 当前版本号 - 每次数据结构变化时递增
const STORAGE_VERSION = '1.2.0'; // 升级版本以触发密钥迁移
/** @deprecated 遗留密钥，仅用于向后兼容迁移 */
const LEGACY_ENCRYPTION_KEY = 'aixs-manga-creator-secret-key-2024';
const BACKUP_PREFIX = 'aixs_backup_';

// ==========================================
// 防抖和批量处理配置
// ==========================================

// 项目保存缓存
let pendingProjectSaves = new Map<string, Project>();

// 防抖保存项目 - 300ms 内的多次保存合并为一次
const debouncedSaveProjects = debounce(() => {
  if (pendingProjectSaves.size === 0) return;
  
  try {
    const projects = getProjects();
    const projectsMap = new Map(projects.map(p => [p.id, p]));
    
    // 合并更新
    for (const [id, project] of pendingProjectSaves) {
      projectsMap.set(id, { ...project, updatedAt: new Date().toISOString() });
    }
    
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify([...projectsMap.values()]));
    pendingProjectSaves.clear();
  } catch (error) {
    console.error('Debounced save projects failed:', error);
  }
}, 300);

// 场景保存批量队列
const sceneSaveQueue = new BatchQueue<{ projectId: string; scene: Scene }>(
  (items) => {
    // 按项目分组
    const byProject = new Map<string, Scene[]>();
    for (const { projectId, scene } of items) {
      const scenes = byProject.get(projectId) || [];
      scenes.push(scene);
      byProject.set(projectId, scenes);
    }
    
    // 批量保存
    for (const [projectId, newScenes] of byProject) {
      const existingScenes = getScenes(projectId);
      const sceneMap = new Map(existingScenes.map(s => [s.id, s]));
      
      for (const scene of newScenes) {
        sceneMap.set(scene.id, scene);
      }
      
      saveScenesDirect(projectId, [...sceneMap.values()]);
    }
  },
  200, // 200ms 延迟
  20   // 最多 20 个场景合并
);

// ==========================================
// Scene patch batching (partial updates)
// ==========================================

type ScenePatchItem = {
  projectId: string;
  sceneId: string;
  updates: Partial<Scene>;
};

// Batched scene patch writes (partial updates) to reduce localStorage churn during typing.
const scenePatchQueue = new BatchQueue<ScenePatchItem>(
  (items) => {
    const byProject = new Map<string, ScenePatchItem[]>();
    for (const item of items) {
      const list = byProject.get(item.projectId) || [];
      list.push(item);
      byProject.set(item.projectId, list);
    }

    for (const [projectId, patches] of byProject) {
      try {
        const existingScenes = getScenes(projectId);
        if (existingScenes.length === 0) continue;

        const sceneMap = new Map(existingScenes.map((s) => [s.id, s]));
        const merged = new Map<string, Partial<Scene>>();

        for (const patch of patches) {
          const prev = merged.get(patch.sceneId) || {};
          merged.set(patch.sceneId, { ...prev, ...patch.updates });
        }

        for (const [sceneId, updates] of merged) {
          const current = sceneMap.get(sceneId);
          if (!current) continue;
          sceneMap.set(sceneId, { ...current, ...updates });
        }

        saveScenesDirect(projectId, [...sceneMap.values()]);
      } catch (error) {
        console.error('Batched patch scenes failed:', error);
      }
    }
  },
  250,
  50
);

// ==========================================
// 加密工具
// ==========================================

/**
 * 加密数据
 * @param data 要加密的数据
 * @param purpose 数据用途，不同用途使用不同派生密钥
 */
export function encrypt(data: string, purpose: KeyPurpose = KeyPurpose.CONFIG): string {
  // 如果 KeyManager 已初始化，使用新的密钥管理系统
  if (KeyManager.isInitialized()) {
    return KeyManager.encrypt(data, purpose);
  }
  // 否则使用遗留密钥（向后兼容）
  return CryptoJS.AES.encrypt(data, LEGACY_ENCRYPTION_KEY).toString();
}

/**
 * 解密数据
 * @param encryptedData 加密的数据
 * @param purpose 数据用途
 */
export function decrypt(encryptedData: string, purpose: KeyPurpose = KeyPurpose.CONFIG): string {
  // 检查是否为新格式加密数据
  if (!KeyManager.isLegacyEncrypted(encryptedData)) {
    return KeyManager.decrypt(encryptedData, purpose);
  }
  
  // 遗留格式数据，使用遗留密钥解密
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, LEGACY_ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return '';
  }
}

/**
 * 使用指定密钥解密（用于迁移）
 * @param encryptedData 加密的数据
 * @param key 解密密钥
 */
export function decryptWithKey(encryptedData: string, key: string): string {
  return KeyManager.decryptWithKey(encryptedData, key);
}

/**
 * 获取遗留密钥（仅用于迁移）
 */
export function getLegacyEncryptionKey(): string {
  return LEGACY_ENCRYPTION_KEY;
}

// ==========================================
// 存储键名常量
// ==========================================

const KEYS = {
  VERSION: 'aixs_version',
  PROJECTS: 'aixs_projects',
  CONFIG: 'aixs_config',
  scenesFor: (projectId: string) => `aixs_scenes_${projectId}`,
};

// ==========================================
// 版本迁移系统
// ==========================================

// 迁移函数类型定义
type MigrationFn = () => void;

// 迁移注册表 - 按版本顺序注册迁移函数
const MIGRATIONS: Record<string, MigrationFn> = {
  // 从 1.0.0 迁移到 1.1.0
  '1.0.0_to_1.1.0': () => {
    console.log('执行迁移: 1.0.0 -> 1.1.0');
    
    // 示例：为旧项目添加新字段的默认值
    const projectsData = localStorage.getItem(KEYS.PROJECTS);
    if (projectsData) {
      try {
        const projects = JSON.parse(projectsData) as Project[];
        const migratedProjects = projects.map(project => ({
          ...project,
          // 确保新字段有默认值
          contextCache: project.contextCache || undefined,
          currentSceneStep: project.currentSceneStep || undefined,
        }));
        localStorage.setItem(KEYS.PROJECTS, JSON.stringify(migratedProjects));
      } catch (e) {
        console.error('项目迁移失败:', e);
      }
    }
    
    // 迁移分镜数据
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('aixs_scenes_')) {
        try {
          const scenesData = localStorage.getItem(key);
          if (scenesData) {
            const scenes = JSON.parse(scenesData) as Scene[];
            const migratedScenes = scenes.map(scene => ({
              ...scene,
              // 确保新字段有默认值
              contextSummary: scene.contextSummary || undefined,
            }));
            localStorage.setItem(key, JSON.stringify(migratedScenes));
          }
        } catch (e) {
          console.error(`分镜迁移失败 (${key}):`, e);
        }
      }
    });
  },
  
  // 从 1.1.0 迁移到 1.2.0 - 密钥管理升级
  '1.1.0_to_1.2.0': () => {
    console.log('执行迁移: 1.1.0 -> 1.2.0 (密钥管理升级)');
    
    // 迁移加密的配置数据
    // 注意：如果 KeyManager 未初始化，配置仍然使用遗留密钥
    // 用户设置自定义密码后，需要调用 migrateConfigToNewKey 进行迁移
    const configData = localStorage.getItem(KEYS.CONFIG);
    if (configData) {
      // 标记配置需要迁移（使用遗留密钥加密）
      localStorage.setItem('aixs_config_needs_migration', 'true');
      console.log('配置数据已标记为需要迁移');
    }
  },
};

// 版本比较函数
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

// 获取版本之间需要执行的迁移列表
function getMigrationPath(fromVersion: string, toVersion: string): string[] {
  const allVersions = ['0.0.0', '1.0.0', '1.1.0', '1.2.0']; // 所有版本列表
  const path: string[] = [];
  
  for (let i = 0; i < allVersions.length - 1; i++) {
    const from = allVersions[i];
    const to = allVersions[i + 1];
    
    // 如果当前版本在迁移路径中
    if (compareVersions(from, fromVersion) >= 0 && compareVersions(to, toVersion) <= 0) {
      const migrationKey = `${from}_to_${to}`;
      if (MIGRATIONS[migrationKey]) {
        path.push(migrationKey);
      }
    }
  }
  
  return path;
}

// 创建数据备份
export function createBackup(): string {
  // Ensure any pending batched scene writes are flushed before snapshotting.
  sceneSaveQueue.flush();
  scenePatchQueue.flush();

  const backupId = `${BACKUP_PREFIX}${Date.now()}`;
  const backupData: Record<string, string> = {};
  
  // 备份所有 aixs_ 开头的数据
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('aixs_') && !key.startsWith(BACKUP_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value) {
        backupData[key] = value;
      }
    }
  });
  
  localStorage.setItem(backupId, JSON.stringify(backupData));
  console.log(`数据备份已创建: ${backupId}`);
  return backupId;
}

// 从备份恢复数据
export function restoreFromBackup(backupId: string): boolean {
  try {
    const backupData = localStorage.getItem(backupId);
    if (!backupData) {
      console.error('备份不存在:', backupId);
      return false;
    }
    
    const data = JSON.parse(backupData) as Record<string, string>;
    
    // 清除当前数据
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('aixs_') && !key.startsWith(BACKUP_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    
    // 恢复备份数据
    Object.entries(data).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    
    console.log('数据已从备份恢复:', backupId);
    return true;
  } catch (error) {
    console.error('恢复备份失败:', error);
    return false;
  }
}

// 删除备份
export function deleteBackup(backupId: string): void {
  localStorage.removeItem(backupId);
  console.log('备份已删除:', backupId);
}

// 删除所有备份
export function deleteAllBackups(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(BACKUP_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
  console.log('所有备份已删除');
}

// 获取所有备份列表
export function getBackups(): { id: string; timestamp: number }[] {
  const backups: { id: string; timestamp: number }[] = [];
  const keys = Object.keys(localStorage);
  
  keys.forEach(key => {
    if (key.startsWith(BACKUP_PREFIX)) {
      const timestamp = parseInt(key.replace(BACKUP_PREFIX, ''), 10);
      backups.push({ id: key, timestamp });
    }
  });
  
  return backups.sort((a, b) => b.timestamp - a.timestamp);
}

// 执行迁移
function runMigrations(fromVersion: string, toVersion: string): boolean {
  console.log(`开始迁移: ${fromVersion} -> ${toVersion}`);
  
  // 1. 创建备份
  const backupId = createBackup();
  
  try {
    // 2. 获取迁移路径
    const migrationPath = getMigrationPath(fromVersion, toVersion);
    
    if (migrationPath.length === 0) {
      console.log('无需执行迁移');
      deleteBackup(backupId);
      return true;
    }
    
    // 3. 依次执行迁移
    for (const migrationKey of migrationPath) {
      console.log(`执行迁移步骤: ${migrationKey}`);
      MIGRATIONS[migrationKey]();
    }
    
    // 4. 迁移成功，删除备份
    console.log('迁移成功完成');
    deleteBackup(backupId);
    
    // 5. 清理旧版本的冗余数据
    cleanupDeprecatedData();
    
    return true;
  } catch (error) {
    // 迁移失败，从备份恢复
    console.error('迁移失败，正在恢复备份:', error);
    restoreFromBackup(backupId);
    deleteBackup(backupId);
    return false;
  }
}

// 清理废弃的数据
function cleanupDeprecatedData(): void {
  console.log('清理废弃数据...');
  
  // 获取所有项目ID
  const projects = getProjectsRaw();
  const validProjectIds = new Set(projects.map(p => p.id));
  
  // 删除孤立的分镜数据（项目已删除但分镜还在）
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('aixs_scenes_')) {
      const projectId = key.replace('aixs_scenes_', '');
      if (!validProjectIds.has(projectId)) {
        console.log(`删除孤立分镜数据: ${key}`);
        localStorage.removeItem(key);
      }
    }
  });
  
  // 只保留最近3个备份
  const backups = getBackups();
  if (backups.length > 3) {
    backups.slice(3).forEach(backup => {
      deleteBackup(backup.id);
    });
  }
}

// 内部使用的获取项目函数（避免循环依赖）
function getProjectsRaw(): Project[] {
  try {
    const data = localStorage.getItem(KEYS.PROJECTS);
    if (!data) return [];
    return JSON.parse(data) as Project[];
  } catch {
    return [];
  }
}

// 初始化存储（应用启动时调用）
export function initStorage(): void {
  const storedVersion = localStorage.getItem(KEYS.VERSION) || '0.0.0';
  
  if (storedVersion !== STORAGE_VERSION) {
    const success = runMigrations(storedVersion, STORAGE_VERSION);
    if (success) {
      localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
    } else {
      console.error('迁移失败，保持原版本');
    }
  }
}

// 获取当前存储版本
export function getStorageVersion(): string {
  return localStorage.getItem(KEYS.VERSION) || '0.0.0';
}

// 获取目标版本
export function getTargetVersion(): string {
  return STORAGE_VERSION;
}

// ==========================================
// 项目操作
// ==========================================

export function getProjects(): Project[] {
  try {
    const data = localStorage.getItem(KEYS.PROJECTS);
    if (!data) return [];
    return JSON.parse(data) as Project[];
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
}

export function getProject(projectId: string): Project | null {
  const projects = getProjects();
  return projects.find(p => p.id === projectId) || null;
}

export function saveProject(project: Project): void {
  // 为了测试兼容性，使用立即保存
  saveProjectImmediate(project);
}

// 批量保存项目（使用防抖优化，用于频繁更新项目）
export function saveProjectBatched(project: Project): void {
  pendingProjectSaves.set(project.id, project);
  debouncedSaveProjects();
}

// 立即保存项目（不防抖，用于关键操作）
export function saveProjectImmediate(project: Project): void {
  try {
    const projects = getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    
    if (index >= 0) {
      projects[index] = { ...project, updatedAt: new Date().toISOString() };
    } else {
      projects.push(project);
    }
    
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(projects));
  } catch (error) {
    console.error('Failed to save project:', error);
    throw new Error('项目保存失败');
  }
}

export function deleteProject(projectId: string): void {
  try {
    const projects = getProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    localStorage.setItem(KEYS.PROJECTS, JSON.stringify(filtered));
    
    // 同时删除分镜数据
    localStorage.removeItem(KEYS.scenesFor(projectId));
  } catch (error) {
    console.error('Failed to delete project:', error);
    throw new Error('项目删除失败');
  }
}

// ==========================================
// 分镜操作
// ==========================================

export function getScenes(projectId: string): Scene[] {
  try {
    const data = localStorage.getItem(KEYS.scenesFor(projectId));
    if (!data) return [];
    return JSON.parse(data) as Scene[];
  } catch (error) {
    console.error('Failed to load scenes:', error);
    return [];
  }
}

// 内部直接保存方法（无防抖）
function saveScenesDirect(projectId: string, scenes: Scene[]): void {
  try {
    localStorage.setItem(KEYS.scenesFor(projectId), JSON.stringify(scenes));
  } catch (error) {
    console.error('Failed to save scenes:', error);
    throw new Error('分镜保存失败');
  }
}

// 对外暴露的保存方法
export function saveScenes(projectId: string, scenes: Scene[]): void {
  saveScenesDirect(projectId, scenes);
}

export function getScene(projectId: string, sceneId: string): Scene | null {
  const scenes = getScenes(projectId);
  return scenes.find(s => s.id === sceneId) || null;
}

// 立即保存场景（不使用批量队列，用于测试和关键操作）
export function saveSceneImmediate(projectId: string, scene: Scene): void {
  try {
    const scenes = getScenes(projectId);
    const index = scenes.findIndex(s => s.id === scene.id);
    
    if (index >= 0) {
      scenes[index] = scene;
    } else {
      scenes.push(scene);
    }
    
    saveScenesDirect(projectId, scenes);
  } catch (error) {
    console.error('Failed to save scene:', error);
    throw new Error('分镜保存失败');
  }
}

// 默认保存场景（为了测试兼容性，使用立即保存，在需要批量优化时可切换为队列）
export function saveScene(projectId: string, scene: Scene): void {
  // 为了测试兼容性，使用立即保存
  saveSceneImmediate(projectId, scene);
}

// 批量保存场景（使用队列优化，用于频繁更新场景）
export function saveSceneBatched(projectId: string, scene: Scene): void {
  sceneSaveQueue.add({ projectId, scene });
}

export function saveScenePatchBatched(
  projectId: string,
  sceneId: string,
  updates: Partial<Scene>
): void {
  scenePatchQueue.add({ projectId, sceneId, updates });
}

export function flushScenePatchQueue(): void {
  scenePatchQueue.flush();
}

// ==========================================
// API配置操作
// ==========================================

const CONFIG_STATE_VERSION = 1 as const;

function generateConfigProfileId(): string {
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeUserConfig(value: unknown): UserConfig | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<UserConfig>;
  if (typeof v.provider !== 'string') return null;
  if (typeof v.apiKey !== 'string') return null;
  if (typeof v.model !== 'string') return null;

  return {
    provider: v.provider as UserConfig['provider'],
    apiKey: v.apiKey,
    model: v.model,
    baseURL: typeof v.baseURL === 'string' && v.baseURL.trim() ? v.baseURL : undefined,
    generationParams: v.generationParams,
  };
}

function sanitizeConfigProfile(value: unknown): ConfigProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ConfigProfile>;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (typeof v.name !== 'string' || !v.name) return null;
  const config = sanitizeUserConfig(v.config);
  if (!config) return null;

  const createdAt = typeof v.createdAt === 'string' && v.createdAt ? v.createdAt : new Date().toISOString();
  const updatedAt = typeof v.updatedAt === 'string' && v.updatedAt ? v.updatedAt : createdAt;

  return {
    id: v.id,
    name: v.name,
    config,
    createdAt,
    updatedAt,
    lastTest: v.lastTest,
    pricing: v.pricing,
  };
}

function sanitizeConfigState(value: unknown): UserConfigState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<UserConfigState>;
  if (v.version !== CONFIG_STATE_VERSION) return null;
  if (!Array.isArray(v.profiles)) return null;

  const profiles = v.profiles
    .map((p) => sanitizeConfigProfile(p))
    .filter((p): p is ConfigProfile => Boolean(p));

  if (profiles.length === 0) return null;

  let activeProfileId =
    typeof v.activeProfileId === 'string' && v.activeProfileId ? v.activeProfileId : profiles[0].id;

  if (!profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
  }

  return {
    version: CONFIG_STATE_VERSION,
    activeProfileId,
    profiles,
  };
}

export function getConfigState(): UserConfigState | null {
  try {
    const encrypted = localStorage.getItem(KEYS.CONFIG);
    if (!encrypted) return null;

    const decrypted = decrypt(encrypted);
    if (!decrypted) {
      const isLocked =
        !KeyManager.isLegacyEncrypted(encrypted) &&
        KeyManager.hasCustomPassword() &&
        !KeyManager.isInitialized();

      if (!isLocked) {
        console.error('Failed to decrypt config state');
      }

      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decrypted) as unknown;
    } catch (error) {
      console.error('Failed to parse config state:', error);
      return null;
    }

    const state = sanitizeConfigState(parsed);
    if (state) return state;

    const legacyConfig = sanitizeUserConfig(parsed);
    if (!legacyConfig) return null;

    const now = new Date().toISOString();
    const id = generateConfigProfileId();
    const migrated: UserConfigState = {
      version: CONFIG_STATE_VERSION,
      activeProfileId: id,
      profiles: [
        {
          id,
          name: '默认档案',
          config: legacyConfig,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    try {
      localStorage.setItem(KEYS.CONFIG, encrypt(JSON.stringify(migrated)));
    } catch {
      // 存储失败时不阻断读取
    }

    return migrated;
  } catch {
    return null;
  }
}

export function saveConfigState(state: UserConfigState): void {
  const json = JSON.stringify(state);
  const encrypted = encrypt(json);
  localStorage.setItem(KEYS.CONFIG, encrypted);
}

export function getConfig(): UserConfig | null {
  try {
    const state = getConfigState();
    if (!state) return null;
    const active = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    return active?.config ?? null;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: UserConfig): void {
  try {
    const state = getConfigState();
    const now = new Date().toISOString();

    if (!state) {
      const id = generateConfigProfileId();
      const next: UserConfigState = {
        version: CONFIG_STATE_VERSION,
        activeProfileId: id,
        profiles: [
          {
            id,
            name: '默认档案',
            config,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      saveConfigState(next);
      return;
    }

    const activeProfileId = state.activeProfileId;
    const profiles = state.profiles.map((p) =>
      p.id === activeProfileId ? { ...p, config, updatedAt: now } : p
    );

    saveConfigState({ ...state, profiles });
  } catch (error) {
    console.error('Failed to save config:', error);
    throw new Error('配置保存失败');
  }
}

export function clearConfig(): void {
  localStorage.removeItem(KEYS.CONFIG);
}

// ==========================================
// 数据导出与导入
// ==========================================

export function exportData(): string {
  const data = {
    version: STORAGE_VERSION,
    projects: getProjects(),
    scenes: {} as Record<string, Scene[]>,
    exportedAt: new Date().toISOString(),
  };
  
  // 导出所有项目的分镜
  data.projects.forEach(project => {
    data.scenes[project.id] = getScenes(project.id);
  });
  
  return JSON.stringify(data, null, 2);
}

export function importData(jsonData: string): void {
  try {
    const data = JSON.parse(jsonData);
    
    // 导入项目
    if (data.projects) {
      localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data.projects));
    }
    
    // 导入分镜
    if (data.scenes) {
      Object.entries(data.scenes).forEach(([projectId, scenes]) => {
        localStorage.setItem(KEYS.scenesFor(projectId), JSON.stringify(scenes));
      });
    }
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('数据导入失败');
  }
}

// ==========================================
// 清理与维护
// ==========================================

export function clearAllData(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('aixs_')) {
      localStorage.removeItem(key);
    }
  });
  localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
}

export function getStorageUsage(): { used: number; total: number } {
  let used = 0;
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('aixs_')) {
      used += localStorage.getItem(key)?.length || 0;
    }
  });
  
  // LocalStorage通常限制为5-10MB，这里假设5MB
  const total = 5 * 1024 * 1024;
  return { used, total };
}

// ==========================================
// 密钥迁移功能
// ==========================================

/**
 * 检查配置是否需要迁移到新密钥
 */
export function configNeedsMigration(): boolean {
  return localStorage.getItem('aixs_config_needs_migration') === 'true';
}

/**
 * 将配置迁移到新密钥
 * 应在用户设置自定义密码后调用
 */
export function migrateConfigToNewKey(): boolean {
  if (!KeyManager.isInitialized()) {
    console.error('密钥管理器未初始化，无法迁移配置');
    return false;
  }

  try {
    const encryptedConfig = localStorage.getItem(KEYS.CONFIG);
    if (!encryptedConfig) {
      // 没有配置需要迁移
      localStorage.removeItem('aixs_config_needs_migration');
      return true;
    }

    // 使用遗留密钥解密
    let decryptedConfig: string;
    if (KeyManager.isLegacyEncrypted(encryptedConfig)) {
      const bytes = CryptoJS.AES.decrypt(encryptedConfig, LEGACY_ENCRYPTION_KEY);
      decryptedConfig = bytes.toString(CryptoJS.enc.Utf8);
    } else {
      // 已经是新格式，无需迁移
      localStorage.removeItem('aixs_config_needs_migration');
      return true;
    }

    if (!decryptedConfig) {
      console.error('无法解密配置数据');
      return false;
    }

    // 使用新密钥重新加密
    const newEncrypted = KeyManager.encrypt(decryptedConfig, KeyPurpose.CONFIG);
    localStorage.setItem(KEYS.CONFIG, newEncrypted);
    localStorage.removeItem('aixs_config_needs_migration');

    console.log('配置已成功迁移到新密钥');
    return true;
  } catch (error) {
    console.error('配置迁移失败:', error);
    return false;
  }
}

/**
 * 获取密钥信息
 */
export function getKeyInfo() {
  return KeyManager.getKeyInfo();
}

/**
 * 初始化密钥管理器（设置自定义密码）
 * @param masterPassword 主密码
 */
export function initializeEncryption(masterPassword: string): void {
  KeyManager.initialize(masterPassword);

  // 写入校验标记（用于后续解锁/验证密码）
  try {
    localStorage.setItem(ENCRYPTION_CHECK_KEY, KeyManager.encrypt('ok', KeyPurpose.GENERAL));
  } catch {}
  
  // 如果有待迁移的配置，自动迁移
  if (configNeedsMigration()) {
    migrateConfigToNewKey();
  }
}

/**
 * 更换主密码
 * @param newPassword 新密码
 */
export function changeEncryptionPassword(newPassword: string): boolean {
  if (!KeyManager.isInitialized()) {
    console.error('密钥管理器未初始化');
    return false;
  }

  try {
    const encryptedConfig = localStorage.getItem(KEYS.CONFIG);
    const decryptedConfig = encryptedConfig ? decrypt(encryptedConfig, KeyPurpose.CONFIG) : null;

    if (encryptedConfig && !decryptedConfig) {
      console.error('无法解密当前配置，已取消更换密码');
      return false;
    }

    // 更换密码
    KeyManager.changeMasterPassword(newPassword);

    // 更新校验标记
    try {
      localStorage.setItem(ENCRYPTION_CHECK_KEY, KeyManager.encrypt('ok', KeyPurpose.GENERAL));
    } catch {}
    
    // 重新加密配置（保持原始结构，避免丢失多档案/元数据）
    if (encryptedConfig && decryptedConfig) {
      localStorage.setItem(KEYS.CONFIG, encrypt(decryptedConfig, KeyPurpose.CONFIG));
    }
    
    console.log('密码已成功更换');
    return true;
  } catch (error) {
    console.error('更换密码失败:', error);
    return false;
  }
}

/**
 * 检查是否已设置自定义密码
 */
export function hasCustomEncryptionPassword(): boolean {
  return KeyManager.hasCustomPassword();
}

// 导出 KeyPurpose 以便外部使用
export { KeyPurpose } from './keyManager';
