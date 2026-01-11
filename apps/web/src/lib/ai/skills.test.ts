import { describe, expect, it } from 'vitest';
import {
  SceneListSkill,
  SceneDescriptionSkill,
  ActionDescriptionSkill,
  KeyframePromptSkill,
  MotionPromptSkill,
  DialogueSkill,
  CharacterBasicInfoSkill,
  CharacterPortraitSkill,
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
    it('应有正确的名称/描述/输出规格', () => {
      expect(SceneListSkill.name).toBe('scene-list-generator');
      expect(SceneListSkill.description).toContain('分镜列表');
      expect(SceneListSkill.outputFormat.type).toBe('text');
      expect(SceneListSkill.outputFormat.maxLength).toBe(500);
      expect(SceneListSkill.maxTokens).toBe(1000);
    });

    it('promptTemplate 应包含必要占位符', () => {
      expect(SceneListSkill.promptTemplate).toContain('{{sceneCount}}');
      expect(SceneListSkill.promptTemplate).toContain('{{summary}}');
      expect(SceneListSkill.promptTemplate).toContain('{{styleFullPrompt}}');
    });
  });

  describe('SceneDescriptionSkill', () => {
    it('应输出场景锚点（中英双语，JSON格式）', () => {
      expect(SceneDescriptionSkill.name).toBe('scene-description');
      expect(SceneDescriptionSkill.outputFormat.type).toBe('json');
      expect(SceneDescriptionSkill.outputFormat.maxLength).toBe(2000);
      expect(SceneDescriptionSkill.maxTokens).toBe(1000);
      expect(SceneDescriptionSkill.promptTemplate).toContain('scene');
      expect(SceneDescriptionSkill.promptTemplate).toContain('anchors');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{style}');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{current_scene_summary}');
      expect(SceneDescriptionSkill.promptTemplate).toContain('{prev_scene_summary}');
    });
  });

  describe('KeyframePromptSkill', () => {
    it('应输出九关键帧（KF0-KF8）且中英双语（JSON格式）', () => {
      expect(KeyframePromptSkill.name).toBe('keyframe-prompt');
      expect(KeyframePromptSkill.outputFormat.type).toBe('json');
      expect(KeyframePromptSkill.outputFormat.maxLength).toBe(15000);
      expect(KeyframePromptSkill.maxTokens).toBe(1500);
      expect(KeyframePromptSkill.promptTemplate).toContain('KF0');
      expect(KeyframePromptSkill.promptTemplate).toContain('KF1');
      expect(KeyframePromptSkill.promptTemplate).toContain('KF2');
      expect(KeyframePromptSkill.promptTemplate).toContain('KF8');
      expect(KeyframePromptSkill.promptTemplate).toContain('{scene_description}');
      expect(KeyframePromptSkill.promptTemplate).toContain('{characters}');
      expect(KeyframePromptSkill.promptTemplate).toContain('{style}');
    });

    it('promptTemplate 应强调静止与禁止连续过程词', () => {
      expect(KeyframePromptSkill.promptTemplate).toContain('定格瞬间');
      expect(KeyframePromptSkill.promptTemplate).toContain('禁止');
      expect(KeyframePromptSkill.promptTemplate).toContain('then/after');
    });
  });

  describe('MotionPromptSkill', () => {
    it('应基于九关键帧（KF0-KF8）差分输出运动提示词（短版+分拍版，中英双语，JSON格式）', () => {
      expect(MotionPromptSkill.name).toBe('motion-prompt');
      expect(MotionPromptSkill.outputFormat.type).toBe('json');
      expect(MotionPromptSkill.outputFormat.maxLength).toBe(2500);
      expect(MotionPromptSkill.maxTokens).toBe(1000);
      expect(MotionPromptSkill.promptTemplate).toContain('{scene_description}');
      expect(MotionPromptSkill.promptTemplate).toContain('{shot_prompt}');
      expect(MotionPromptSkill.promptTemplate).toContain('motion');
      expect(MotionPromptSkill.promptTemplate).toContain('beats');
      expect(MotionPromptSkill.promptTemplate).toContain('constraints');
    });
  });

  describe('DialogueSkill', () => {
    it('应包含关键帧与运动节拍输入，并保持可解析格式', () => {
      expect(DialogueSkill.name).toBe('dialogue');
      expect(DialogueSkill.outputFormat.maxLength).toBe(800);
      expect(DialogueSkill.maxTokens).toBe(900);
      expect(DialogueSkill.promptTemplate).toContain('{scene_summary}');
      expect(DialogueSkill.promptTemplate).toContain('{scene_description}');
      expect(DialogueSkill.promptTemplate).toContain('{shot_prompt}');
      expect(DialogueSkill.promptTemplate).toContain('{motion_prompt}');
      expect(DialogueSkill.promptTemplate).toContain('[类型|情绪]');
      expect(DialogueSkill.promptTemplate).toContain('[旁白]');
    });
  });
});

// ==========================================
// 注册表与查询函数测试
// ==========================================

