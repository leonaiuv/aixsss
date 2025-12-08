import CryptoJS from 'crypto-js';
import { Project, Scene, UserConfig } from '@/types';

const STORAGE_VERSION = '1.0.0';
const ENCRYPTION_KEY = 'aixs-manga-creator-secret-key-2024';

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
// 版本迁移
// ==========================================

function runMigrations(fromVersion: string, toVersion: string): void {
  console.log(`Migrating storage from ${fromVersion} to ${toVersion}`);
  // MVP阶段暂不实现具体迁移逻辑
}

export function initStorage(): void {
  const storedVersion = localStorage.getItem(KEYS.VERSION) || '0.0.0';
  if (storedVersion !== STORAGE_VERSION) {
    runMigrations(storedVersion, STORAGE_VERSION);
    localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
  }
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

export function saveScenes(projectId: string, scenes: Scene[]): void {
  try {
    localStorage.setItem(KEYS.scenesFor(projectId), JSON.stringify(scenes));
  } catch (error) {
    console.error('Failed to save scenes:', error);
    throw new Error('分镜保存失败');
  }
}

export function getScene(projectId: string, sceneId: string): Scene | null {
  const scenes = getScenes(projectId);
  return scenes.find(s => s.id === sceneId) || null;
}

export function saveScene(projectId: string, scene: Scene): void {
  try {
    const scenes = getScenes(projectId);
    const index = scenes.findIndex(s => s.id === scene.id);
    
    if (index >= 0) {
      scenes[index] = scene;
    } else {
      scenes.push(scene);
    }
    
    saveScenes(projectId, scenes);
  } catch (error) {
    console.error('Failed to save scene:', error);
    throw new Error('分镜保存失败');
  }
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
