import { Skill } from '@/types';

// ==========================================
// Agent Skills定义
// ==========================================

export const SceneListSkill: Skill = {
  name: 'scene-list-generator',
  description: '根据剧本生成分镜列表',
  requiredContext: ['project_essence'],
  promptTemplate: `你是一位专业的电影分镜师。请根据以下故事梗概,将其拆解为{{sceneCount}}个关键分镜。

故事梗概:{{summary}}
视觉风格:{{style}}

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
  description: '为单个分镜生成角色动作描述',
  requiredContext: ['project_essence', 'current_scene_summary', 'confirmed_content'],
  promptTemplate: `你是一位专业的电影分镜师。请为以下场景生成角色动作描述。

## 场景描述
{scene_description}

## 主角设定
{protagonist}

## 分镜概要
{current_scene_summary}

## 输出要求
请描述角色在这个场景中的:
1. 主要动作和姿态
2. 表情和情绪
3. 与环境的互动

直接输出动作描述,150字以内。`,
  outputFormat: { type: 'text', maxLength: 150 },
  maxTokens: 400,
};

export const PromptGeneratorSkill: Skill = {
  name: 'prompt-generator',
  description: '生成AI图像生成提示词',
  requiredContext: ['project_essence', 'confirmed_content'],
  promptTemplate: `你是一位专业的AIGC提示词专家。根据以下场景和动作描述,生成一段高质量的图像生成提示词。

## 场景描述
{scene_description}

## 动作描述
{action_description}

## 视觉风格
{style}

## 主角特征
{protagonist}

## 要求
1. 提示词需包含:主角特征、动作姿态、场景环境、构图、镜头类型、灯光、色彩基调、画质关键词
2. 格式紧凑,适用于Stable Diffusion或Midjourney
3. 使用英文输出
4. 末尾添加常用参数如 --ar 16:9

直接输出提示词,不要额外解释。`,
  outputFormat: { type: 'text', maxLength: 300 },
  maxTokens: 600,
};

// 技能注册表
export const SkillRegistry = new Map<string, Skill>([
  ['scene-list', SceneListSkill],
  ['scene-description', SceneDescriptionSkill],
  ['action-description', ActionDescriptionSkill],
  ['prompt-generator', PromptGeneratorSkill],
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
    'generate_shot_prompt': 'prompt-generator',
    'generate_scene_list': 'scene-list',
  };
  
  const registryKey = nameMap[skillName] || skillName;
  return SkillRegistry.get(registryKey) || null;
}
