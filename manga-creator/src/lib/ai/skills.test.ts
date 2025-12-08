import { describe, expect, it } from 'vitest';
import {
  SceneListSkill,
  SceneDescriptionSkill,
  ActionDescriptionSkill,
  PromptGeneratorSkill,
  SkillRegistry,
  getSkillForTask,
  getSkillByName,
} from '@/lib/ai/skills';
import { Skill } from '@/types';

// ==========================================
// 技能定义测试
// ==========================================

describe('技能定义', () => {
  describe('SceneListSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(SceneListSkill.name).toBe('scene-list-generator');
      expect(SceneListSkill.description).toContain('分镜列表');
    });

    it('应有正确的必需上下文', () => {
      expect(SceneListSkill.requiredContext).toContain('project_essence');
    });

    it('应有正确的输出格式', () => {
      expect(SceneListSkill.outputFormat.type).toBe('text');
      expect(SceneListSkill.outputFormat.maxLength).toBe(500);
    });

    it('应有合理的 maxTokens', () => {
      expect(SceneListSkill.maxTokens).toBeGreaterThan(0);
      expect(SceneListSkill.maxTokens).toBe(1000);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(SceneListSkill.promptTemplate).toContain('{{sceneCount}}');
      expect(SceneListSkill.promptTemplate).toContain('{{summary}}');
      expect(SceneListSkill.promptTemplate).toContain('{{style}}');
    });
  });

  describe('SceneDescriptionSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(SceneDescriptionSkill.name).toBe('scene-description');
      expect(SceneDescriptionSkill.description).toContain('场景描述');
    });

    it('应有正确的必需上下文', () => {
      expect(SceneDescriptionSkill.requiredContext).toContain('project_essence');
      expect(SceneDescriptionSkill.requiredContext).toContain('current_scene_summary');
      expect(SceneDescriptionSkill.requiredContext).toContain('prev_scene_summary');
    });

    it('应有正确的输出格式', () => {
      expect(SceneDescriptionSkill.outputFormat.type).toBe('text');
      expect(SceneDescriptionSkill.outputFormat.maxLength).toBe(200);
    });

    it('应有合理的 maxTokens', () => {
      expect(SceneDescriptionSkill.maxTokens).toBe(500);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(SceneDescriptionSkill.promptTemplate).toContain('{style}');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{protagonist}');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{current_scene_summary}');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{prev_scene_summary}');
    });
  });

  describe('ActionDescriptionSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(ActionDescriptionSkill.name).toBe('action-description');
      expect(ActionDescriptionSkill.description).toContain('动作描述');
    });

    it('应有正确的必需上下文', () => {
      expect(ActionDescriptionSkill.requiredContext).toContain('project_essence');
      expect(ActionDescriptionSkill.requiredContext).toContain('current_scene_summary');
      expect(ActionDescriptionSkill.requiredContext).toContain('confirmed_content');
    });

    it('应有正确的输出格式', () => {
      expect(ActionDescriptionSkill.outputFormat.type).toBe('text');
      expect(ActionDescriptionSkill.outputFormat.maxLength).toBe(150);
    });

    it('应有合理的 maxTokens', () => {
      expect(ActionDescriptionSkill.maxTokens).toBe(400);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(ActionDescriptionSkill.promptTemplate).toContain('{scene_description}');
      expect(ActionDescriptionSkill.promptTemplate).toContain('{protagonist}');
      expect(ActionDescriptionSkill.promptTemplate).toContain('{current_scene_summary}');
    });
  });

  describe('PromptGeneratorSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(PromptGeneratorSkill.name).toBe('prompt-generator');
      expect(PromptGeneratorSkill.description).toContain('提示词');
    });

    it('应有正确的必需上下文', () => {
      expect(PromptGeneratorSkill.requiredContext).toContain('project_essence');
      expect(PromptGeneratorSkill.requiredContext).toContain('confirmed_content');
    });

    it('应有正确的输出格式', () => {
      expect(PromptGeneratorSkill.outputFormat.type).toBe('text');
      expect(PromptGeneratorSkill.outputFormat.maxLength).toBe(300);
    });

    it('应有合理的 maxTokens', () => {
      expect(PromptGeneratorSkill.maxTokens).toBe(600);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(PromptGeneratorSkill.promptTemplate).toContain('{scene_description}');
      expect(PromptGeneratorSkill.promptTemplate).toContain('{action_description}');
      expect(PromptGeneratorSkill.promptTemplate).toContain('{style}');
      expect(PromptGeneratorSkill.promptTemplate).toContain('{protagonist}');
    });

    it('promptTemplate 应要求英文输出', () => {
      expect(PromptGeneratorSkill.promptTemplate).toContain('英文输出');
    });
  });
});

