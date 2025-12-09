import { Skill, DialogueLine, DialogueType } from '@/types';

// ==========================================
// Agent Skills定义
// ==========================================

export const SceneListSkill: Skill = {
  name: 'scene-list-generator',
  description: '根据剧本生成分镜列表',
  requiredContext: ['project_essence'],
  promptTemplate: `你是一位专业的电影分镜师。请根据以下故事梗概,将其拆解为{{sceneCount}}个关键分镜。

故事梗概:{{summary}}
视觉风格:{{styleFullPrompt}}

请为每个分镜提供一个简短的概要描述(10-20字),格式如下:
1. [分镜概要]
2. [分镜概要]
...

注意:分镜应该涵盖故事的起承转合,每个分镜是一个独立的画面或短序列。`,
  outputFormat: { type: 'text', maxLength: 500 },
  maxTokens: 1000,
};

export const SceneDescriptionSkill: Skill = {
  name: 'scene-description',
  description: '为单个分镜生成详细的场景描述',
  requiredContext: ['project_essence', 'current_scene_summary', 'prev_scene_summary'],
  promptTemplate: `你是一位专业的电影分镜师。请为以下分镜生成详细的场景描述。

## 项目信息
视觉风格: {style}
主角特征: {protagonist}

## 当前分镜
分镜概要: {current_scene_summary}
前一分镜: {prev_scene_summary}

## 输出要求
请描述:
1. 场景的空间环境(室内/室外、地点特征)
2. 光线和氛围
3. 关键道具或背景元素
4. 镜头构图建议

直接输出场景描述,200字以内。`,
  outputFormat: { type: 'text', maxLength: 200 },
  maxTokens: 500,
};

export const ActionDescriptionSkill: Skill = {
  name: 'action-description',
  description: '【已废弃】保留用于向后兼容',
  requiredContext: ['project_essence', 'current_scene_summary', 'confirmed_content'],
  promptTemplate: `请描述角色的动作。`,
  outputFormat: { type: 'text', maxLength: 150 },
  maxTokens: 400,
};

// 关键帧提示词技能 - 专注静态图片描述
export const KeyframePromptSkill: Skill = {
  name: 'keyframe-prompt',
  description: '生成静态关键帧图片描述，用于绘图AI',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是一位专业AI绘图提示词专家。根据以下场景信息，生成一段高质量的「静态关键帧」描述。

## 场景信息
{scene_description}

## 视觉风格
{style}

## 主角特征
{protagonist}

## 要求
1. 专注于「静态画面」描述，如同单幅照片/绘画
2. 内容包含: 人物姿态、表情、场景环境、光线氛围、构图角度
3. 禁止动态词汇: 不要使用walking/running/moving等动作词
4. 使用静态表述: standing/sitting/leaning/holding等姿态词
5. 英文输出，简洁精准，逗号分隔
6. 将视觉风格融入描述中
7. 末尾添加画质词: masterpiece, best quality, highly detailed
8. 添加参数: --ar 16:9

直接输出提示词，不要额外解释。`,
  outputFormat: { type: 'text', maxLength: 300 },
  maxTokens: 500,
};

// 时空提示词技能 - 动作/镜头/变化，给视频AI
export const MotionPromptSkill: Skill = {
  name: 'motion-prompt',
  description: '生成时空提示词，包含动作、镜头控制、场面变化',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是一位视频生成AI提示词专家。根据场景信息，生成用于视频生成的「时空提示词」。

## 场景信息
{scene_description}

## 要求
1. 描述「动态变化」，用于将静态关键帧转化为视频
2. 包含三类元素:
   - 动作: 简单动词(walks, turns, smiles, reaches)
   - 镜头: pan left/right, zoom in/out, tracking shot, dolly
   - 场面变化: light changes, wind blows, leaves falling
3. 「极简」: 总词数控制在15-25词以内
4. 英文输出，逗号分隔
5. 避免过度描述，保持可控性

示例输出:
character slowly turns head, gentle smile, camera zooms in, soft light shifts

直接输出时空提示词，不要额外解释。`,
  outputFormat: { type: 'text', maxLength: 100 },
  maxTokens: 200,
};

