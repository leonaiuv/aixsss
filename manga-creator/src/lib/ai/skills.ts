import { Skill, DialogueLine, DialogueType } from '@/types';

// ==========================================
// Agent Skills 定义
// ==========================================

export const SceneListSkill: Skill = {
  name: 'scene-list-generator',
  description: '根据剧本生成分镜列表',
  requiredContext: ['project_essence'],
  promptTemplate: `你是一位专业的电影分镜师。请根据以下故事梗概，将其拆解为{{sceneCount}}个关键分镜。

故事梗概:{{summary}}
视觉风格:{{styleFullPrompt}}

请为每个分镜提供一个简短的概要描述（10-20字），格式如下：
1. [分镜概要]
2. [分镜概要]
...

注意：分镜应覆盖故事的起承转合，每个分镜是一个独立的画面或短序列。`,
  outputFormat: { type: 'text', maxLength: 500 },
  maxTokens: 1000,
};

export const SceneDescriptionSkill: Skill = {
  name: 'scene-description',
  description: '为单个分镜生成「场景锚点」提示词（仅环境一致性）',
  requiredContext: ['project_essence', 'current_scene_summary', 'prev_scene_summary'],
  promptTemplate: `你是专业的提示词工程师与分镜助理。请为“当前分镜”输出可复用的「场景锚点 Scene Anchor」，用于保证多张关键帧/多家图生视频的场景一致性。

## 输入
视觉风格参考（可轻量融入，不要堆砌质量词）:
{style}

当前分镜概要:
{current_scene_summary}

上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:
{prev_scene_summary}

## 重要约束（必须遵守）
1. 只描述“环境/空间/光线/固定锚点物”，不要出现人物、不要写角色代入、不要写动作、不要写镜头运动。
2. 用于一致性：输出里要包含 4-8 个可被稳定复现的锚点元素（具体物件/结构/光位），并在 LOCK_* 行里列出；词汇要稳定，不要同义改写。
3. 同时输出中文与英文两版，内容等价但不互相翻译腔。
4. 直接输出指定格式，不要解释。

## 输出格式（严格按行输出）
SCENE_ANCHOR_ZH: ...
SCENE_ANCHOR_EN: ...
LOCK_ZH: 1) ...; 2) ...; 3) ...; ...
LOCK_EN: 1) ...; 2) ...; 3) ...; ...
AVOID_ZH: ...（如：no people/no text/no watermark/不要新增场景元素）
AVOID_EN: ...`,
  outputFormat: { type: 'text', maxLength: 1500 },
  maxTokens: 800,
};

export const ActionDescriptionSkill: Skill = {
  name: 'action-description',
  description: '【已废弃】保留用于向后兼容',
  requiredContext: ['project_essence', 'current_scene_summary', 'confirmed_content'],
  promptTemplate: `请描述角色的动作。`,
  outputFormat: { type: 'text', maxLength: 150 },
  maxTokens: 400,
};

export const KeyframePromptSkill: Skill = {
  name: 'keyframe-prompt',
  description: '生成三张静止关键帧（起/中/终）的绘图提示词（中英双语）',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是专业的绘图/视频关键帧提示词工程师。请基于“场景锚点”与角色信息，输出 3 张「静止」关键帧提示词：KF0(起始) / KF1(中间) / KF2(结束)。

## 输入
场景锚点（环境一致性，包含 LOCK_*）:
{scene_description}

视觉风格参考（可融入，但避免堆砌“masterpiece/best quality/8k”等质量词）:
{style}

角色信息（请用稳定词汇锁定外观，不要每次换同义词）:
{characters}

## 关键规则（必须遵守）
1. 每个关键帧都是“定格瞬间”，禁止写连续过程词：then/after/starts to/slowly/gradually/随后/然后/开始/逐渐。
2. 禁止 walking/running/moving 等连续动作表达；允许用静态姿态词：standing/sitting/leaning/holding/hand raised/mid-air/frozen moment。
3. KF0/KF1/KF2 默认保持同一相机：景别+机位+角度+焦段+构图一致（除非剧情概要强制变镜头）。
4. 每个 KF 都要明确：人物在画面中的位置（left/right/foreground/background 或三分法）、与场景锚点物的相对关系、手部/道具状态。
5. 表情/情绪只有在“特写/表情镜头”才重点写；否则只轻描淡写。
6. 中英双语都要输出，并且每个 KF 的 ZH/EN 都是可直接用于生图的完整提示词。
7. 直接输出指定格式，不要解释。

## 输出格式（严格按行输出）
KF0_ZH: ...
KF0_EN: ...
KF1_ZH: ...
KF1_EN: ...
KF2_ZH: ...
KF2_EN: ...
AVOID_ZH: ...
AVOID_EN: ...`,
  outputFormat: { type: 'text', maxLength: 4000 },
  maxTokens: 1200,
};

export const MotionPromptSkill: Skill = {
  name: 'motion-prompt',
  description: '生成图生视频用的运动/时空提示词（基于三关键帧差分）',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是图生视频(I2V)提示词工程师。请基于「三张静止关键帧 KF0/KF1/KF2」生成“描述变化”的运动/时空提示词，用于多家视频模型。

## 输入
场景锚点（环境一致性）:
{scene_description}

三关键帧（静止描述，包含 KF0/KF1/KF2）:
{shot_prompt}

## 关键规则（必须遵守）
1. 只描述“从 KF0→KF1→KF2 发生了什么变化”，不要重述静态画面细节。
2. 变化分三类：人物变化 / 镜头变化 / 环境变化；每类最多 2 个要点，避免打架。
3. 给两种输出：短版（适配多数模型）+ 分拍版（0-1s/1-2s/2-3s）。
4. 输出中英双语；直接输出指定格式，不要解释。
5. 强约束必须写明：保持同一人物身份/脸/服装/发型/背景锚点不变；禁止凭空新增物体；禁止场景跳变；禁止文字水印。

## 输出格式（严格按行输出）
MOTION_SHORT_ZH: ...
MOTION_SHORT_EN: ...
MOTION_BEATS_ZH: 0-1s ...; 1-2s ...; 2-3s ...
MOTION_BEATS_EN: 0-1s ...; 1-2s ...; 2-3s ...
CONSTRAINTS_ZH: ...
CONSTRAINTS_EN: ...`,
  outputFormat: { type: 'text', maxLength: 2000 },
  maxTokens: 800,
};

