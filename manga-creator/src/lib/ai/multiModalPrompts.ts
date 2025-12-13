// ==========================================
// 多模态提示词生成模块
// ==========================================
// 功能：
// 1. 音频/配音提示词生成（语调、情绪、声线）
// 2. BGM与音效标注（情绪氛围、乐器、节奏）
// 3. 分镜间转场指令（淡入淡出、推拉等）
// 
// 支持两种模式：
// - 规则引擎：快速、零延迟、可预测
// - AI智能生成：理解语义、更精准（带fallback）
// ==========================================

import { Scene, DialogueLine, Character, Skill, ChatMessage } from '@/types';
import { notifyAIFallback } from './progressBridge';

// ==========================================
// 类型定义
// ==========================================

/** 音频提示词 */
export interface AudioPrompt {
  /** 角色ID */
  characterId: string;
  /** 语调（如：energetic, calm, trembling） */
  voiceTone: string;
  /** 情绪（如：excited, sad, angry） */
  emotion: string;
  /** 声线风格（如：young male, narrator, introspective） */
  voiceStyle: string;
  /** 原文 */
  text: string;
}

/** BGM提示词 */
export interface BGMPrompt {
  /** 情绪氛围（如：hopeful, tense, melancholic） */
  mood: string;
  /** 音乐风格（如：orchestral, electronic, folk） */
  genre: string;
  /** 主要乐器列表 */
  instruments: string[];
  /** 节奏（如：fast, moderate, slow） */
  tempo: string;
  /** 音效列表 */
  soundEffects: string[];
}

/** 转场提示词 */
export interface TransitionPrompt {
  /** 转场类型（如：fade_in, dissolve, cut, wipe） */
  type: string;
  /** 持续时间（秒） */
  duration: number;
  /** 方向（可选，如：left, right, up, down） */
  direction?: string;
  /** 缓动效果（如：ease-in, ease-out, ease-in-out） */
  easing: string;
}

// ==========================================
// 情绪到语调映射
// ==========================================
const EMOTION_TO_VOICE_TONE: Record<string, string> = {
  '激动': 'energetic',
  '兴奋': 'energetic',
  '开心': 'cheerful',
  '快乐': 'cheerful',
  '悲伤': 'melancholic',
  '难过': 'sorrowful',
  '愤怒': 'aggressive',
  '生气': 'angry',
  '恐惧': 'trembling',
  '害怕': 'fearful',
  '平静': 'calm',
  '冷静': 'composed',
  '惊讶': 'surprised',
  '紧张': 'nervous',
  '温柔': 'gentle',
  '坚定': 'determined',
};

const EMOTION_TO_ENGLISH: Record<string, string> = {
  '激动': 'excited',
  '兴奋': 'excited',
  '开心': 'happy',
  '快乐': 'joyful',
  '悲伤': 'sad',
  '难过': 'sorrowful',
  '愤怒': 'angry',
  '生气': 'angry',
  '恐惧': 'fearful',
  '害怕': 'scared',
  '平静': 'calm',
  '冷静': 'composed',
  '惊讶': 'surprised',
  '紧张': 'nervous',
  '温柔': 'gentle',
  '坚定': 'determined',
};

// ==========================================
// 场景关键词到情绪映射
// ==========================================
const SCENE_MOOD_KEYWORDS: Record<string, string[]> = {
  hopeful: ['希望', '阳光', '开始', '冒险', '出发', '梦想'],
  tense: ['战斗', '追逐', '危险', '紧张', '对峙', '冲突'],
  melancholic: ['告别', '离别', '悲伤', '失去', '回忆', '孤独'],
  romantic: ['爱情', '浪漫', '约会', '表白', '心动'],
  epic: ['史诗', '决战', '命运', '宿敌', '最终'],
  mysterious: ['神秘', '未知', '黑暗', '秘密', '线索'],
  peaceful: ['平静', '日常', '休息', '宁静', '安详'],
};

const TEMPO_KEYWORDS: Record<string, string[]> = {
  fast: ['战斗', '追逐', '奔跑', '激战', '冲刺', '激烈'],
  slow: ['告别', '悲伤', '沉思', '回忆', '安静', '依依惜别'],
  moderate: ['对话', '行走', '日常', '探索'],
};

