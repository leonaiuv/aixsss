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
  description: '为单个分镜生成「场景锚点」提示词（仅环境一致性，JSON格式）',
  requiredContext: ['project_essence', 'current_scene_summary', 'prev_scene_summary'],
  promptTemplate: `你是专业的提示词工程师与分镜助理。请为"当前分镜"输出可复用的「场景锚点 Scene Anchor」JSON，用于保证多张关键帧/多家图生视频的场景一致性。

## 输入
视觉风格参考（可轻量融入，不要堆砌质量词）:
{style}

当前分镜概要:
{current_scene_summary}

上一分镜概要（仅用于理解衔接，不要把人物/动作写进场景锚点）:
{prev_scene_summary}

## 重要约束（必须遵守）
1. 只描述"环境/空间/光线/固定锚点物"，绝对不要出现人物、不要写角色代入、不要写动作、不要写镜头运动。
2. anchors 数组里要包含 4-8 个可被稳定复现的锚点元素（具体物件/结构/光位）；词汇要稳定，不要同义改写。
3. 同时输出中文与英文两版，内容等价但不互相翻译腔。
4. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "scene": {
    "zh": "场景整体描述（一段话，60-120字）",
    "en": "Overall scene description (one paragraph)"
  },
  "location": {
    "type": "室内/室外/虚拟空间",
    "name": "具体地点名称",
    "details": "空间结构与布局细节"
  },
  "lighting": {
    "type": "自然光/人工光/混合光",
    "direction": "光源方向（如：左上45°/正面柔光/背光剪影）",
    "color": "光线色温或颜色（如：暖黄色/冷白色/金色夕阳）",
    "intensity": "光照强度描述（如：柔和/强烈/昏暗）"
  },
  "atmosphere": {
    "mood": "氛围情绪基调",
    "weather": "天气状况（室内可写'不适用'）",
    "timeOfDay": "时间段（如：黄昏/深夜/正午）"
  },
  "anchors": {
    "zh": ["锚点物1", "锚点物2", "锚点物3", "...（4-8个）"],
    "en": ["anchor1", "anchor2", "anchor3", "..."]
  },
  "avoid": {
    "zh": "不要出现的元素（如：人物、文字、水印、多余物体）",
    "en": "Elements to avoid (e.g., people, text, watermark, extra objects)"
  }
}`,
  outputFormat: { type: 'json', maxLength: 2000 },
  maxTokens: 1000,
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
  description:
    '生成九宫格电影分镜 JSON（storyboard_config + shots + technical_requirements）',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是一位专业的电影分镜师和提示词工程师。请根据输入内容生成适用于 Nano Banana Pro 的九宫格电影分镜 JSON。

## 输入
当前分镜内容:
{current_scene_summary}

场景锚点 JSON（环境一致性）:
{scene_description}

视觉风格参考:
{style}

出场角色（仅用于点名，不要写长外观描述，角色外观由定妆照资产保证）:
{characters}