// 台词生成技能 - 对白/独白/旁白/心理活动
export const DialogueSkill: Skill = {
  name: 'dialogue',
  description: '生成符合分镜内容的台词，包含对白、独白、旁白、心理活动',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是一位专业的影视编剧。根据以下场景信息，为这个分镜生成合适的台词。

## 分镜概要
{scene_summary}

## 场景描述
{scene_description}

## 场景中的角色
{characters}

## 台词类型说明
1. 对白: 角色之间的对话
2. 独白: 单个角色对观众/镜头说话
3. 旁白: 无角色的画外音/无声音叙述
4. 心理: 角色的内心独白/思维活动

## 情绪标注说明
可用情绪: 激动、兴奋、开心、快乐、悲伤、难过、愤怒、生气、恐惧、害怕、平静、冷静、惊讶、紧张、温柔、坚定

## 输出格式要求
每条台词占一行，格式如下:
- 对白/独白/心理: [类型|情绪] 角色名: 台词内容
- 旁白: [旁白] 台词内容

示例:
[对白|开心] 小明: 你好，今天天气真好！
[对白|温柔] 小红: 是啊，适合出去走走。
[旁白] 两人相视而笑。
[心理|激动] 小明: 她的笑容真美。

## 要求
1. 台词要简洁有力，符合角色性格
2. 符合场景氛围和情节发展
3. 一个分镜通常只需1-5条台词
4. 中文输出
5. 直接输出台词，不要额外解释
6. 每条台词必须标注情绪（旁白除外）`,
  outputFormat: { type: 'text', maxLength: 500 },
  maxTokens: 800,
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

// 根据技能名称获取技能
export function getSkillByName(skillName: string): Skill | null {
  const nameMap: Record<string, string> = {
    'generate_scene_desc': 'scene-description',
    'generate_action_desc': 'action-description',
    'generate_keyframe_prompt': 'keyframe-prompt',
    'generate_motion_prompt': 'motion-prompt',
    'generate_scene_list': 'scene-list',
    'generate_dialogue': 'dialogue',
  };
  
  const registryKey = nameMap[skillName] || skillName;
  return SkillRegistry.get(registryKey) || null;
}

// ==========================================
// 台词解析工具函数
// ==========================================

/** 台词类型映射 */
const DIALOGUE_TYPE_MAP: Record<string, DialogueType> = {
  '对白': 'dialogue',
  '独白': 'monologue',
  '旁白': 'narration',
  '心理': 'thought',
};

/**
 * 解析AI生成的台词文本为结构化数据
 * 支持格式:
 * - [对白|情绪] 角色名: 台词内容
 * - [独白|情绪] 角色名: 台词内容
 * - [旁白] 台词内容
 * - [心理|情绪] 角色名: 台词内容
 * 也兼容旧格式（无情绪）:
 * - [对白] 角色名: 台词内容
 */
export function parseDialoguesFromText(text: string): DialogueLine[] {
  if (!text || !text.trim()) {
    return [];
  }

  const lines = text.split('\n').filter(line => line.trim());
  const dialogues: DialogueLine[] = [];
  let order = 0;

  for (const line of lines) {
    // 匹配格式: [类型|情绪] 角色名: 内容 或 [类型] 角色名: 内容 或 [类型] 内容
    const match = line.match(/^\[(对白|独白|旁白|心理)(?:\|([^\]]+))?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/);
    
    if (match) {
      order++;
      const [, typeLabel, emotion, characterName, content] = match;
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

      // 添加情绪标注
      if (emotion && type !== 'narration') {
        dialogue.emotion = emotion.trim();
      }

      dialogues.push(dialogue);
    }
  }

  return dialogues;
}