// ==========================================
// 音频提示词生成
// ==========================================

/**
 * 根据台词生成音频提示词
 */
export function generateAudioPrompt(dialogue: DialogueLine): AudioPrompt {
  const emotion = dialogue.emotion || '平静';
  const voiceTone = EMOTION_TO_VOICE_TONE[emotion] || 'neutral';
  const emotionEn = EMOTION_TO_ENGLISH[emotion] || 'neutral';
  
  // 根据台词类型确定声线风格
  let voiceStyle = 'natural';
  
  switch (dialogue.type) {
    case 'narration':
      voiceStyle = 'narrator, professional, clear';
      break;
    case 'thought':
      voiceStyle = 'introspective, soft, internal';
      break;
    case 'monologue':
      voiceStyle = 'dramatic, expressive';
      break;
    case 'dialogue':
    default:
      // 根据角色名判断声线（简单启发式）
      if (dialogue.characterName) {
        const name = dialogue.characterName;
        if (name.includes('老') || name.includes('爷') || name.includes('婆')) {
          voiceStyle = 'elderly, wise';
        } else if (name.includes('小') || name.includes('童') || name.includes('孩')) {
          voiceStyle = 'young, childlike';
        } else {
          voiceStyle = 'young male'; // 默认
        }
      }
      break;
  }

  return {
    characterId: dialogue.characterId || '',
    voiceTone,
    emotion: emotionEn,
    voiceStyle,
    text: dialogue.content,
  };
}

/**
 * 解析音频提示词文本
 */
export function parseAudioPrompt(promptText: string): AudioPrompt {
  const voiceMatch = promptText.match(/\[voice:\s*([^\]]+)\]/);
  const styleMatch = promptText.match(/\[style:\s*([^\]]+)\]/);
  
  // 移除所有方括号标记后提取文本
  const textOnly = promptText.replace(/\[[^\]]+\]/g, '').trim();
  
  let voiceTone = 'neutral';
  let emotion = 'neutral';
  
  if (voiceMatch) {
    const voiceParts = voiceMatch[1].split(',').map(s => s.trim());
    voiceTone = voiceParts[0] || 'neutral';
    emotion = voiceParts[1] || 'neutral';
  }

  return {
    characterId: '',
    voiceTone,
    emotion,
    voiceStyle: styleMatch ? styleMatch[1].trim() : 'natural',
    text: textOnly,
  };
}

// ==========================================
// BGM与音效提示词生成
// ==========================================

/**
 * 根据场景生成BGM提示词
 */
export function generateBGMPrompt(scene: Scene): BGMPrompt {
  const sceneText = `${scene.summary} ${scene.sceneDescription}`;
  
  // 分析情绪氛围
  let mood = 'neutral';
  for (const [moodType, keywords] of Object.entries(SCENE_MOOD_KEYWORDS)) {
    if (keywords.some(kw => sceneText.includes(kw))) {
      mood = moodType;
      break;
    }
  }
  
  // 分析节奏
  let tempo = 'moderate';
  for (const [tempoType, keywords] of Object.entries(TEMPO_KEYWORDS)) {
    if (keywords.some(kw => sceneText.includes(kw))) {
      tempo = tempoType;
      break;
    }
  }
  // 别名映射
  if (tempo === 'fast') tempo = 'allegro';
  if (tempo === 'slow') tempo = 'adagio';
  
  // 根据情绪选择音乐风格和乐器
  let genre = 'orchestral';
  let instruments: string[] = ['strings', 'brass'];
  
  switch (mood) {
    case 'epic':
      genre = 'orchestral epic';
      instruments = ['brass', 'timpani', 'strings', 'choir'];
      break;
    case 'melancholic':
      genre = 'emotional orchestral';
      instruments = ['piano', 'strings', 'cello'];
      break;
    case 'tense':
      genre = 'cinematic tension';
      instruments = ['percussion', 'strings', 'synthesizer'];
      break;
    case 'romantic':
      genre = 'romantic';
      instruments = ['piano', 'violin', 'harp'];
      break;
    case 'mysterious':
      genre = 'ambient dark';
      instruments = ['synthesizer', 'strings', 'low brass'];
      break;
    case 'peaceful':
      genre = 'ambient peaceful';
      instruments = ['piano', 'acoustic guitar', 'flute'];
      break;
  }
  
  // 提取音效
  const soundEffects: string[] = [];
  if (sceneText.includes('森林') || sceneText.includes('鸟')) {
    soundEffects.push('birds');
  }
  if (sceneText.includes('风') || sceneText.includes('树')) {
    soundEffects.push('wind');
  }
  if (sceneText.includes('雨')) {
    soundEffects.push('rain');
  }
  if (sceneText.includes('战斗') || sceneText.includes('剑')) {
    soundEffects.push('sword_clash');
  }
  if (sceneText.includes('脚步') || sceneText.includes('走')) {
    soundEffects.push('footsteps');
  }
  
  return {
    mood,
    genre,
    instruments,
    tempo,
    soundEffects,
  };
}

