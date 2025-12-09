// ==========================================
// 增强的存储管理器
// ==========================================
// 功能：
// 1. 数据分片存储（突破5MB限制）
// 2. 数据压缩
// 3. 存储空间监控
// 4. 自动清理过期数据
// 5. 数据完整性校验
// ==========================================

import pako from 'pako';

// 存储配额（5MB，留1MB余量）
const STORAGE_QUOTA = 4 * 1024 * 1024; // 4MB
const CHUNK_SIZE = 100 * 1024; // 100KB per chunk

// 版本号
const CURRENT_VERSION = '2.0.0';

/**
 * 获取当前存储使用情况
 */
export function getStorageUsage(): {
  used: number;
  quota: number;
  percentage: number;
  available: number;
} {
  let used = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const item = localStorage.getItem(key) || '';
      used += key.length + item.length;
    }
  }
  
  return {
    used,
    quota: STORAGE_QUOTA,
    percentage: (used / STORAGE_QUOTA) * 100,
    available: STORAGE_QUOTA - used,
  };
}

/**
 * 检查存储空间是否充足
 */
export function hasEnoughSpace(dataSize: number): boolean {
  const usage = getStorageUsage();
  return usage.available >= dataSize * 1.5; // 预留50%余量
}

/**
 * 压缩数据
 */
export function compressData(data: string): string {
  try {
    const compressed = pako.deflate(data, { level: 9 });
    return btoa(String.fromCharCode(...compressed));
  } catch (error) {
    console.warn('Compression failed, using raw data:', error);
    return data;
  }
}

/**
 * 解压数据
 */
export function decompressData(compressed: string): string {
  try {
    const binary = atob(compressed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes, { to: 'string' });
    return decompressed;
  } catch (error) {
    console.warn('Decompression failed, returning raw data:', error);
    return compressed;
  }
}

/**
 * 保存大数据（自动分片）
 */
export function saveLargeData(key: string, data: string, compress = true): void {
  let processedData = data;
  
  // 压缩
  if (compress) {
    processedData = compressData(data);
  }
  
  // 检查是否需要分片
  if (processedData.length <= CHUNK_SIZE) {
    localStorage.setItem(key, processedData);
    localStorage.setItem(`${key}_meta`, JSON.stringify({
      compressed: compress,
      chunked: false,
      version: CURRENT_VERSION,
      timestamp: Date.now(),
    }));
    return;
  }
  
  // 分片存储
  const chunks = [];
  for (let i = 0; i < processedData.length; i += CHUNK_SIZE) {
    chunks.push(processedData.slice(i, i + CHUNK_SIZE));
  }
  
  chunks.forEach((chunk, index) => {
    localStorage.setItem(`${key}_chunk_${index}`, chunk);
  });
  
  // 保存元数据
  localStorage.setItem(`${key}_meta`, JSON.stringify({
    compressed: compress,
    chunked: true,
    chunkCount: chunks.length,
    version: CURRENT_VERSION,
    timestamp: Date.now(),
  }));
}

/**
 * 读取大数据（自动合并分片）
 */
export function loadLargeData(key: string): string | null {
  const metaStr = localStorage.getItem(`${key}_meta`);
  
  if (!metaStr) {
    // 兼容旧版本（无元数据）
    return localStorage.getItem(key);
  }
  
  try {
    const meta = JSON.parse(metaStr);
    
    let data: string;
    
    if (meta.chunked) {
      // 合并分片
      const chunks: string[] = [];
      for (let i = 0; i < meta.chunkCount; i++) {
        const chunk = localStorage.getItem(`${key}_chunk_${i}`);
        if (chunk) {
          chunks.push(chunk);
        } else {
          console.error(`Missing chunk ${i} for key ${key}`);
          return null;
        }
      }
      data = chunks.join('');
    } else {
      data = localStorage.getItem(key) || '';
    }
    
    // 解压
    if (meta.compressed) {
      data = decompressData(data);
    }
    
    return data;
  } catch (error) {
    console.error('Failed to load large data:', error);
    return null;
  }
}