export const DialogueSkill: Skill = {
  name: 'dialogue',
  description: '生成与关键帧/运动节拍一致的台词（可用于字幕/配音）',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是专业影视编剧。请基于分镜信息生成可直接用于字幕/配音的台词，确保与关键帧/运动节拍一致且简洁有力。

## 分镜概要
{scene_summary}

## 场景锚点（环境一致性）
{scene_description}

## 三关键帧（静止）
{shot_prompt}

## 运动/时空提示词（若已生成）
{motion_prompt}

## 场景中的角色
{characters}

## 台词类型说明
1. 对白: 角色之间的对话
2. 独白: 单个角色自言自语
3. 旁白: 无角色的画外音叙述
4. 心理: 角色的内心独白/思维活动

## 情绪标注（可选）
可用情绪：激动、兴奋、开心、快乐、悲伤、难过、愤怒、生气、恐惧、害怕、平静、冷静、惊讶、紧张、温柔、坚定

## 输出格式要求（必须可解析）
每条台词占一行，格式如下：
- 对白/独白/心理: [类型|情绪] 角色名: 台词内容
- 旁白: [旁白] 台词内容

补充约束：
1. 1-6 行即可，越短越好，但要贴合画面与动作节拍。
2. 如需标注时间点或画外/字幕提示，可把信息追加到情绪后面，用“|”分隔（保持可解析），示例：
   [对白|惊讶|t=1.0s|画外] 林默: 抱歉，我…
3. 只输出台词行，不要额外解释。`,
  outputFormat: { type: 'text', maxLength: 800 },
  maxTokens: 900,
};

// 技能注册表
export const SkillRegistry = new Map<string, Skill>([
  ['scene-list', SceneListSkill],
  ['scene-description', SceneDescriptionSkill],
  ['action-description', ActionDescriptionSkill],
  ['keyframe-prompt', KeyframePromptSkill],
  ['motion-prompt', MotionPromptSkill],
  ['dialogue', DialogueSkill],
]);

// 根据任务类型获取技能
export function getSkillForTask(taskType: string): Skill | null {
  return SkillRegistry.get(taskType) || null;
}

// 根据技能名称获取技能（兼容旧字段）
export function getSkillByName(skillName: string): Skill | null {
  const nameMap: Record<string, string> = {
    generate_scene_desc: 'scene-description',
    generate_action_desc: 'action-description',
    generate_keyframe_prompt: 'keyframe-prompt',
    generate_motion_prompt: 'motion-prompt',
    generate_scene_list: 'scene-list',
    generate_dialogue: 'dialogue',
  };

  const registryKey = nameMap[skillName] || skillName;
  return SkillRegistry.get(registryKey) || null;
}

// ==========================================
// 台词解析工具函数
// ==========================================

/** 台词类型映射 */
const DIALOGUE_TYPE_MAP: Record<string, DialogueType> = {
  对白: 'dialogue',
  独白: 'monologue',
  旁白: 'narration',
  心理: 'thought',
};

/**
 * 解析 AI 生成的台词文本为结构化数据
 * 支持格式:
 * - [对白|情绪] 角色名: 台词内容
 * - [独白|情绪] 角色名: 台词内容
 * - [旁白] 台词内容
 * - [心理|情绪] 角色名: 台词内容
 *
 * 兼容扩展:
 * - [对白|惊讶|t=1.0s|画外] 角色名: 台词内容
 */
export function parseDialoguesFromText(text: string): DialogueLine[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split('\n').filter((line) => line.trim());
  const dialogues: DialogueLine[] = [];
  let order = 0;

  for (const line of lines) {
    const match = line.match(
      /^\[(对白|独白|旁白|心理)(?:\|([^\]]+))?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/
    );

    if (!match) {
      continue;
    }

    order++;
    const [, typeLabel, rawMeta, characterName, content] = match;
    const type = DIALOGUE_TYPE_MAP[typeLabel];

    const dialogue: DialogueLine = {
      id: `dialogue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: content.trim(),
      order,
    };

    // 旁白通常没有角色名
    if (characterName && type !== 'narration') {
      dialogue.characterName = characterName.trim();
    }

    // 情绪/附加信息（t=.../画外等）
    if (rawMeta && type !== 'narration') {
      const parts = rawMeta
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);

      if (parts.length > 0) {
        dialogue.emotion = parts[0];
      }

      if (parts.length > 1) {
        dialogue.notes = parts.slice(1).join(' | ');
      }
    }

    dialogues.push(dialogue);
  }

  return dialogues;
}