/**
 * 解析BGM提示词文本
 */
export function parseBGMPrompt(promptText: string): BGMPrompt {
  const moodMatch = promptText.match(/\[mood:\s*([^\]]+)\]/);
  const genreMatch = promptText.match(/\[genre:\s*([^\]]+)\]/);
  const tempoMatch = promptText.match(/\[tempo:\s*([^\]]+)\]/);
  const instrumentsMatch = promptText.match(/\[instruments:\s*([^\]]+)\]/);
  const sfxMatch = promptText.match(/\[sfx:\s*([^\]]+)\]/);

  return {
    mood: moodMatch ? moodMatch[1].trim() : 'neutral',
    genre: genreMatch ? genreMatch[1].trim() : 'orchestral',
    tempo: tempoMatch ? tempoMatch[1].trim() : 'moderate',
    instruments: instrumentsMatch 
      ? instrumentsMatch[1].split(',').map(s => s.trim()) 
      : [],
    soundEffects: sfxMatch 
      ? sfxMatch[1].split(',').map(s => s.trim()) 
      : [],
  };
}

// ==========================================
// 转场指令生成
// ==========================================

/**
 * 根据前后场景生成转场指令
 */
export function generateTransitionPrompt(
  prevScene: Scene,
  nextScene: Scene
): TransitionPrompt {
  const prevDesc = prevScene.sceneDescription.toLowerCase();
  const nextDesc = nextScene.sceneDescription.toLowerCase();
  const prevSummary = prevScene.summary;
  const nextSummary = nextScene.summary;
  
  // 默认值
  let type = 'cut';
  let duration = 0.3;
  let direction: string | undefined;
  let easing = 'ease-in-out';
  
  // 黑屏场景 -> 淡入（但要排除正常文本场景）
  const isPrevBlack = prevDesc.includes('黑屏') || (prevDesc === '' && prevSummary === '');
  if (isPrevBlack) {
    type = 'fade_in';
    duration = 1.0;
    easing = 'ease-out';
  }
  // -> 黑屏场景 -> 淡出
  else if (nextDesc.includes('黑屏') || nextDesc === '') {
    type = 'fade_to_black';
    duration = 1.0;
    easing = 'ease-in';
  }
  // 时间跳跃
  else if (
    nextSummary.includes('年后') || 
    nextSummary.includes('天后') ||
    nextSummary.includes('之后') ||
    /\d+年/.test(nextSummary)
  ) {
    type = 'fade_to_black';
    duration = 1.5;
    easing = 'ease-in-out';
  }
  // 动作场景连续
  else if (
    (prevSummary.includes('战斗') || prevSummary.includes('追逐')) &&
    (nextSummary.includes('战斗') || nextSummary.includes('追逐'))
  ) {
    type = 'cut';
    duration = 0.1;
    easing = 'linear';
  }
  // 场景切换（室内/室外变化）
  else if (
    (prevDesc.includes('室内') && nextDesc.includes('室外')) ||
    (prevDesc.includes('室外') && nextDesc.includes('室内'))
  ) {
    type = 'dissolve';
    duration = 0.8;
    easing = 'ease-in-out';
  }
  // 正常场景切换
  else {
    type = 'cross_dissolve';
    duration = 0.5;
  }

  const result: TransitionPrompt = {
    type,
    duration,
    easing,
  };
  
  if (direction) {
    result.direction = direction;
  }
  
  return result;
}