## 关键规则（必须遵守）
1. shots 必须严格固定为 9 条，顺序必须为 ELS→LS→MLS→MS→MCU→CU→ECU→Low Angle→High Angle，不可调换。
2. 分镜1-3 建立环境；分镜4-6 人物情绪；分镜7-9 戏剧张力。
3. 每个 description 必须包含：画面内容 + 光影 + 氛围；描述用中文，type/angle/focus 保留英文术语。
4. visual_anchor.character 一旦定义，9 格主角外观不得改变；光线与色调保持一致。
5. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "storyboard_config": {
    "layout": "3x3_grid",
    "aspect_ratio": "16:9",
    "style": "cinematic_sci_fi/wuxia_fantasy/modern_thriller/historical_drama",
    "visual_anchor": {
      "character": "主角外貌+服装+标志性特征（中文）",
      "environment": "场景环境+光线+色调（中文）",
      "lighting": "灯光风格",
      "mood": "整体情绪氛围"
    }
  },
  "shots": [
    { "shot_number": "分镜1", "type": "ELS", "type_cn": "大远景", "description": "...", "angle": "Eye level", "focus": "建立环境" },
    { "shot_number": "分镜2", "type": "LS", "type_cn": "远景", "description": "...", "angle": "Eye level", "focus": "动作展示" },
    { "shot_number": "分镜3", "type": "MLS", "type_cn": "中远景", "description": "...", "angle": "Slight low angle", "focus": "人物关系" },
    { "shot_number": "分镜4", "type": "MS", "type_cn": "中景", "description": "...", "angle": "Eye level", "focus": "肢体语言" },
    { "shot_number": "分镜5", "type": "MCU", "type_cn": "中近景", "description": "...", "angle": "Slight high angle", "focus": "情绪表达" },
    { "shot_number": "分镜6", "type": "CU", "type_cn": "近景", "description": "...", "angle": "Straight on", "focus": "眼神细节" },
    { "shot_number": "分镜7", "type": "ECU", "type_cn": "特写", "description": "...", "angle": "Macro", "focus": "关键道具" },
    { "shot_number": "分镜8", "type": "Low Angle", "type_cn": "仰拍", "description": "...", "angle": "Extreme low angle", "focus": "权力关系" },
    { "shot_number": "分镜9", "type": "High Angle", "type_cn": "俯拍", "description": "...", "angle": "Top-down", "focus": "上帝视角" }
  },
  "technical_requirements": {
    "consistency": "ABSOLUTE: Same character face, same costume, same lighting across all 9 panels",
    "composition": "Label '分镜X' top-left corner, no timecode, cinematic 2.39:1 ratio",
    "quality": "Photorealistic, 8K, film grain"
  }
}`,
  outputFormat: { type: 'json', maxLength: 15000 },
  maxTokens: 1500,
};

export const MotionPromptSkill: Skill = {
  name: 'motion-prompt',
  description: '生成图生视频用的运动/时空提示词 JSON（基于九宫格 shots 差分）',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是图生视频(I2V)提示词工程师。请基于「九宫格静止分镜 shots[分镜1-分镜9]」生成"描述变化"的运动/时空提示词JSON，用于多家视频模型。

## 输入
场景锚点 JSON:
{scene_description}

9宫格分镜 JSON（静止描述，包含 shots[分镜1-分镜9]）:
{shot_prompt}

## 关键规则（必须遵守）
1. 只描述"从 分镜1→…→分镜9 发生了什么变化"，不要重述静态画面细节。
2. 变化分三类：主体变化（人物/物品）/ 镜头变化 / 环境变化；每类最多 2 个要点，避免打架。
3. 给两种输出：短版（适配多数模型）+ 分拍版（0-1s/1-2s/2-3s 时间节拍）。
4. 强约束必须写明：保持同一人物身份/脸/服装/发型/背景锚点不变；禁止凭空新增物体；禁止场景跳变；禁止文字水印。
5. 只输出 JSON，不要代码块、不要解释、不要多余文字。

## 输出格式（严格 JSON）
{
  "motion": {
    "short": {
      "zh": "简短运动描述（一句话概括整体变化，20-40字）",
      "en": "Short motion description (one sentence summarizing overall change)"
    },
    "beats": {
      "zh": {
        "0-1s": "第一秒内的变化描述",
        "1-2s": "第二秒内的变化描述",
        "2-3s": "第三秒内的变化描述"
      },
      "en": {
        "0-1s": "Changes in first second",
        "1-2s": "Changes in second second",
        "2-3s": "Changes in third second"
      }
    }
  },
  "changes": {
    "subject": {
      "zh": ["主体变化1（如：角色A从坐姿站起）", "主体变化2"],
      "en": ["Subject change 1", "Subject change 2"]
    },
    "camera": {
      "zh": ["镜头变化（如：轻微推进/保持静止）"],
      "en": ["Camera change"]
    },
    "environment": {
      "zh": ["环境变化（如：窗帘轻微飘动/光线渐暗）"],
      "en": ["Environment change"]
    }
  },
  "constraints": {
    "zh": "约束条件（如：保持人物身份一致、背景锚点不变、禁止新增物体、禁止场景跳变、禁止文字水印）",
    "en": "Constraints (e.g., maintain character identity, keep background anchors unchanged, no new objects, no scene jumps, no text/watermark)"
  }
}`,
  outputFormat: { type: 'json', maxLength: 2500 },
  maxTokens: 1000,
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

## 9关键帧（静止）
{shot_prompt}

## 运动/时空提示词（若已生成）
{motion_prompt}

## 场景中的角色
{characters_story}

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
1. 仅允许使用已勾选出场角色，不得引入未列出的角色。
2. 1-6 行即可，越短越好，但要贴合画面与动作节拍。
3. 如需标注时间点或画外/字幕提示，可把信息追加到情绪后面，用“|”分隔（保持可解析），示例：
   [对白|惊讶|t=1.0s|画外] 林默: 抱歉，我…
4. 只输出台词行，不要额外解释。`,
  outputFormat: { type: 'text', maxLength: 800 },
  maxTokens: 900,
};

export const CharacterBasicInfoSkill: Skill = {
  name: 'character-basic-info',
  description: '根据简短描述与项目设定生成完整角色卡（外观/性格/背景/配色）',
  requiredContext: ['project_essence', 'character_info'],
  promptTemplate: `你是一位专业的漫画/动画角色设计师。请基于“角色简述”与“项目设定”，生成一个符合故事世界观与画风的角色设定卡。

## 项目设定（必须遵守，不要自相矛盾）
故事梗概:
{summary}

主角设定（用于确定气质与叙事风格）:
{protagonist}

世界观（如果为空表示未启用/未填写）:
{worldview}