// ==========================================
// 技能注册表测试
// ==========================================

describe('SkillRegistry', () => {
  it('应包含所有预定义技能', () => {
    expect(SkillRegistry.size).toBe(4);
    expect(SkillRegistry.has('scene-list')).toBe(true);
    expect(SkillRegistry.has('scene-description')).toBe(true);
    expect(SkillRegistry.has('action-description')).toBe(true);
    expect(SkillRegistry.has('prompt-generator')).toBe(true);
  });

  it('应返回正确的技能实例', () => {
    expect(SkillRegistry.get('scene-list')).toBe(SceneListSkill);
    expect(SkillRegistry.get('scene-description')).toBe(SceneDescriptionSkill);
    expect(SkillRegistry.get('action-description')).toBe(ActionDescriptionSkill);
    expect(SkillRegistry.get('prompt-generator')).toBe(PromptGeneratorSkill);
  });

  it('未注册的技能应返回 undefined', () => {
    expect(SkillRegistry.get('unknown-skill')).toBeUndefined();
  });

  it('所有注册的技能应符合 Skill 接口', () => {
    SkillRegistry.forEach((skill: Skill) => {
      expect(skill.name).toBeDefined();
      expect(skill.description).toBeDefined();
      expect(skill.requiredContext).toBeDefined();
      expect(Array.isArray(skill.requiredContext)).toBe(true);
      expect(skill.promptTemplate).toBeDefined();
      expect(skill.outputFormat).toBeDefined();
      expect(skill.maxTokens).toBeGreaterThan(0);
    });
  });
});

// ==========================================
// getSkillForTask 测试
// ==========================================

describe('getSkillForTask', () => {
  it('应根据任务类型返回正确的技能', () => {
    expect(getSkillForTask('scene-list')).toBe(SceneListSkill);
    expect(getSkillForTask('scene-description')).toBe(SceneDescriptionSkill);
    expect(getSkillForTask('action-description')).toBe(ActionDescriptionSkill);
    expect(getSkillForTask('prompt-generator')).toBe(PromptGeneratorSkill);
  });

  it('未知任务类型应返回 null', () => {
    expect(getSkillForTask('unknown-task')).toBeNull();
    expect(getSkillForTask('')).toBeNull();
  });

  it('应正确处理大小写敏感的任务类型', () => {
    expect(getSkillForTask('Scene-List')).toBeNull();
    expect(getSkillForTask('SCENE-LIST')).toBeNull();
    expect(getSkillForTask('scene-list')).not.toBeNull();
  });
});

// ==========================================
// getSkillByName 测试
// ==========================================

describe('getSkillByName', () => {
  it('应根据技能名称映射返回正确的技能', () => {
    expect(getSkillByName('generate_scene_desc')).toBe(SceneDescriptionSkill);
    expect(getSkillByName('generate_action_desc')).toBe(ActionDescriptionSkill);
    expect(getSkillByName('generate_shot_prompt')).toBe(PromptGeneratorSkill);
    expect(getSkillByName('generate_scene_list')).toBe(SceneListSkill);
  });

  it('应支持直接使用注册表键名', () => {
    expect(getSkillByName('scene-description')).toBe(SceneDescriptionSkill);
    expect(getSkillByName('action-description')).toBe(ActionDescriptionSkill);
    expect(getSkillByName('prompt-generator')).toBe(PromptGeneratorSkill);
    expect(getSkillByName('scene-list')).toBe(SceneListSkill);
  });

  it('未知名称应返回 null', () => {
    expect(getSkillByName('unknown-name')).toBeNull();
    expect(getSkillByName('')).toBeNull();
    expect(getSkillByName('random_string')).toBeNull();
  });

  it('应正确处理大小写敏感', () => {
    expect(getSkillByName('Generate_Scene_Desc')).toBeNull();
    expect(getSkillByName('GENERATE_SCENE_DESC')).toBeNull();
    expect(getSkillByName('generate_scene_desc')).not.toBeNull();
  });
});