/**
 * 解析转场指令文本
 */
export function parseTransitionPrompt(promptText: string): TransitionPrompt {
  const typeMatch = promptText.match(/\[transition:\s*([^\]]+)\]/);
  const durationMatch = promptText.match(/\[duration:\s*([^\]]+)\]/);
  const directionMatch = promptText.match(/\[direction:\s*([^\]]+)\]/);
  const easingMatch = promptText.match(/\[easing:\s*([^\]]+)\]/);
  
  // 解析持续时间
  let duration = 0.5;
  if (durationMatch) {
    const durationStr = durationMatch[1].replace('s', '').trim();
    duration = parseFloat(durationStr) || 0.5;
  }

  const result: TransitionPrompt = {
    type: typeMatch ? typeMatch[1].trim() : 'cut',
    duration,
    easing: easingMatch ? easingMatch[1].trim() : 'ease-in-out',
  };
  
  if (directionMatch) {
    result.direction = directionMatch[1].trim();
  }
  
  return result;
}

// ==========================================
// AI Skill 定义
// ==========================================

/** 音频提示词生成技能 */
export const AudioPromptSkill: Skill = {
  name: 'audio-prompt',
  description: '根据台词和角色信息生成音频/配音提示词',
  requiredContext: ['dialogue_content', 'character_info'],
  promptTemplate: `你是一位专业的配音导演。根据以下台词和角色信息，生成配音指导。

## 台词内容
{dialogue_content}

## 角色信息
{character_info}

## 台词类型
{dialogue_type}

## 输出要求
请输出JSON格式，包含：
- voiceTone: 语调(如energetic, calm, trembling, aggressive)
- emotion: 情绪(如excited, sad, angry, fearful)
- voiceStyle: 声线风格(如young male, elderly wise, narrator professional)

直接输出JSON，不要额外解释。`,
  outputFormat: { type: 'json', maxLength: 200 },
  maxTokens: 300,
};

/** BGM提示词生成技能 */
export const BGMPromptSkill: Skill = {
  name: 'bgm-prompt',
  description: '根据场景信息生成BGM和音效提示词',
  requiredContext: ['scene_description', 'scene_summary', 'style'],
  promptTemplate: `你是一位专业的影视配乐师。根据以下场景信息，生成BGM和音效建议。

## 场景概要
{scene_summary}

## 场景锚点
{scene_description}

## 整体风格
{style}

## 输出要求
请输出JSON格式，包含：
- mood: 情绪氛围(如hopeful, tense, melancholic, epic, mysterious)
- genre: 音乐风格(如orchestral, electronic, folk, ambient)
- instruments: 主要乐器数组(如["piano", "strings", "brass"])
- tempo: 节奏(如allegro, moderate, adagio)
- soundEffects: 环境音效数组(如["birds", "wind", "footsteps"])

直接输出JSON，不要额外解释。`,
  outputFormat: { type: 'json', maxLength: 300 },
  maxTokens: 400,
};

/** 转场指令生成技能 */
export const TransitionPromptSkill: Skill = {
  name: 'transition-prompt',
  description: '根据前后场景生成转场指令',
  requiredContext: ['prev_scene', 'next_scene'],
  promptTemplate: `你是一位专业的影视剪辑师。根据前后两个场景，生成合适的转场指令。

## 前一场景
概要: {prev_scene_summary}
描述: {prev_scene}

## 后一场景
概要: {next_scene_summary}
描述: {next_scene}

## 转场类型参考
- cut: 硬切，适合连续动作
- dissolve/cross_dissolve: 溶解，适合场景切换
- fade_in: 淡入，适合开场
- fade_to_black: 淡出到黑，适合时间跳跃
- wipe: 擦除，适合并列叙事

## 输出要求
请输出JSON格式，包含：
- type: 转场类型
- duration: 持续时间(秒)
- easing: 缓动效果(如ease-in, ease-out, ease-in-out, linear)
- direction: 方向(可选，如left, right)

直接输出JSON，不要额外解释。`,
  outputFormat: { type: 'json', maxLength: 200 },
  maxTokens: 300,
};

