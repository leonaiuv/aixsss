import { describe, expect, it } from 'vitest';
import {
  SceneListSkill,
  SceneDescriptionSkill,
  ActionDescriptionSkill,
  KeyframePromptSkill,
  MotionPromptSkill,
  DialogueSkill,
  SkillRegistry,
  getSkillForTask,
  getSkillByName,
  parseDialoguesFromText,
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
      expect(SceneListSkill.promptTemplate).toContain('{{styleFullPrompt}}');
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
    it('应有正确的名称（已废弃，保留兼容）', () => {
      expect(ActionDescriptionSkill.name).toBe('action-description');
      expect(ActionDescriptionSkill.description).toContain('废弃');
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
  });

  describe('KeyframePromptSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(KeyframePromptSkill.name).toBe('keyframe-prompt');
      expect(KeyframePromptSkill.description).toContain('静态');
      expect(KeyframePromptSkill.description).toContain('关键帧');
    });

    it('应有正确的必需上下文', () => {
      expect(KeyframePromptSkill.requiredContext).toContain('project_essence');
      expect(KeyframePromptSkill.requiredContext).toContain('confirmed_content');
    });

    it('应有正确的输出格式', () => {
      expect(KeyframePromptSkill.outputFormat.type).toBe('text');
      expect(KeyframePromptSkill.outputFormat.maxLength).toBe(300);
    });

    it('应有合理的 maxTokens', () => {
      expect(KeyframePromptSkill.maxTokens).toBe(500);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(KeyframePromptSkill.promptTemplate).toContain('{scene_description}');
      expect(KeyframePromptSkill.promptTemplate).toContain('{style}');
      expect(KeyframePromptSkill.promptTemplate).toContain('{protagonist}');
    });

    it('promptTemplate 应要求英文输出', () => {
      expect(KeyframePromptSkill.promptTemplate).toContain('英文输出');
    });

    it('promptTemplate 应禁止动态词汇', () => {
      expect(KeyframePromptSkill.promptTemplate).toContain('禁止动态词汇');
    });

    it('promptTemplate 应要求静态画面描述', () => {
      expect(KeyframePromptSkill.promptTemplate).toContain('静态画面');
    });
  });

  describe('MotionPromptSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(MotionPromptSkill.name).toBe('motion-prompt');
      expect(MotionPromptSkill.description).toContain('时空提示词');
    });

    it('应有正确的必需上下文', () => {
      expect(MotionPromptSkill.requiredContext).toContain('project_essence');
      expect(MotionPromptSkill.requiredContext).toContain('confirmed_content');
    });

    it('应有正确的输出格式（简短）', () => {
      expect(MotionPromptSkill.outputFormat.type).toBe('text');
      expect(MotionPromptSkill.outputFormat.maxLength).toBe(100);
    });

    it('应有较小的 maxTokens（保持简短）', () => {
      expect(MotionPromptSkill.maxTokens).toBe(200);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(MotionPromptSkill.promptTemplate).toContain('{scene_description}');
    });

    it('promptTemplate 应要求极简', () => {
      expect(MotionPromptSkill.promptTemplate).toContain('极简');
      expect(MotionPromptSkill.promptTemplate).toContain('15-25');
    });

    it('promptTemplate 应包含三类元素要求', () => {
      expect(MotionPromptSkill.promptTemplate).toContain('动作');
      expect(MotionPromptSkill.promptTemplate).toContain('镜头');
      expect(MotionPromptSkill.promptTemplate).toContain('场面变化');
    });

    it('promptTemplate 应包含示例输出', () => {
      expect(MotionPromptSkill.promptTemplate).toContain('示例输出');
    });
  });

  describe('DialogueSkill', () => {
    it('应有正确的名称和描述', () => {
      expect(DialogueSkill.name).toBe('dialogue');
      expect(DialogueSkill.description).toContain('台词');
    });

    it('应有正确的必需上下文', () => {
      expect(DialogueSkill.requiredContext).toContain('project_essence');
      expect(DialogueSkill.requiredContext).toContain('confirmed_content');
    });

    it('应有正确的输出格式', () => {
      expect(DialogueSkill.outputFormat.type).toBe('text');
      expect(DialogueSkill.outputFormat.maxLength).toBeGreaterThan(0);
    });

    it('应有合理的 maxTokens', () => {
      expect(DialogueSkill.maxTokens).toBeGreaterThan(0);
      expect(DialogueSkill.maxTokens).toBeLessThanOrEqual(1000);
    });

    it('promptTemplate 应包含必要的占位符', () => {
      expect(DialogueSkill.promptTemplate).toContain('{scene_description}');
      expect(DialogueSkill.promptTemplate).toContain('{scene_summary}');
      expect(DialogueSkill.promptTemplate).toContain('{characters}');
    });

    it('promptTemplate 应包含四种台词类型说明', () => {
      expect(DialogueSkill.promptTemplate).toContain('对白');
      expect(DialogueSkill.promptTemplate).toContain('独白');
      expect(DialogueSkill.promptTemplate).toContain('旁白');
      expect(DialogueSkill.promptTemplate).toContain('心理');
    });

    it('promptTemplate 应包含输出格式要求', () => {
      expect(DialogueSkill.promptTemplate).toContain('[');
      expect(DialogueSkill.promptTemplate).toContain(']');
    });

    it('promptTemplate 应要求中文输出', () => {
      expect(DialogueSkill.promptTemplate).toContain('中文');
    });
  });
});

// ==========================================
// 技能注册表测试
// ==========================================