// ==========================================
// 边界情况测试
// ==========================================

describe('边界情况', () => {
  it('所有技能的 promptTemplate 不应为空', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.promptTemplate.length).toBeGreaterThan(0);
    });
  });

  it('所有技能应有至少一个必需上下文', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.requiredContext.length).toBeGreaterThan(0);
    });
  });

  it('所有技能的 maxTokens 应在合理范围内', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.maxTokens).toBeGreaterThanOrEqual(100);
      expect(skill.maxTokens).toBeLessThanOrEqual(10000);
    });
  });

  it('所有技能的 outputFormat.maxLength 应在合理范围内', () => {
    SkillRegistry.forEach((skill) => {
      if (skill.outputFormat.maxLength !== undefined) {
        expect(skill.outputFormat.maxLength).toBeGreaterThan(0);
        expect(skill.outputFormat.maxLength).toBeLessThanOrEqual(10000);
      }
    });
  });

  it('技能名称应唯一', () => {
    const names = new Set<string>();
    SkillRegistry.forEach((skill) => {
      expect(names.has(skill.name)).toBe(false);
      names.add(skill.name);
    });
  });

  it('技能描述应简洁明了', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.description.length).toBeGreaterThan(5);
      expect(skill.description.length).toBeLessThan(200);
    });
  });
});

// ==========================================
// 技能模板占位符一致性测试
// ==========================================

describe('模板占位符一致性', () => {
  it('SceneListSkill 使用 {{}} 格式占位符', () => {
    const template = SceneListSkill.promptTemplate;
    // 验证使用 {{}} 格式
    expect(template).toMatch(/\{\{.*\}\}/);
  });

  it('其他技能使用 {} 格式占位符', () => {
    const skills = [SceneDescriptionSkill, ActionDescriptionSkill, PromptGeneratorSkill];
    skills.forEach((skill) => {
      // 验证使用 {} 格式
      expect(skill.promptTemplate).toMatch(/\{[^{].*[^}]\}/);
    });
  });

  it('所有模板应包含角色定义', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.promptTemplate).toContain('你是');
    });
  });

  it('所有模板应包含输出要求', () => {
    SkillRegistry.forEach((skill) => {
      const hasOutputRequirement =
        skill.promptTemplate.includes('输出') ||
        skill.promptTemplate.includes('格式') ||
        skill.promptTemplate.includes('要求');
      expect(hasOutputRequirement).toBe(true);
    });
  });
});

// ==========================================
// 技能上下文类型验证
// ==========================================

describe('技能上下文类型', () => {
  const validContextTypes = [
    'project_essence',
    'current_scene',
    'current_scene_summary',
    'prev_scene_summary',
    'confirmed_content',
    'scene_list_overview',
  ];

  it('所有技能的 requiredContext 应包含有效的上下文类型', () => {
    SkillRegistry.forEach((skill) => {
      skill.requiredContext.forEach((context) => {
        expect(validContextTypes).toContain(context);
      });
    });
  });

  it('project_essence 应是最常见的必需上下文', () => {
    let count = 0;
    SkillRegistry.forEach((skill) => {
      if (skill.requiredContext.includes('project_essence')) {
        count++;
      }
    });
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ==========================================
// 输出格式验证
// ==========================================

describe('输出格式', () => {
  it('所有技能的 outputFormat.type 应是有效值', () => {
    const validTypes = ['text', 'json'];
    SkillRegistry.forEach((skill) => {
      expect(validTypes).toContain(skill.outputFormat.type);
    });
  });

  it('当前所有技能应使用 text 类型', () => {
    SkillRegistry.forEach((skill) => {
      expect(skill.outputFormat.type).toBe('text');
    });
  });
});