// ==========================================
// AI 客户端接口（简化版）
// ==========================================
interface SimpleAIClient {
  chat: (messages: ChatMessage[]) => Promise<{ content: string }>;
}

// ==========================================
// AI 智能生成函数
// ==========================================

/**
 * AI生成音频提示词（带fallback）
 */
export async function generateAudioPromptWithAI(
  client: SimpleAIClient,
  dialogue: DialogueLine,
  character?: Character
): Promise<AudioPrompt> {
  try {
    const characterInfo = character 
      ? `角色名: ${character.name}\n性格: ${character.personality || '未设定'}`
      : `角色名: ${dialogue.characterName || '未知'}`;

    const dialogueTypeMap: Record<string, string> = {
      'dialogue': '对白',
      'monologue': '独白',
      'narration': '旁白',
      'thought': '内心独白',
    };

    const prompt = AudioPromptSkill.promptTemplate
      .replace('{dialogue_content}', dialogue.content)
      .replace('{character_info}', characterInfo)
      .replace('{dialogue_type}', dialogueTypeMap[dialogue.type] || '对白');

    const response = await client.chat([{ role: 'user', content: prompt }]);
    const parsed = JSON.parse(response.content);

    return {
      characterId: dialogue.characterId || '',
      voiceTone: parsed.voiceTone || 'neutral',
      emotion: parsed.emotion || 'neutral',
      voiceStyle: parsed.voiceStyle || 'natural',
      text: dialogue.content,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('音频提示词生成', err, '规则引擎');
    console.warn('AI生成音频提示词失败，回退到规则引擎:', error);
    return generateAudioPrompt(dialogue);
  }
}

/**
 * AI生成BGM提示词（带fallback）
 */
export async function generateBGMPromptWithAI(
  client: SimpleAIClient,
  scene: Scene,
  styleFullPrompt?: string
): Promise<BGMPrompt> {
  try {
    const prompt = BGMPromptSkill.promptTemplate
      .replace('{scene_summary}', scene.summary)
      .replace('{scene_description}', scene.sceneDescription)
      .replace('{style}', styleFullPrompt || '未指定');

    const response = await client.chat([{ role: 'user', content: prompt }]);
    const parsed = JSON.parse(response.content);

    return {
      mood: parsed.mood || 'neutral',
      genre: parsed.genre || 'orchestral',
      instruments: parsed.instruments || [],
      tempo: parsed.tempo || 'moderate',
      soundEffects: parsed.soundEffects || [],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('BGM提示词生成', err, '规则引擎');
    console.warn('AI生成BGM提示词失败，回退到规则引擎:', error);
    return generateBGMPrompt(scene);
  }
}

/**
 * AI生成转场指令（带fallback）
 */
export async function generateTransitionPromptWithAI(
  client: SimpleAIClient,
  prevScene: Scene,
  nextScene: Scene
): Promise<TransitionPrompt> {
  try {
    const prompt = TransitionPromptSkill.promptTemplate
      .replace('{prev_scene_summary}', prevScene.summary)
      .replace('{prev_scene}', prevScene.sceneDescription)
      .replace('{next_scene_summary}', nextScene.summary)
      .replace('{next_scene}', nextScene.sceneDescription);

    const response = await client.chat([{ role: 'user', content: prompt }]);
    const parsed = JSON.parse(response.content);

    const result: TransitionPrompt = {
      type: parsed.type || 'cut',
      duration: parsed.duration || 0.5,
      easing: parsed.easing || 'ease-in-out',
    };

    if (parsed.direction) {
      result.direction = parsed.direction;
    }

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    notifyAIFallback('转场指令生成', err, '规则引擎');
    console.warn('AI生成转场指令失败，回退到规则引擎:', error);
    return generateTransitionPrompt(prevScene, nextScene);
  }
}