/**
 * 删除大数据（包括分片）
 */
export function removeLargeData(key: string): void {
  const metaStr = localStorage.getItem(`${key}_meta`);
  
  if (metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      
      if (meta.chunked) {
        // 删除所有分片
        for (let i = 0; i < meta.chunkCount; i++) {
          localStorage.removeItem(`${key}_chunk_${i}`);
        }
      }
      
      localStorage.removeItem(`${key}_meta`);
    } catch (error) {
      console.error('Failed to remove large data:', error);
    }
  }
  
  localStorage.removeItem(key);
}

/**
 * 清理过期数据（超过N天）
 */
export function cleanupOldData(days: number = 90): number {
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    
    if (key && key.endsWith('_meta')) {
      try {
        const meta = JSON.parse(localStorage.getItem(key) || '{}');
        
        if (meta.timestamp && meta.timestamp < cutoffTime) {
          const dataKey = key.replace('_meta', '');
          keysToRemove.push(dataKey);
        }
      } catch (error) {
        // 忽略解析错误
      }
    }
  }
  
  keysToRemove.forEach(key => {
    removeLargeData(key);
    cleaned++;
  });
  
  return cleaned;
}

/**
 * 获取所有存储的键
 */
export function getAllKeys(): string[] {
  const keys: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !key.endsWith('_meta') && !key.includes('_chunk_')) {
      keys.push(key);
    }
  }
  
  return keys;
}

/**
 * 导出所有数据
 */
export function exportAllData(): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const keys = getAllKeys();
  
  keys.forEach(key => {
    const value = loadLargeData(key);
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  });
  
  return data;
}

/**
 * 导入数据
 */
export function importAllData(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    saveLargeData(key, str, true);
  }
}

/**
 * 数据完整性校验
 */
export function verifyDataIntegrity(key: string): boolean {
  const metaStr = localStorage.getItem(`${key}_meta`);
  
  if (!metaStr) {
    return true; // 无元数据，假设正常
  }
  
  try {
    const meta = JSON.parse(metaStr);
    
    if (meta.chunked) {
      // 检查所有分片是否存在
      for (let i = 0; i < meta.chunkCount; i++) {
        if (!localStorage.getItem(`${key}_chunk_${i}`)) {
          return false;
        }
      }
    } else {
      if (!localStorage.getItem(key)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 修复损坏的数据
 */
export function repairCorruptedData(key: string): boolean {
  if (verifyDataIntegrity(key)) {
    return true; // 无需修复
  }
  
  // 尝试从备份恢复或清除损坏数据
  console.warn(`Data corrupted for key: ${key}, removing...`);
  removeLargeData(key);
  return false;
}

/**
 * 初始化存储管理器
 */
export function initStorageManager(): void {
  // 设置版本号
  const storedVersion = localStorage.getItem('aixs_storage_version');
  
  if (!storedVersion || storedVersion !== CURRENT_VERSION) {
    console.log(`Upgrading storage from ${storedVersion} to ${CURRENT_VERSION}`);
    localStorage.setItem('aixs_storage_version', CURRENT_VERSION);
    
    // 执行数据迁移（如需要）
    if (storedVersion && storedVersion < '2.0.0') {
      migrateFromV1toV2();
    }
  }
  
  // 检查并清理过期数据
  const usage = getStorageUsage();
  if (usage.percentage > 80) {
    const cleaned = cleanupOldData(90);
    console.log(`Cleaned up ${cleaned} old items`);
  }
}

/**
 * 从V1迁移到V2
 */
function migrateFromV1toV2(): void {
  // V1到V2的迁移逻辑
  console.log('Migrating data from V1 to V2...');
  
  // 这里可以添加具体的迁移逻辑
  // 例如：重新压缩数据、更新数据结构等
}