describe('SkillRegistry', () => {
  it('应包含所有预定义技能', () => {
    expect(SkillRegistry.size).toBe(8);
    expect(SkillRegistry.get('scene-list')).toBe(SceneListSkill);
    expect(SkillRegistry.get('scene-description')).toBe(SceneDescriptionSkill);
    expect(SkillRegistry.get('action-description')).toBe(ActionDescriptionSkill);
    expect(SkillRegistry.get('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(SkillRegistry.get('motion-prompt')).toBe(MotionPromptSkill);
    expect(SkillRegistry.get('dialogue')).toBe(DialogueSkill);
    expect(SkillRegistry.get('character-basic-info')).toBe(CharacterBasicInfoSkill);
    expect(SkillRegistry.get('character-portrait-prompts')).toBe(CharacterPortraitSkill);
  });
});

describe('getSkillForTask', () => {
  it('应根据任务类型返回技能', () => {
    expect(getSkillForTask('scene-list')).toBe(SceneListSkill);
    expect(getSkillForTask('scene-description')).toBe(SceneDescriptionSkill);
    expect(getSkillForTask('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(getSkillForTask('motion-prompt')).toBe(MotionPromptSkill);
    expect(getSkillForTask('dialogue')).toBe(DialogueSkill);
  });

  it('未知任务类型返回 null', () => {
    expect(getSkillForTask('unknown-task')).toBeNull();
    expect(getSkillForTask('')).toBeNull();
  });
});

describe('getSkillByName', () => {
  it('应支持旧名称映射', () => {
    expect(getSkillByName('generate_scene_desc')).toBe(SceneDescriptionSkill);
    expect(getSkillByName('generate_keyframe_prompt')).toBe(KeyframePromptSkill);
    expect(getSkillByName('generate_motion_prompt')).toBe(MotionPromptSkill);
    expect(getSkillByName('generate_dialogue')).toBe(DialogueSkill);
  });

  it('应支持注册表键名', () => {
    expect(getSkillByName('scene-description')).toBe(SceneDescriptionSkill);
    expect(getSkillByName('keyframe-prompt')).toBe(KeyframePromptSkill);
    expect(getSkillByName('motion-prompt')).toBe(MotionPromptSkill);
  });

  it('未知名称返回 null', () => {
    expect(getSkillByName('unknown')).toBeNull();
    expect(getSkillByName('')).toBeNull();
  });
});

// ==========================================
// 边界/一致性测试
// ==========================================

describe('边界/一致性', () => {
  it('所有技能应符合 Skill 接口并具备必要字段', () => {
    SkillRegistry.forEach((skill: Skill) => {
      expect(skill.name).toBeDefined();
      expect(skill.description).toBeDefined();
      expect(skill.requiredContext.length).toBeGreaterThan(0);
      expect(skill.promptTemplate.length).toBeGreaterThan(0);
      expect(['text', 'json']).toContain(skill.outputFormat.type);
      expect(skill.maxTokens).toBeGreaterThanOrEqual(100);
      expect(skill.maxTokens).toBeLessThanOrEqual(10000);
      if (skill.outputFormat.maxLength !== undefined) {
        expect(skill.outputFormat.maxLength).toBeGreaterThan(0);
        expect(skill.outputFormat.maxLength).toBeLessThanOrEqual(20000);
      }
    });
  });

  it('技能 name 应唯一', () => {
    const names = new Set<string>();
    SkillRegistry.forEach((skill) => {
      expect(names.has(skill.name)).toBe(false);
      names.add(skill.name);
    });
  });

  it('模板占位符风格应保持一致', () => {
    expect(SceneListSkill.promptTemplate).toContain('{{');
    [SceneDescriptionSkill, KeyframePromptSkill, MotionPromptSkill, DialogueSkill].forEach(
      (skill) => {
        expect(skill.promptTemplate).toMatch(/\{[^{].*[^}]\}/);
      },
    );
  });
});

// ==========================================
// 台词解析测试
// ==========================================

describe('parseDialoguesFromText', () => {
  it('应解析对白/独白/旁白/心理', () => {
    const text = `[对白] 林默: 抱歉，我…
[独白] 苏浅: 我知道。
[旁白] 夕阳穿过百叶窗。
[心理] 林默: 运行错误。`;

    const dialogues = parseDialoguesFromText(text);
    expect(dialogues).toHaveLength(4);
    expect(dialogues[0].type).toBe('dialogue');
    expect(dialogues[0].characterName).toBe('林默');
    expect(dialogues[2].type).toBe('narration');
    expect(dialogues[2].characterName).toBeUndefined();
    expect(dialogues[3].type).toBe('thought');
  });

  it('应解析情绪标注', () => {
    const dialogues = parseDialoguesFromText('[对白|惊讶] 林默: 什么？');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].emotion).toBe('惊讶');
  });

  it('应将扩展元信息写入 notes', () => {
    const dialogues = parseDialoguesFromText('[对白|惊讶|t=1.0s|画外] 林默: 抱歉，我…');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].emotion).toBe('惊讶');
    expect(dialogues[0].notes).toBe('t=1.0s | 画外');
  });

  it('空文本返回空数组', () => {
    expect(parseDialoguesFromText('')).toEqual([]);
    expect(parseDialoguesFromText('   ')).toEqual([]);
  });

  it('无效行应被忽略', () => {
    const dialogues = parseDialoguesFromText(`这不是有效格式
[对白] 林默: 这才是有效的`);
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].characterName).toBe('林默');
  });
});
