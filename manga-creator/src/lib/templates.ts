// ==========================================
// 内置提示词模板库
// ==========================================

import { PromptTemplate } from '@/types';

export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  // 场景锚点模板（环境一致性）
  {
    id: 'builtin_scene_realistic',
    name: '写实场景锚点',
    category: '场景锚点',
    description: '适合写实风格的场景锚点，注重光影、材质与固定锚点物',
    template: `请为以下分镜生成写实风格的场景锚点（Scene Anchor，仅环境一致性）：

分镜概要：{{summary}}
画风：{{style}}

要求：
1. 只描述环境/空间/光线/固定锚点物，不要出现人物、不要写动作、不要写镜头运动
2. 4-8 个可稳定复现的锚点元素（具体物件/结构/光位），尽量用稳定词汇避免同义改写
3. 重点刻画光线来源、阴影分布、材质质感（金属/木质/玻璃/布料等）与氛围
4. 输出中尽量包含可复现的细节（时间段/光色/空间布局/标志性物件）
5. 长度控制在120-200字

请开始描述：`,
    variables: ['summary', 'style'],
    style: 'realistic',
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_scene_anime',
    name: '动漫场景锚点',
    category: '场景锚点',
    description: '适合日系动漫风格的场景锚点，强调色彩与环境氛围',
    template: `请为以下分镜生成动漫风格的场景锚点（Scene Anchor，仅环境一致性）：

分镜概要：{{summary}}
画风：{{style}}

要求：
1. 只描述环境/空间/光线/固定锚点物，不要出现人物、不要写动作、不要写镜头运动
2. 4-8 个可稳定复现的锚点元素（具体物件/结构/光位），避免同义改写
3. 强调色彩基调、光影氛围、材质与空间结构（可轻描特效/氛围，但不要写动态过程）
4. 词汇尽量稳定、可复现，避免诗意化/角色代入
5. 长度控制在100-180字

请开始描述：`,
    variables: ['summary', 'style'],
    style: 'anime',
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_scene_cyberpunk',
    name: '赛博朋克场景锚点',
    category: '场景锚点',
    description: '赛博朋克风格场景锚点，强调科技感与霓虹光效（仅环境一致性）',
    template: `请为以下分镜生成赛博朋克风格的场景锚点（Scene Anchor，仅环境一致性）：

分镜概要：{{summary}}

要求：
1. 只描述环境/空间/光线/固定锚点物，不要出现人物、不要写动作、不要写镜头运动
2. 4-8 个可稳定复现的锚点元素（霓虹灯招牌/全息屏/反光湿地/管线/标识物等）
3. 体现未来都市的结构与材质对比（高楼/小巷/金属/玻璃/湿润反射）
4. 可写雨夜/烟雾等氛围，但不要写“雨在下/烟雾飘动”等过程词
5. 长度控制在120-220字

请开始描述：`,
    variables: ['summary'],
    style: 'cyberpunk',
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  
  // 动作描述模板
  {
    id: 'builtin_action_dramatic',
    name: '戏剧性动作',
    category: '动作描述',
    description: '强调戏剧张力的动作描述',
    template: `基于以下场景，生成富有戏剧张力的动作描述：

场景：{{sceneDescription}}
主角：{{protagonist}}

要求：
1. 突出角色的肢体语言和表情变化
2. 强调动作的节奏感和力度
3. 描述情绪的外化表现
4. 注意与场景的互动细节
5. 长度控制在100-150字

请开始描述：`,
    variables: ['sceneDescription', 'protagonist'],
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_action_combat',
    name: '战斗动作',
    category: '动作描述',
    description: '适合动作戏的描述，强调动态和冲击力',
    template: `基于以下场景，生成激烈的战斗动作描述：

场景：{{sceneDescription}}
主角：{{protagonist}}

要求：
1. 详细描述攻击动作的起手、发力、命中
2. 强调速度感和力量感
3. 描述武器或技能的视觉效果
4. 注意身体姿态的连贯性
5. 长度控制在120-180字

请开始描述：`,
    variables: ['sceneDescription', 'protagonist'],
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  
  // 镜头提示词模板
  {
    id: 'builtin_prompt_midjourney',
    name: 'Midjourney提示词',
    category: '镜头提示词',
    description: '优化用于Midjourney的提示词格式',
    template: `基于以下信息，生成Midjourney格式的提示词：

场景：{{sceneDescription}}
动作：{{actionDescription}}
画风：{{style}}

提示词结构：
[主体描述], [环境描述], [光线氛围], [艺术风格], [技术参数]

要求：
1. 使用英文，简洁精准
2. 关键词用逗号分隔
3. 包含构图、视角、灯光
4. 末尾添加画质参数：--ar 16:9 --v 6 --style raw
5. 总长度控制在100-150词

请生成：`,
    variables: ['sceneDescription', 'actionDescription', 'style'],
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_prompt_sd',
    name: 'Stable Diffusion提示词',
    category: '镜头提示词',
    description: '优化用于Stable Diffusion的提示词',
    template: `基于以下信息，生成Stable Diffusion格式的提示词：

场景：{{sceneDescription}}
动作：{{actionDescription}}
画风：{{style}}

要求：
1. 正向提示词：详细描述主体、环境、风格、画质
2. 使用权重标记，重要元素加强：(keyword:1.2)
3. 包含画质词：masterpiece, best quality, highly detailed, 8k
4. 英文输出，用逗号分隔
5. 同时生成负向提示词（去除低质量元素）

正向提示词：
{{positive}}

负向提示词：
{{negative}}

请生成：`,
    variables: ['sceneDescription', 'actionDescription', 'style'],
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_prompt_comfyui',
    name: 'ComfyUI工作流提示词',
    category: '镜头提示词',
    description: 'ComfyUI节点式工作流的提示词',
    template: `基于以下信息，生成ComfyUI工作流的提示词配置：

场景：{{sceneDescription}}
动作：{{actionDescription}}
画风：{{style}}

输出格式：
{
  "positive": "主体描述, 环境描述, 风格描述, 画质词",
  "negative": "负向词汇",
  "width": 1024,
  "height": 1024,
  "cfg_scale": 7,
  "sampler": "DPM++ 2M Karras",
  "steps": 30
}

要求：
1. positive要详细且结构化
2. negative包含常见低质量词
3. 参数根据画风适当调整
4. 英文输出

请生成：`,
    variables: ['sceneDescription', 'actionDescription', 'style'],
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  
  // 风格化模板
  {
    id: 'builtin_style_ink',
    name: '水墨国风',
    category: '风格化',
    description: '中国水墨画风格的场景和动作',
    template: `请用水墨国风重新演绎以下内容：

场景：{{sceneDescription}}
动作：{{actionDescription}}

要求：
1. 强调留白和意境
2. 使用水墨画的笔触和渲染技法
3. 融入山水、云雾等东方元素
4. 诗意化的文字表达
5. 长度控制在150-200字

请开始：`,
    variables: ['sceneDescription', 'actionDescription'],
    style: 'ink',
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'builtin_style_pixel',
    name: '像素艺术',
    category: '风格化',
    description: '复古像素风格的场景锚点/画面描述',
    template: `请用像素艺术风格重新描述：

场景：{{sceneDescription}}
主角：{{protagonist}}

要求：
1. 强调方块化的造型和有限的色板
2. 描述像素化的光影效果
3. 注重复古游戏的视觉语言
4. 简化细节，强调轮廓
5. 长度控制在100-150字

请开始：`,
    variables: ['sceneDescription', 'protagonist'],
    style: 'pixel',
    isBuiltIn: true,
    usageCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

/**
 * 根据ID获取模板
 */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}

/**
 * 根据分类获取模板
 */
export function getTemplatesByCategory(category: string): PromptTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.category === category);
}

/**
 * 应用模板变量
 */
export function applyTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
}
