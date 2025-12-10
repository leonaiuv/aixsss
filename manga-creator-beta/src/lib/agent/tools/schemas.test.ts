import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  generateScenesInputSchema,
  refineSceneInputSchema,
  setProjectInfoInputSchema,
  exportPromptsInputSchema,
} from './schemas';

describe('Agent Tools Schemas', () => {
  describe('generateScenesInputSchema', () => {
    it('应该接受有效的分镜数量', () => {
      const result = generateScenesInputSchema.safeParse({ count: 8 });
      expect(result.success).toBe(true);
    });

    it('应该拒绝小于6的分镜数量', () => {
      const result = generateScenesInputSchema.safeParse({ count: 3 });
      expect(result.success).toBe(false);
    });

    it('应该拒绝大于15的分镜数量', () => {
      const result = generateScenesInputSchema.safeParse({ count: 20 });
      expect(result.success).toBe(false);
    });

    it('应该使用默认值8', () => {
      const result = generateScenesInputSchema.parse({});
      expect(result.count).toBe(8);
    });
  });

  describe('refineSceneInputSchema', () => {
    it('应该接受有效的分镜ID', () => {
      const result = refineSceneInputSchema.safeParse({ sceneId: 'scene-123' });
      expect(result.success).toBe(true);
    });

    it('应该拒绝空的分镜ID', () => {
      const result = refineSceneInputSchema.safeParse({ sceneId: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('setProjectInfoInputSchema', () => {
    it('应该接受完整的项目信息', () => {
      const result = setProjectInfoInputSchema.safeParse({
        title: '测试项目',
        summary: '这是一个测试项目的简介',
        artStyle: '赛博朋克',
        protagonist: '主角小明',
      });
      expect(result.success).toBe(true);
    });

    it('应该允许部分更新', () => {
      const result = setProjectInfoInputSchema.safeParse({
        title: '仅更新标题',
      });
      expect(result.success).toBe(true);
    });

    it('应该拒绝空标题', () => {
      const result = setProjectInfoInputSchema.safeParse({
        title: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('exportPromptsInputSchema', () => {
    it('应该接受有效的导出格式', () => {
      const result = exportPromptsInputSchema.safeParse({ format: 'json' });
      expect(result.success).toBe(true);
    });

    it('应该接受 txt 格式', () => {
      const result = exportPromptsInputSchema.safeParse({ format: 'txt' });
      expect(result.success).toBe(true);
    });

    it('应该使用默认格式 json', () => {
      const result = exportPromptsInputSchema.parse({});
      expect(result.format).toBe('json');
    });

    it('应该拒绝无效格式', () => {
      const result = exportPromptsInputSchema.safeParse({ format: 'xml' });
      expect(result.success).toBe(false);
    });
  });
});