describe('SkillRegistry', () => {
  it('应包含所有预定义技能', () => {
    expect(SkillRegistry.size).toBe(6);
    expect(SkillRegistry.has('scene-list')).toBe(true);
    expect(SkillRegistry.has('scene-description')).toBe(true);
    expect(SkillRegistry.has('action-description')).toBe(true);
    expect(SkillRegistry.has('keyframe-prompt')).toBe(true);
    expect(SkillRegistry.has('motion-prompt')).toBe(true);
    expect(SkillRegistry.has('dialogue')).toBe(true);
  });

  it('应返回正确的技能实例', () => {
    expect(SkillRegistry.get('scene-list')).toBe(SceneListSkill);
    expect(SkillRegistry.get('scene-description')).toBe(SceneDescriptionSkill);
    expect(SkillRegistry.get('action-description')).toBe(ActionDescriptionSkill);
    expect(SkillRegistry.get('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(SkillRegistry.get('motion-prompt')).toBe(MotionPromptSkill);
    expect(SkillRegistry.get('dialogue')).toBe(DialogueSkill);
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
    expect(getSkillForTask('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(getSkillForTask('motion-prompt')).toBe(MotionPromptSkill);
    expect(getSkillForTask('dialogue')).toBe(DialogueSkill);
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
    expect(getSkillByName('generate_keyframe_prompt')).toBe(KeyframePromptSkill);
    expect(getSkillByName('generate_motion_prompt')).toBe(MotionPromptSkill);
    expect(getSkillByName('generate_scene_list')).toBe(SceneListSkill);
    expect(getSkillByName('generate_dialogue')).toBe(DialogueSkill);
  });

  it('应支持直接使用注册表键名', () => {
    expect(getSkillByName('scene-description')).toBe(SceneDescriptionSkill);
    expect(getSkillByName('action-description')).toBe(ActionDescriptionSkill);
    expect(getSkillByName('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(getSkillByName('motion-prompt')).toBe(MotionPromptSkill);
    expect(getSkillByName('scene-list')).toBe(SceneListSkill);
    expect(getSkillByName('dialogue')).toBe(DialogueSkill);
  });

  it('未知名称应返回 null', () => {
    expect(getSkillByName('unknown-name')).toBeNull();
    expect(getSkillByName('')).toBeNull();
    expect(getSkillByName('random_string')).toBeNull();
  });

  it('应正确处理大小写敏感', () => {
    expect(getSkillByName('Generate_Scene_Desc')).toBeNull();
    expect(getSkillByName('GENERATE_KEYFRAME_PROMPT')).toBeNull();
    expect(getSkillByName('generate_scene_desc')).not.toBeNull();
    expect(getSkillByName('generate_keyframe_prompt')).not.toBeNull();
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
    const skills = [SceneDescriptionSkill, KeyframePromptSkill, MotionPromptSkill];
    skills.forEach((skill) => {
      // 验证使用 {} 格式
      expect(skill.promptTemplate).toMatch(/\{[^{].*[^}]\}/);
    });
  });

  it('所有模板应包含角色定义（废弃技能除外）', () => {
    SkillRegistry.forEach((skill) => {
      // 废弃的 ActionDescriptionSkill 使用简化模板，跳过检查
      if (skill.name === 'action-description') return;
      expect(skill.promptTemplate).toContain('你是');
    });
  });

  it('所有模板应包含输出要求（废弃技能除外）', () => {
    SkillRegistry.forEach((skill) => {
      // 废弃的 ActionDescriptionSkill 使用简化模板，跳过检查
      if (skill.name === 'action-description') return;
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

// ==========================================
// parseDialoguesFromText 测试
// ==========================================

describe('parseDialoguesFromText', () => {
  it('应正确解析对白格式', () => {
    const text = '[对白] 小明: 你好，今天天气真好！';
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].type).toBe('dialogue');
    expect(dialogues[0].characterName).toBe('小明');
    expect(dialogues[0].content).toBe('你好，今天天气真好！');
  });

  it('应正确解析独白格式', () => {
    const text = '[独白] 主角: 我一定要成功。';
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].type).toBe('monologue');
    expect(dialogues[0].characterName).toBe('主角');
    expect(dialogues[0].content).toBe('我一定要成功。');
  });

  it('应正确解析旁白格式（无角色名）', () => {
    const text = '[旁白] 夜幕降临，城市的灯光渐渐亮起。';
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].type).toBe('narration');
    expect(dialogues[0].characterName).toBeUndefined();
    expect(dialogues[0].content).toBe('夜幕降临，城市的灯光渐渐亮起。');
  });

  it('应正确解析心理活动格式', () => {
    const text = '[心理] 小红: 他为什么不理我？';
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].type).toBe('thought');
    expect(dialogues[0].characterName).toBe('小红');
    expect(dialogues[0].content).toBe('他为什么不理我？');
  });

  it('应正确解析多条台词', () => {
    const text = `[对白] 小明: 你好！
[对白] 小红: 你好，很高兴认识你。
[旁白] 两人相视而笑。
[心理] 小明: 她好漂亮。`;
    
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(4);
    expect(dialogues[0].order).toBe(1);
    expect(dialogues[1].order).toBe(2);
    expect(dialogues[2].order).toBe(3);
    expect(dialogues[3].order).toBe(4);
  });

  it('应为每条台词生成唯一ID', () => {
    const text = `[对白] A: 话1
[对白] B: 话2`;
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues[0].id).toBeDefined();
    expect(dialogues[1].id).toBeDefined();
    expect(dialogues[0].id).not.toBe(dialogues[1].id);
  });

  it('空文本应返回空数组', () => {
    expect(parseDialoguesFromText('')).toEqual([]);
    expect(parseDialoguesFromText('   ')).toEqual([]);
  });

  it('无效格式应被忽略', () => {
    const text = `这不是有效的台词格式
[对白] 小明: 这是有效的`;
    const dialogues = parseDialoguesFromText(text);
    
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].characterName).toBe('小明');
  });
});
