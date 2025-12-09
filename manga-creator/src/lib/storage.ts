import CryptoJS from 'crypto-js';
import { Project, Scene, UserConfig } from '@/types';
import { debounce, BatchQueue } from './performance';

// 当前版本号 - 每次数据结构变化时递增
const STORAGE_VERSION = '1.1.0';
const ENCRYPTION_KEY = 'aixs-manga-creator-secret-key-2024';
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
// 加密工具
// ==========================================

export function encrypt(data: string): string {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

export function decrypt(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
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
  
  // 未来版本迁移可在此添加
  // '1.1.0_to_1.2.0': () => { ... },
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
  const allVersions = ['0.0.0', '1.0.0', '1.1.0']; // 所有版本列表
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

// ==========================================
// API配置操作
// ==========================================

export function getConfig(): UserConfig | null {
  try {
    const encrypted = localStorage.getItem(KEYS.CONFIG);
    if (!encrypted) return null;
    
    const decrypted = decrypt(encrypted);
    return JSON.parse(decrypted) as UserConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: UserConfig): void {
  try {
    const json = JSON.stringify(config);
    const encrypted = encrypt(json);
    localStorage.setItem(KEYS.CONFIG, encrypted);
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