视觉风格参考（可融入但避免堆砌质量词）:
{style}

已存在角色（避免撞设定/撞外观，可参考其命名风格与叙事基调）:
{characters_story}

## 角色简述（用户输入）
{briefDescription}

## 输出要求
1) “外观描述”必须可视化：年龄/体型/发型发色/眼睛/服装/配饰/独特识别点（让绘图能稳定复现同一人）。
2) “性格特点”要可演：沟通方式/情绪表达/价值观/弱点与反差。
3) “背景故事”要与项目设定挂钩：出身/关键事件/动机目标（给后续剧情和台词用）。
4) 同一角色要有稳定的“视觉锚点词汇”，避免大量同义改写（尤其是发型、衣着、关键饰品）。
5) 给出推荐配色：primaryColor/secondaryColor 必须是 #RRGGBB（用于后续提示词一致性）。

## 输出格式（严格 JSON；只输出 JSON，不要代码块/解释）
{
  "name": "角色名称",
  "appearance": "外观描述（建议 120-220 字）",
  "personality": "性格特点（建议 80-160 字）",
  "background": "背景故事（建议 160-280 字）",
  "primaryColor": "#RRGGBB",
  "secondaryColor": "#RRGGBB"
}`,
  outputFormat: { type: 'json', maxLength: 4000 },
  maxTokens: 1200,
};

export const CharacterPortraitSkill: Skill = {
  name: 'character-portrait-prompts',
  description: '生成角色定妆照提示词JSON（MJ/SD/通用），用于角色一致性参考图',
  requiredContext: ['project_essence', 'character_info', 'style'],
  promptTemplate: `你是专业的 AI 绘图提示词工程师。请为下述角色生成"定妆照（全身、白底）"提示词JSON，用于后续分镜生成时锁定同一人物身份。

## 画风（可融入，不要堆砌质量词）
{style}

## 世界观（用于服装/道具/质感，但不要把剧情写进定妆照）
{worldview}

## 角色信息（必须锁定外观关键词，避免同义改写）
{characterName}
{characterAppearance}

配色参考（如果为空可忽略）:
primaryColor={primaryColor}
secondaryColor={secondaryColor}

## 定妆照要求
- 单人、全身、正面或 3/4 站姿，纯白背景
- 强调外观锚点（发型/发色/服装关键件/配饰/体态/表情气质）
- 禁止新增其他人物/文字水印/多余物体
- 只输出 JSON，不要代码块、不要解释、不要多余文字

## 输出格式（严格 JSON）
{
  "portrait": {
    "framing": "全身/半身",
    "pose": "站姿描述（如：正面站立/3/4侧身/双手自然下垂）",
    "background": "纯白背景/简洁纯色背景"
  },
  "visualAnchors": {
    "hair": "发型发色锚点（如：黑色长直发及腰/金色短卷发）",
    "face": "面部特征锚点（如：大眼睛/高鼻梁/圆脸）",
    "bodyType": "体型锚点（如：纤细/高挑/健壮）",
    "outfit": "服装锚点（如：白色衬衫+黑色西裤/红色连衣裙）",
    "accessories": "配饰锚点（如：银色项链/黑框眼镜/无配饰）",
    "distinctive": "独特识别特征（如：左眼下有泪痣/右手有疤痕）"
  },
  "colors": {
    "primary": "#RRGGBB（角色主色调）",
    "secondary": "#RRGGBB（角色副色调）",
    "accent": "#RRGGBB（点缀色，可选）"
  },
  "prompts": {
    "midjourney": "英文提示词，末尾包含 --ar 2:3 --v 6 --no text --no watermark --no extra people",
    "stableDiffusion": {
      "positive": "英文正向提示词（逗号分隔关键词）",
      "negative": "英文负向提示词（如：text, watermark, multiple people, bad anatomy, extra limbs）"
    },
    "general": {
      "zh": "中文通用描述（适配其他绘图工具）",
      "en": "English general description"
    }
  },
  "avoid": {
    "zh": "避免元素（如：多余人物/文字水印/复杂背景/道具）",
    "en": "Elements to avoid"
  }
}`,
  outputFormat: { type: 'json', maxLength: 4000 },
  maxTokens: 1200,
};

// 技能注册表
export const SkillRegistry = new Map<string, Skill>([
  ['scene-list', SceneListSkill],
  ['scene-description', SceneDescriptionSkill],
  ['action-description', ActionDescriptionSkill],
  ['keyframe-prompt', KeyframePromptSkill],
  ['motion-prompt', MotionPromptSkill],
  ['dialogue', DialogueSkill],
  ['character-basic-info', CharacterBasicInfoSkill],
  ['character-portrait-prompts', CharacterPortraitSkill],
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
      /^\[(对白|独白|旁白|心理)(?:\|([^\]]+))?\]\s*(?:([^:：]+)[:：]\s*)?(.+)$/,
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
