import { create } from 'zustand';
import { Version } from '@/types';
import { produce } from 'immer';

interface VersionStore {
  versions: Version[];
  maxVersions: number;
  
  // 操作方法
  loadVersions: (projectId: string) => void;
  createVersion: (projectId: string, type: 'project' | 'scene', targetId: string, snapshot: unknown, label?: string, notes?: string) => Version;
  restoreVersion: (versionId: string) => unknown | null;
  deleteVersion: (projectId: string, versionId: string) => void;
  clearOldVersions: (projectId: string, keepCount: number) => void;
  getVersionHistory: (projectId: string, targetId: string) => Version[];
  getProjectVersions: (projectId: string) => Version[];
  getSceneVersions: (sceneId: string) => Version[];
  addLabel: (versionId: string, label: string, notes?: string) => void;
}

export const useVersionStore = create<VersionStore>((set, get) => ({
  versions: [],
  maxVersions: 50, // 每个项目最多保留50个版本
  
  loadVersions: (projectId: string) => {
    try {
      const stored = localStorage.getItem(`aixs_versions_${projectId}`);
      const versions = stored ? JSON.parse(stored) : [];
      set({ versions });
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  },
  
  createVersion: (projectId: string, type, targetId, snapshot, label, notes) => {
    const now = new Date().toISOString();
    const newVersion: Version = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      type,
      targetId,
      snapshot,
      label,
      notes,
      createdAt: now,
      createdBy: '我', // 单用户应用
    };
    
    let versions = [...get().versions, newVersion];
    
    // 限制版本数量
    const projectVersions = versions.filter(v => v.projectId === projectId);
    if (projectVersions.length > get().maxVersions) {
      // 删除最旧的版本
      const toDelete = projectVersions[0];
      versions = versions.filter(v => v.id !== toDelete.id);
    }
    
    set({ versions });
    saveVersions(projectId, versions.filter(v => v.projectId === projectId));
    
    return newVersion;
  },
  
  restoreVersion: (versionId: string) => {
    const version = get().versions.find(v => v.id === versionId);
    if (version) {
      return version.snapshot;
    }
    return null;
  },
  
  deleteVersion: (projectId: string, versionId: string) => {
    const versions = get().versions.filter(v => v.id !== versionId);
    set({ versions });
    saveVersions(projectId, versions.filter(v => v.projectId === projectId));
  },
  
  clearOldVersions: (projectId: string, keepCount: number) => {
    const projectVersions = get().versions
      .filter(v => v.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, keepCount);
    
    const otherVersions = get().versions.filter(v => v.projectId !== projectId);
    const versions = [...otherVersions, ...projectVersions];
    
    set({ versions });
    saveVersions(projectId, projectVersions);
  },
  
  getVersionHistory: (projectId: string, targetId: string) => {
    return get().versions
      .filter(v => v.projectId === projectId && v.targetId === targetId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  
  getProjectVersions: (projectId: string) => {
    return get().versions
      .filter(v => v.projectId === projectId && v.type === 'project')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  
  getSceneVersions: (sceneId: string) => {
    return get().versions
      .filter(v => v.targetId === sceneId && v.type === 'scene')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  
  addLabel: (versionId: string, label: string, notes?: string) => {
    set(state => ({
      versions: state.versions.map(v => 
        v.id === versionId 
          ? { ...v, label, notes: notes || v.notes }
          : v
      )
    }));
  },
}));

function saveVersions(projectId: string, versions: Version[]) {
  try {
    localStorage.setItem(`aixs_versions_${projectId}`, JSON.stringify(versions));
  } catch (error) {
    console.error('Failed to save versions:', error);
  }
}
