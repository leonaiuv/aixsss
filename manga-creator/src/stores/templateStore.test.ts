import { describe, it, expect, beforeEach } from 'vitest';
import { useTemplateStore } from './templateStore';

describe('TemplateStore', () => {
  beforeEach(() => {
    // 重置store并重新加载内置模板
    useTemplateStore.setState({ templates: [] });
    useTemplateStore.getState().loadBuiltInTemplates();
  });

  describe('loadBuiltInTemplates', () => {
    it('应该加载内置模板', () => {
      const { templates } = useTemplateStore.getState();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.isBuiltIn)).toBe(true);
    });
  });

  describe('addTemplate', () => {
    it('应该能够添加自定义模板', () => {
      const { addTemplate, templates } = useTemplateStore.getState();
      const initialCount = templates.length;

      addTemplate({
        name: '测试模板',
        category: 'scene',
        description: '测试用模板',
        template: '{{location}} 的 {{time}}',
        variables: ['location', 'time'],
        isBuiltIn: false,
      });

      expect(useTemplateStore.getState().templates).toHaveLength(
        initialCount + 1
      );
    });

    it('应该自动生成ID和默认值', () => {
      const { addTemplate, templates } = useTemplateStore.getState();

      addTemplate({
        name: '新模板',
        category: 'action',
        description: '描述',
        template: '模板内容',
        variables: [],
        isBuiltIn: false,
      });

      const newTemplate = templates[templates.length - 1];
      expect(newTemplate.id).toBeDefined();
      expect(newTemplate.usageCount).toBe(0);
      expect(newTemplate.createdAt).toBeDefined();
      expect(newTemplate.updatedAt).toBeDefined();
    });
  });

  describe('updateTemplate', () => {
    it('应该能够更新模板', () => {
      const { addTemplate, updateTemplate } = useTemplateStore.getState();
      const created = addTemplate({
        name: '可更新模板',
        category: 'scene',
        description: '用于测试 update',
        template: 'test',
        variables: [],
        isBuiltIn: false,
      });

      updateTemplate(created.id, {
        name: '更新后的名称',
        usageCount: 10,
      });

      const updatedTemplate = useTemplateStore
        .getState()
        .templates.find((t) => t.id === created.id);

      expect(updatedTemplate?.name).toBe('更新后的名称');
      expect(updatedTemplate?.usageCount).toBe(10);
    });

    it('不应该更新内置模板', () => {
      const { templates, updateTemplate } = useTemplateStore.getState();
      const builtInTemplate = templates.find((t) => t.isBuiltIn);

      if (builtInTemplate) {
        const originalName = builtInTemplate.name;
        updateTemplate(builtInTemplate.id, { name: '尝试更新' });

        const template = useTemplateStore
          .getState()
          .templates.find((t) => t.id === builtInTemplate.id);

        expect(template?.name).toBe(originalName);
      }
    });
  });

  describe('deleteTemplate', () => {
    it('应该能够删除自定义模板', () => {
      const { addTemplate, deleteTemplate } = useTemplateStore.getState();

      const created = addTemplate({
        name: '待删除模板',
        category: 'scene',
        description: '',
        template: '',
        variables: [],
        isBuiltIn: false,
      });
      const afterAddCount = useTemplateStore.getState().templates.length;

      deleteTemplate(created.id);

      expect(useTemplateStore.getState().templates).toHaveLength(
        afterAddCount - 1
      );
    });

    it('不应该删除内置模板', () => {
      const { templates, deleteTemplate } = useTemplateStore.getState();
      const builtInTemplate = templates.find((t) => t.isBuiltIn);

      if (builtInTemplate) {
        const beforeCount = templates.length;
        deleteTemplate(builtInTemplate.id);

        expect(useTemplateStore.getState().templates).toHaveLength(beforeCount);
      }
    });
  });

  describe('getTemplatesByCategory', () => {
    it('应该按类别筛选模板', () => {
      const { getTemplatesByCategory } = useTemplateStore.getState();

      const sceneTemplates = getTemplatesByCategory('scene');
      expect(sceneTemplates.every((t) => t.category === 'scene')).toBe(true);

      const characterTemplates = getTemplatesByCategory('character');
      expect(characterTemplates.every((t) => t.category === 'character')).toBe(
        true
      );
    });
  });

  describe('searchTemplates', () => {
    it('应该能够搜索模板', () => {
      const { searchTemplates, addTemplate } = useTemplateStore.getState();

      addTemplate({
        name: '赛博朋克城市',
        category: 'scene',
        description: '未来科技城市场景',
        template: '赛博朋克风格的城市',
        variables: [],
        isBuiltIn: false,
      });

      const results = searchTemplates('赛博朋克');
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some(
          (t) =>
            t.name.includes('赛博朋克') || t.description.includes('赛博朋克')
        )
      ).toBe(true);
    });

    it('搜索应该不区分大小写', () => {
      const { searchTemplates, addTemplate } = useTemplateStore.getState();

      addTemplate({
        name: 'Cyberpunk Scene',
        category: 'scene',
        description: 'Futuristic city',
        template: 'cyberpunk style',
        variables: [],
        isBuiltIn: false,
      });

      const results = searchTemplates('CYBERPUNK');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getPopularTemplates', () => {
    it('应该按使用次数排序', () => {
      const { getPopularTemplates, templates, updateTemplate } =
        useTemplateStore.getState();

      // 更新使用次数
      if (templates.length >= 3) {
        updateTemplate(templates[0].id, { usageCount: 10 });
        updateTemplate(templates[1].id, { usageCount: 50 });
        updateTemplate(templates[2].id, { usageCount: 25 });
      }

      const popular = getPopularTemplates(3);
      expect(popular).toHaveLength(3);

      // 验证是按使用次数降序排列
      for (let i = 1; i < popular.length; i++) {
        expect(popular[i - 1].usageCount).toBeGreaterThanOrEqual(
          popular[i].usageCount
        );
      }
    });
  });
});
