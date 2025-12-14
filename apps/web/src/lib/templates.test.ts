import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  applyTemplateVariables,
} from './templates';

describe('templates', () => {
  describe('BUILT_IN_TEMPLATES', () => {
    it('should have templates defined', () => {
      expect(BUILT_IN_TEMPLATES).toBeInstanceOf(Array);
      expect(BUILT_IN_TEMPLATES.length).toBeGreaterThan(0);
    });

    it('should have unique IDs for all templates', () => {
      const ids = BUILT_IN_TEMPLATES.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all required fields', () => {
      BUILT_IN_TEMPLATES.forEach(template => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.category).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.template).toBeDefined();
        expect(template.variables).toBeInstanceOf(Array);
        expect(template.isBuiltIn).toBe(true);
      });
    });

    it('should have templates for different categories', () => {
      const categories = new Set(BUILT_IN_TEMPLATES.map(t => t.category));
      expect(categories.size).toBeGreaterThan(1);
    });

    it('should include scene anchor templates', () => {
      const sceneTemplates = BUILT_IN_TEMPLATES.filter(t => t.category === '场景锚点');
      expect(sceneTemplates.length).toBeGreaterThan(0);
    });

    it('should include action description templates', () => {
      const actionTemplates = BUILT_IN_TEMPLATES.filter(t => t.category === '动作描述');
      expect(actionTemplates.length).toBeGreaterThan(0);
    });

    it('should include prompt templates', () => {
      const promptTemplates = BUILT_IN_TEMPLATES.filter(t => t.category === '镜头提示词');
      expect(promptTemplates.length).toBeGreaterThan(0);
    });
  });

  describe('getTemplateById', () => {
    it('should return template by ID', () => {
      const template = getTemplateById('builtin_scene_realistic');
      expect(template).toBeDefined();
      expect(template?.name).toBe('写实场景锚点');
    });

    it('should return undefined for non-existent ID', () => {
      const template = getTemplateById('non_existent_id');
      expect(template).toBeUndefined();
    });

    it('should return correct template for anime style', () => {
      const template = getTemplateById('builtin_scene_anime');
      expect(template).toBeDefined();
      expect(template?.style).toBe('anime');
    });

    it('should return correct template for cyberpunk', () => {
      const template = getTemplateById('builtin_scene_cyberpunk');
      expect(template).toBeDefined();
      expect(template?.style).toBe('cyberpunk');
    });

    it('should return Midjourney prompt template', () => {
      const template = getTemplateById('builtin_prompt_midjourney');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Midjourney提示词');
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should return templates for scene anchor category', () => {
      const templates = getTemplatesByCategory('场景锚点');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.category === '场景锚点')).toBe(true);
    });

    it('should return templates for action description category', () => {
      const templates = getTemplatesByCategory('动作描述');
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.category === '动作描述')).toBe(true);
    });

    it('should return empty array for non-existent category', () => {
      const templates = getTemplatesByCategory('不存在的分类');
      expect(templates).toEqual([]);
    });

    it('should return stylized templates', () => {
      const templates = getTemplatesByCategory('风格化');
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('applyTemplateVariables', () => {
    it('should replace single variable', () => {
      const template = '你好，{{name}}！';
      const result = applyTemplateVariables(template, { name: '世界' });
      expect(result).toBe('你好，世界！');
    });

    it('should replace multiple variables', () => {
      const template = '{{greeting}}，{{name}}！今天是{{day}}。';
      const result = applyTemplateVariables(template, {
        greeting: '你好',
        name: '小明',
        day: '周一',
      });
      expect(result).toBe('你好，小明！今天是周一。');
    });

    it('should replace same variable multiple times', () => {
      const template = '{{name}}说：我是{{name}}。';
      const result = applyTemplateVariables(template, { name: '张三' });
      expect(result).toBe('张三说：我是张三。');
    });

    it('should leave unmatched variables unchanged', () => {
      const template = '{{name}}和{{other}}';
      const result = applyTemplateVariables(template, { name: '张三' });
      expect(result).toBe('张三和{{other}}');
    });

    it('should handle empty variables object', () => {
      const template = '{{name}}';
      const result = applyTemplateVariables(template, {});
      expect(result).toBe('{{name}}');
    });

    it('should handle template without variables', () => {
      const template = '这是一段没有变量的文本';
      const result = applyTemplateVariables(template, { name: '张三' });
      expect(result).toBe('这是一段没有变量的文本');
    });

    it('should handle multiline templates', () => {
      const template = `标题：{{title}}

内容：{{content}}

作者：{{author}}`;
      const result = applyTemplateVariables(template, {
        title: '测试标题',
        content: '测试内容',
        author: '测试作者',
      });
      expect(result).toContain('标题：测试标题');
      expect(result).toContain('内容：测试内容');
      expect(result).toContain('作者：测试作者');
    });

    it('should handle special characters in values', () => {
      const template = '内容：{{content}}';
      const result = applyTemplateVariables(template, {
        content: '特殊字符：$^.*+?[]{}|\\',
      });
      expect(result).toContain('特殊字符：$^.*+?[]{}|\\');
    });

    it('should work with realistic template', () => {
      const template = getTemplateById('builtin_scene_realistic');
      if (template) {
        const result = applyTemplateVariables(template.template, {
          summary: '主角走进咖啡厅',
          style: '写实风格',
        });
        expect(result).toContain('主角走进咖啡厅');
        expect(result).toContain('写实风格');
      }
    });

    it('should work with action template', () => {
      const template = getTemplateById('builtin_action_dramatic');
      if (template) {
        const result = applyTemplateVariables(template.template, {
          sceneDescription: '昏暗的房间',
          protagonist: '主角',
        });
        expect(result).toContain('昏暗的房间');
        expect(result).toContain('主角');
      }
    });
  });

  describe('template content validation', () => {
    it('should have variables matching template placeholders', () => {
      BUILT_IN_TEMPLATES.forEach(template => {
        const placeholderMatches = template.template.match(/\{\{(\w+)\}\}/g) || [];
        const placeholders = placeholderMatches.map(p => p.replace(/\{\{|\}\}/g, ''));
        const uniquePlaceholders = [...new Set(placeholders)];
        
        // Each declared variable should appear in the template
        template.variables.forEach(variable => {
          expect(uniquePlaceholders).toContain(variable);
        });
      });
    });

    it('should have meaningful descriptions', () => {
      BUILT_IN_TEMPLATES.forEach(template => {
        expect(template.description.length).toBeGreaterThan(5);
      });
    });

    it('should have non-empty templates', () => {
      BUILT_IN_TEMPLATES.forEach(template => {
        expect(template.template.length).toBeGreaterThan(50);
      });
    });
  });
});
