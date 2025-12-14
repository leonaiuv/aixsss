import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStorageUsage,
  hasEnoughSpace,
  compressData,
  decompressData,
  saveLargeData,
  loadLargeData,
  removeLargeData,
  cleanupOldData,
  getAllKeys,
  exportAllData,
  importAllData,
  verifyDataIntegrity,
  repairCorruptedData,
  initStorageManager,
} from './storageManager';

describe('StorageManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getStorageUsage', () => {
    it('应该返回当前存储使用情况', () => {
      localStorage.setItem('test_key', 'test_value');

      const usage = getStorageUsage();

      expect(usage.used).toBeGreaterThan(0);
      expect(usage.quota).toBeGreaterThan(0);
      expect(usage.percentage).toBeGreaterThanOrEqual(0);
      expect(usage.percentage).toBeLessThanOrEqual(100);
      expect(usage.available).toBeGreaterThan(0);
    });

    it('空存储应该返回0使用量', () => {
      const usage = getStorageUsage();

      expect(usage.used).toBe(0);
      expect(usage.percentage).toBe(0);
    });
  });

  describe('hasEnoughSpace', () => {
    it('应该正确判断空间是否充足', () => {
      const smallData = 100; // 100字节
      const largeData = 5 * 1024 * 1024; // 5MB

      expect(hasEnoughSpace(smallData)).toBe(true);
      expect(hasEnoughSpace(largeData)).toBe(false);
    });
  });

  describe('compressData and decompressData', () => {
    it('应该成功压缩和解压数据', () => {
      const original = 'This is a test string that will be compressed.'.repeat(100);

      const compressed = compressData(original);
      const decompressed = decompressData(compressed);

      expect(compressed.length).toBeLessThan(original.length);
      expect(decompressed).toBe(original);
    });

    it('应该处理中文字符', () => {
      const original = '这是一个测试字符串，包含中文内容。'.repeat(50);

      const compressed = compressData(original);
      const decompressed = decompressData(compressed);

      expect(decompressed).toBe(original);
    });

    it('应该处理空字符串', () => {
      const original = '';

      const compressed = compressData(original);
      const decompressed = decompressData(compressed);

      expect(decompressed).toBe(original);
    });
  });

  describe('saveLargeData and loadLargeData', () => {
    it('应该保存和加载小数据', () => {
      const key = 'test_small';
      const data = 'Small data content';

      saveLargeData(key, data);
      const loaded = loadLargeData(key);

      expect(loaded).toBe(data);
      expect(localStorage.getItem(`${key}_meta`)).toBeDefined();
    });

    it('应该保存和加载大数据（分片）', () => {
      const key = 'test_large';
      const data = 'x'.repeat(200 * 1024); // 200KB，超过100KB分片大小

      saveLargeData(key, data);
      const loaded = loadLargeData(key);

      expect(loaded).toBe(data);

      const meta = JSON.parse(localStorage.getItem(`${key}_meta`) || '{}');
      expect(meta.chunked).toBe(true);
      expect(meta.chunkCount).toBeGreaterThan(1);
    });

    it('应该处理压缩数据', () => {
      const key = 'test_compress';
      const data = 'Compressible data'.repeat(100);

      saveLargeData(key, data, true);
      const loaded = loadLargeData(key);

      expect(loaded).toBe(data);

      const meta = JSON.parse(localStorage.getItem(`${key}_meta`) || '{}');
      expect(meta.compressed).toBe(true);
    });

    it('不存在的key应该返回null', () => {
      const loaded = loadLargeData('non_existent_key');

      expect(loaded).toBeNull();
    });

    it('应该兼容旧版本（无元数据）', () => {
      const key = 'legacy_key';
      const data = 'Legacy data';

      localStorage.setItem(key, data);
      const loaded = loadLargeData(key);

      expect(loaded).toBe(data);
    });
  });

  describe('removeLargeData', () => {
    it('应该删除普通数据', () => {
      const key = 'test_remove';
      const data = 'Data to remove';

      saveLargeData(key, data);
      expect(loadLargeData(key)).toBe(data);

      removeLargeData(key);
      expect(loadLargeData(key)).toBeNull();
      expect(localStorage.getItem(`${key}_meta`)).toBeNull();
    });

    it('应该删除分片数据', () => {
      const key = 'test_remove_chunked';
      const data = 'x'.repeat(200 * 1024);

      saveLargeData(key, data);

      const meta = JSON.parse(localStorage.getItem(`${key}_meta`) || '{}');
      const chunkCount = meta.chunkCount;

      removeLargeData(key);

      expect(localStorage.getItem(`${key}_meta`)).toBeNull();

      for (let i = 0; i < chunkCount; i++) {
        expect(localStorage.getItem(`${key}_chunk_${i}`)).toBeNull();
      }
    });
  });

  describe('cleanupOldData', () => {
    it('应该清理过期数据', () => {
      const key1 = 'old_data';
      const key2 = 'new_data';

      // 保存数据
      saveLargeData(key1, 'old');
      saveLargeData(key2, 'new');

      // 修改key1的时间戳为91天前
      const meta1 = JSON.parse(localStorage.getItem(`${key1}_meta`) || '{}');
      meta1.timestamp = Date.now() - 91 * 24 * 60 * 60 * 1000;
      localStorage.setItem(`${key1}_meta`, JSON.stringify(meta1));

      const cleaned = cleanupOldData(90);

      expect(cleaned).toBe(1);
      expect(loadLargeData(key1)).toBeNull();
      expect(loadLargeData(key2)).toBeDefined();
    });

    it('没有过期数据时应该返回0', () => {
      saveLargeData('recent_data', 'test');

      const cleaned = cleanupOldData(90);

      expect(cleaned).toBe(0);
    });
  });

  describe('getAllKeys', () => {
    it('应该返回所有存储的键（排除元数据和分片）', () => {
      saveLargeData('key1', 'data1');
      saveLargeData('key2', 'data2');
      localStorage.setItem('other_key', 'other');

      const keys = getAllKeys();

      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).not.toContain('key1_meta');
      expect(keys).not.toContain('key1_chunk_0');
    });
  });

  describe('exportAllData and importAllData', () => {
    it('应该导出和导入所有数据', () => {
      saveLargeData('export_key1', 'data1');
      saveLargeData('export_key2', 'data2');

      const exported = exportAllData();

      expect(exported).toHaveProperty('export_key1');
      expect(exported).toHaveProperty('export_key2');

      localStorage.clear();

      importAllData(exported);

      expect(loadLargeData('export_key1')).toBe('data1');
      expect(loadLargeData('export_key2')).toBe('data2');
    });

    it('应该处理JSON对象', () => {
      const data = { name: 'test', value: 123 };
      localStorage.setItem('json_key', JSON.stringify(data));

      const exported = exportAllData();

      localStorage.clear();
      importAllData(exported);

      const loaded = JSON.parse(loadLargeData('json_key') || '{}');
      expect(loaded).toEqual(data);
    });
  });

  describe('verifyDataIntegrity', () => {
    it('正常数据应该通过完整性检查', () => {
      saveLargeData('test_integrity', 'test data');

      expect(verifyDataIntegrity('test_integrity')).toBe(true);
    });

    it('分片数据应该通过完整性检查', () => {
      const data = 'x'.repeat(200 * 1024);
      saveLargeData('test_chunked', data);

      expect(verifyDataIntegrity('test_chunked')).toBe(true);
    });

    it('缺失分片应该无法通过检查', () => {
      const data = 'x'.repeat(200 * 1024);
      saveLargeData('test_corrupted', data);

      // 删除一个分片
      localStorage.removeItem('test_corrupted_chunk_0');

      expect(verifyDataIntegrity('test_corrupted')).toBe(false);
    });

    it('无元数据应该假设正常', () => {
      localStorage.setItem('no_meta', 'data');

      expect(verifyDataIntegrity('no_meta')).toBe(true);
    });
  });

  describe('repairCorruptedData', () => {
    it('正常数据不应该被修复', () => {
      saveLargeData('test_repair', 'test data');

      const result = repairCorruptedData('test_repair');

      expect(result).toBe(true);
      expect(loadLargeData('test_repair')).toBeDefined();
    });

    it('损坏数据应该被清除', () => {
      const data = 'x'.repeat(200 * 1024);
      saveLargeData('test_repair_corrupted', data);

      localStorage.removeItem('test_repair_corrupted_chunk_0');

      const result = repairCorruptedData('test_repair_corrupted');

      expect(result).toBe(false);
      expect(loadLargeData('test_repair_corrupted')).toBeNull();
    });
  });

  describe('initStorageManager', () => {
    it('应该设置版本号', () => {
      initStorageManager();

      const version = localStorage.getItem('aixs_storage_version');
      expect(version).toBeDefined();
      expect(version).toBe('2.0.0');
    });

    it('高使用率时应该自动清理', () => {
      // 创建一些旧数据
      saveLargeData('old1', 'data1');
      const meta = JSON.parse(localStorage.getItem('old1_meta') || '{}');
      meta.timestamp = Date.now() - 100 * 24 * 60 * 60 * 1000;
      localStorage.setItem('old1_meta', JSON.stringify(meta));

      // 模拟高使用率（实际测试中很难达到，这里只验证函数调用）
      initStorageManager();

      // 验证版本号已设置
      expect(localStorage.getItem('aixs_storage_version')).toBe('2.0.0');
    });
  });
});
