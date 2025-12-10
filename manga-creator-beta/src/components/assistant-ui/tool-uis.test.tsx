import { describe, it, expect } from 'vitest';
import {
  CreateProjectToolUI,
  SceneListToolUI,
  SceneDetailToolUI,
  BasicInfoToolUI,
  ExportToolUI,
  BatchRefineToolUI,
  ProjectStateToolUI,
} from './tool-uis';

/**
 * Tool UI 组件测试套件
 * 
 * 验证工具 UI 组件的导出和基本结构
 */
describe('Tool UI Components', () => {
  describe('CreateProjectToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(CreateProjectToolUI.unstable_tool.toolName).toBe('create_project');
    });

    it('应该有 render 函数', () => {
      expect(typeof CreateProjectToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('SceneListToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(SceneListToolUI.unstable_tool.toolName).toBe('generate_scenes');
    });

    it('应该有 render 函数', () => {
      expect(typeof SceneListToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('SceneDetailToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(SceneDetailToolUI.unstable_tool.toolName).toBe('refine_scene');
    });

    it('应该有 render 函数', () => {
      expect(typeof SceneDetailToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('BasicInfoToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(BasicInfoToolUI.unstable_tool.toolName).toBe('set_project_info');
    });

    it('应该有 render 函数', () => {
      expect(typeof BasicInfoToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('ExportToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(ExportToolUI.unstable_tool.toolName).toBe('export_prompts');
    });

    it('应该有 render 函数', () => {
      expect(typeof ExportToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('BatchRefineToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(BatchRefineToolUI.unstable_tool.toolName).toBe('batch_refine_scenes');
    });

    it('应该有 render 函数', () => {
      expect(typeof BatchRefineToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('ProjectStateToolUI', () => {
    it('应该正确导出工具名称', () => {
      expect(ProjectStateToolUI.unstable_tool.toolName).toBe('get_project_state');
    });

    it('应该有 render 函数', () => {
      expect(typeof ProjectStateToolUI.unstable_tool.render).toBe('function');
    });
  });

  describe('所有工具的完整性检查', () => {
    const tools = [
      { name: 'create_project', ui: CreateProjectToolUI },
      { name: 'generate_scenes', ui: SceneListToolUI },
      { name: 'refine_scene', ui: SceneDetailToolUI },
      { name: 'set_project_info', ui: BasicInfoToolUI },
      { name: 'export_prompts', ui: ExportToolUI },
      { name: 'batch_refine_scenes', ui: BatchRefineToolUI },
      { name: 'get_project_state', ui: ProjectStateToolUI },
    ];

    it('应该有 7 个工具 UI 组件', () => {
      expect(tools.length).toBe(7);
    });

    it.each(tools)('$name 应该有正确的结构', ({ name, ui }) => {
      expect(ui.unstable_tool.toolName).toBe(name);
      expect(ui.unstable_tool.render).toBeDefined();
    });
  });
});
