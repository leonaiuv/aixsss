import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateAudioPrompt,
  generateBGMPrompt,
  generateTransitionPrompt,
  parseAudioPrompt,
  parseBGMPrompt,
  parseTransitionPrompt,
  AudioPrompt,
  BGMPrompt,
  TransitionPrompt,
  // AI智能生成版本
  generateAudioPromptWithAI,
  generateBGMPromptWithAI,
  generateTransitionPromptWithAI,
  // Skills
  AudioPromptSkill,
  BGMPromptSkill,
  TransitionPromptSkill,
} from './multiModalPrompts';
import { Scene, DialogueLine, Character, ArtStyleConfig } from '@/types';
import { AIClient } from '@/types';

describe('MultiModalPrompts - 多模态提示词生成', () => {
  // 测试用模拟数据
  const mockDialogue: DialogueLine = {
    id: 'dl-1',
    characterId: 'char-1',
    characterName: '小明',
    content: '我一定要成为最强的冒险者！',
    type: 'dialogue',
    order: 1,
    emotion: '激动',
    notes: '',
  };

  const mockScene: Scene = {
    id: 'scene-1',
    projectId: 'project-1',
    order: 1,
    summary: '主角宣誓成为冒险者',
    sceneDescription: '阳光明媚的早晨，主角站在冒险者公会门前',
    actionDescription: '',
    shotPrompt: 'young adventurer standing in front of guild',
    motionPrompt: 'camera slowly zooms in',
    dialogues: [mockDialogue],
    status: 'completed',
    notes: '',
  };

  const mockPrevScene: Scene = {
    id: 'scene-0',
    projectId: 'project-1',
    order: 0,
    summary: '开场旁白',
    sceneDescription: '黑屏配合旁白',
    actionDescription: '',
    shotPrompt: '',
    motionPrompt: '',
    status: 'completed',
    notes: '',
  };

  // ==========================================
  // 音频提示词测试
  // ==========================================
  describe('音频提示词生成', () => {
    it('应该根据台词生成音频提示词', () => {
      const audioPrompt = generateAudioPrompt(mockDialogue);

      expect(audioPrompt).toHaveProperty('characterId', 'char-1');
      expect(audioPrompt).toHaveProperty('voiceTone'); // 语调
      expect(audioPrompt).toHaveProperty('emotion'); // 情绪
      expect(audioPrompt).toHaveProperty('voiceStyle'); // 声线风格
      expect(audioPrompt).toHaveProperty('text'); // 原文
    });

    it('不同情绪应该生成不同的语调提示', () => {
      const excitedDialogue = { ...mockDialogue, emotion: '激动' };
      const sadDialogue = { ...mockDialogue, emotion: '悲伤' };

      const excitedAudio = generateAudioPrompt(excitedDialogue);
      const sadAudio = generateAudioPrompt(sadDialogue);

      expect(excitedAudio.voiceTone).not.toBe(sadAudio.voiceTone);
    });

    it('旁白应该有独特的声线风格', () => {
      const narrationDialogue: DialogueLine = {
        ...mockDialogue,
        type: 'narration',
        characterName: '旁白',
      };

      const audioPrompt = generateAudioPrompt(narrationDialogue);

      expect(audioPrompt.voiceStyle).toContain('narrator');
    });

    it('内心独白应该有沉思感的声线', () => {
      const innerDialogue: DialogueLine = {
        ...mockDialogue,
        type: 'thought',
      };

      const audioPrompt = generateAudioPrompt(innerDialogue);

      expect(audioPrompt.voiceStyle).toContain('introspective');
    });

    it('应该正确解析音频提示词文本', () => {
      const promptText = '[voice: energetic, excited] [style: young male] 我一定要成为最强的冒险者！';
      const parsed = parseAudioPrompt(promptText);

      expect(parsed.voiceTone).toBe('energetic');
      expect(parsed.emotion).toBe('excited');
      expect(parsed.voiceStyle).toBe('young male');
      expect(parsed.text).toBe('我一定要成为最强的冒险者！');
    });
  });

  // ==========================================
  // BGM与音效提示词测试
  // ==========================================
  describe('BGM与音效提示词生成', () => {
    it('应该根据场景生成BGM提示词', () => {
      const bgmPrompt = generateBGMPrompt(mockScene);

      expect(bgmPrompt).toHaveProperty('mood'); // 情绪氛围
      expect(bgmPrompt).toHaveProperty('genre'); // 音乐风格
      expect(bgmPrompt).toHaveProperty('instruments'); // 主要乐器
      expect(bgmPrompt).toHaveProperty('tempo'); // 节奏
      expect(bgmPrompt).toHaveProperty('soundEffects'); // 音效列表
    });

    it('激动场景应该使用快节奏音乐', () => {
      const actionScene: Scene = {
        ...mockScene,
        summary: '激烈的战斗场景',
        sceneDescription: '主角与敌人展开激战',
      };

      const bgmPrompt = generateBGMPrompt(actionScene);

      expect(['fast', 'allegro', 'vivace']).toContain(bgmPrompt.tempo);
    });

    it('悲伤场景应该使用慢节奏音乐', () => {
      const sadScene: Scene = {
        ...mockScene,
        summary: '告别场景',
        sceneDescription: '主角与伙伴依依惜别',
      };

      const bgmPrompt = generateBGMPrompt(sadScene);

      expect(['slow', 'adagio', 'lento']).toContain(bgmPrompt.tempo);
    });

    it('应该包含场景相关的音效', () => {
      const forestScene: Scene = {
        ...mockScene,
        sceneDescription: '茂密的森林中，鸟鸣声此起彼伏',
      };

      const bgmPrompt = generateBGMPrompt(forestScene);

      expect(bgmPrompt.soundEffects.length).toBeGreaterThan(0);
    });

    it('应该正确解析BGM提示词文本', () => {
      const promptText = '[mood: hopeful] [genre: orchestral] [tempo: moderate] [instruments: strings, brass] [sfx: birds, wind]';
      const parsed = parseBGMPrompt(promptText);

      expect(parsed.mood).toBe('hopeful');
      expect(parsed.genre).toBe('orchestral');
      expect(parsed.tempo).toBe('moderate');
      expect(parsed.instruments).toContain('strings');
      expect(parsed.soundEffects).toContain('birds');
    });
  });

  // ==========================================
  // 转场指令测试
  // ==========================================
  describe('转场指令生成', () => {
    it('应该根据前后场景生成转场指令', () => {
      const transition = generateTransitionPrompt(mockPrevScene, mockScene);

      expect(transition).toHaveProperty('type'); // 转场类型
      expect(transition).toHaveProperty('duration'); // 持续时间
      // direction 是可选的
      expect(transition).toHaveProperty('easing'); // 缓动效果
    });

    it('黑屏到正常场景应该使用淡入', () => {
      const blackScene: Scene = {
        ...mockPrevScene,
        sceneDescription: '黑屏',
      };

      const transition = generateTransitionPrompt(blackScene, mockScene);

      expect(transition.type).toBe('fade_in');
    });

    it('场景切换应该使用切换或溶解', () => {
      const normalScene1: Scene = {
        ...mockPrevScene,
        sceneDescription: '室内场景',
      };
      const normalScene2: Scene = {
        ...mockScene,
        sceneDescription: '室外场景',
      };

      const transition = generateTransitionPrompt(normalScene1, normalScene2);

      expect(['cut', 'dissolve', 'cross_dissolve']).toContain(transition.type);
    });

    it('时间跳跃应该使用特殊转场', () => {
      const scene1: Scene = {
        ...mockPrevScene,
        summary: '第一天的冒险',
        sceneDescription: '主角开始了旅程',
      };
      const scene2: Scene = {
        ...mockScene,
        summary: '三年后',
        sceneDescription: '主角已经成长',
      };

      const transition = generateTransitionPrompt(scene1, scene2);

      expect(['wipe', 'iris', 'fade_to_black']).toContain(transition.type);
    });

    it('动作场景应该使用快速切换', () => {
      const actionScene1: Scene = {
        ...mockPrevScene,
        summary: '追逐战第一段',
        sceneDescription: '主角在街道上奔跑',
      };
      const actionScene2: Scene = {
        ...mockScene,
        summary: '追逐战第二段',
        sceneDescription: '主角翻越障碍',
      };

      const transition = generateTransitionPrompt(actionScene1, actionScene2);

      expect(transition.duration).toBeLessThanOrEqual(0.5); // 快速切换
    });

    it('应该正确解析转场指令文本', () => {
      const promptText = '[transition: dissolve] [duration: 1.5s] [direction: left] [easing: ease-in-out]';
      const parsed = parseTransitionPrompt(promptText);

      expect(parsed.type).toBe('dissolve');
      expect(parsed.duration).toBe(1.5);
      expect(parsed.direction).toBe('left');
      expect(parsed.easing).toBe('ease-in-out');
    });
  });

  // ==========================================
  // 类型定义测试
  // ==========================================
  describe('类型定义验证', () => {
    it('AudioPrompt应该包含所有必需字段', () => {
      const audioPrompt: AudioPrompt = {
        characterId: 'char-1',
        voiceTone: 'energetic',
        emotion: 'excited',
        voiceStyle: 'young male',
        text: '测试文本',
      };

      expect(audioPrompt.characterId).toBeDefined();
      expect(audioPrompt.voiceTone).toBeDefined();
      expect(audioPrompt.emotion).toBeDefined();
      expect(audioPrompt.voiceStyle).toBeDefined();
      expect(audioPrompt.text).toBeDefined();
    });

    it('BGMPrompt应该包含所有必需字段', () => {
      const bgmPrompt: BGMPrompt = {
        mood: 'hopeful',
        genre: 'orchestral',
        instruments: ['strings', 'brass'],
        tempo: 'moderate',
        soundEffects: ['birds'],
      };

      expect(bgmPrompt.mood).toBeDefined();
      expect(bgmPrompt.genre).toBeDefined();
      expect(bgmPrompt.instruments).toBeInstanceOf(Array);
      expect(bgmPrompt.tempo).toBeDefined();
      expect(bgmPrompt.soundEffects).toBeInstanceOf(Array);
    });

    it('TransitionPrompt应该包含所有必需字段', () => {
      const transition: TransitionPrompt = {
        type: 'dissolve',
        duration: 1.5,
        easing: 'ease-in-out',
      };

      expect(transition.type).toBeDefined();
      expect(transition.duration).toBeDefined();
      expect(transition.easing).toBeDefined();
    });
  });

  // ==========================================
  // AI Skill定义测试
  // ==========================================
  describe('AI Skill定义', () => {
    it('AudioPromptSkill应有正确的结构', () => {
      expect(AudioPromptSkill.name).toBe('audio-prompt');
      expect(AudioPromptSkill.promptTemplate).toContain('{dialogue_content}');
      expect(AudioPromptSkill.promptTemplate).toContain('{character_info}');
    });

    it('BGMPromptSkill应有正确的结构', () => {
      expect(BGMPromptSkill.name).toBe('bgm-prompt');
      expect(BGMPromptSkill.promptTemplate).toContain('{scene_description}');
      expect(BGMPromptSkill.promptTemplate).toContain('{scene_summary}');
    });

    it('TransitionPromptSkill应有正确的结构', () => {
      expect(TransitionPromptSkill.name).toBe('transition-prompt');
      expect(TransitionPromptSkill.promptTemplate).toContain('{prev_scene}');
      expect(TransitionPromptSkill.promptTemplate).toContain('{next_scene}');
    });
  });

  // ==========================================
  // AI智能生成测试
  // ==========================================
  describe('AI智能生成', () => {
    // Mock AI客户端
    const mockAIClient = {
      chat: vi.fn(),
      streamChat: vi.fn(),
      providerName: 'test',
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('应该调用AI生成音频提示词', async () => {
      mockAIClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          voiceTone: 'energetic',
          emotion: 'excited', 
          voiceStyle: 'young heroic male',
        }),
      });

      const mockCharacter: Partial<Character> = {
        id: 'char-1',
        name: '小明',
        personality: '勇敢、热血',
      };

      const result = await generateAudioPromptWithAI(
        mockAIClient as any,
        mockDialogue,
        mockCharacter as Character
      );

      expect(mockAIClient.chat).toHaveBeenCalledTimes(1);
      expect(result.voiceTone).toBe('energetic');
      expect(result.emotion).toBe('excited');
    });

    it('应该调用AI生成BGM提示词', async () => {
      mockAIClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          mood: 'hopeful',
          genre: 'orchestral adventure',
          instruments: ['strings', 'brass', 'timpani'],
          tempo: 'allegro',
          soundEffects: ['crowd_murmur', 'door_creak'],
        }),
      });

      const result = await generateBGMPromptWithAI(
        mockAIClient as any,
        mockScene,
        '奇幻冒险风格'
      );

      expect(mockAIClient.chat).toHaveBeenCalledTimes(1);
      expect(result.mood).toBe('hopeful');
      expect(result.instruments).toContain('strings');
    });

    it('应该调用AI生成转场指令', async () => {
      mockAIClient.chat.mockResolvedValueOnce({
        content: JSON.stringify({
          type: 'dissolve',
          duration: 0.8,
          easing: 'ease-in-out',
          reason: '场景切换使用溶解过渡',
        }),
      });

      const result = await generateTransitionPromptWithAI(
        mockAIClient as any,
        mockPrevScene,
        mockScene
      );

      expect(mockAIClient.chat).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('dissolve');
      expect(result.duration).toBe(0.8);
    });

    it('AI生成失败时应回退到规则引擎', async () => {
      mockAIClient.chat.mockRejectedValueOnce(new Error('API Error'));

      const result = await generateBGMPromptWithAI(
        mockAIClient as any,
        mockScene,
        '奇幻风格'
      );

      // 应该回退到规则引擎结果
      expect(result.mood).toBeDefined();
      expect(result.genre).toBeDefined();
    });
  });
});
