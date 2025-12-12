// ==========================================
// P0-3: 上下文构建器
// ==========================================
// 功能：
// 1. 整合角色信息（appearance + personality + primaryColor + secondaryColor）
// 2. 整合画风信息（ArtStyleConfig.fullPrompt）
// 3. 整合世界观信息
// 4. 提供填充提示词模板的方法
// ==========================================

import { Character, ArtStyleConfig, WorldViewElement } from '@/types';

/** 世界观要素类型 */
type WorldViewType = WorldViewElement['type'];

/** 上下文构建选项 */
export interface ContextBuildOptions {
  /** 角色列表 */
  characters?: Character[];
  /** 画风配置 */
  artStyle?: ArtStyleConfig;
  /** 世界观要素列表 */
  worldViewElements?: WorldViewElement[];
  /** 主角描述（兼容旧版） */
  protagonist?: string;
  /** 场景描述 */
  sceneDescription?: string;
  /** 关键帧提示词（可包含多关键帧） */
  shotPrompt?: string;
  /** 时空/运动提示词 */
  motionPrompt?: string;
  /** 场景概要 */
  sceneSummary?: string;
  /** 前一场景概要 */
  prevSceneSummary?: string;
  /** 故事梗概 */
  summary?: string;
}

/** 上下文构建配置 */
interface ContextConfig {
  /** 最大长度限制 */
  maxLength?: number;
}

/**
 * 构建角色上下文
 * 将角色的外貌、性格、主题色等信息格式化为AI可理解的上下文
 */
export function buildCharacterContext(
  characters: Character[],
  config?: ContextConfig
): string {
  if (!characters || characters.length === 0) {
    return '';
  }

  const maxLength = config?.maxLength || 1000;
  const parts: string[] = [];

  for (const char of characters) {
    const charParts: string[] = [];
    
    charParts.push(`【${char.name}】`);
    
    if (char.appearance) {
      charParts.push(`外貌: ${char.appearance}`);
    }
    
    if (char.personality) {
      charParts.push(`性格: ${char.personality}`);
    }
    
    // 添加主题色信息（如果存在）
    if (char.primaryColor || char.secondaryColor) {
      const colorParts: string[] = [];
      if (char.primaryColor) {
        colorParts.push(`主色: ${char.primaryColor}`);
      }
      if (char.secondaryColor) {
        colorParts.push(`辅色: ${char.secondaryColor}`);
      }
      charParts.push(`色彩特征: ${colorParts.join(', ')}`);
    }
    
    parts.push(charParts.join('\n'));
  }

  let result = parts.join('\n\n');
  
  // 长度控制
  if (result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + '...';
  }
  
  return result;
}

/**
 * 构建画风上下文
 * 使用完整的画风提示词作为上下文
 */
export function buildStyleContext(
  artStyle?: ArtStyleConfig
): string {
  if (!artStyle) {
    return '';
  }

  if (artStyle.fullPrompt) {
    return artStyle.fullPrompt;
  }

  // 如果没有完整提示词，组合各部分
  const parts = [
    artStyle.baseStyle,
    artStyle.technique,
    artStyle.colorPalette,
    artStyle.culturalFeature,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * 构建世界观上下文
 * 将世界观要素按类型分组并格式化
 */
export function buildWorldViewContext(
  elements: WorldViewElement[]
): string {
  if (!elements || elements.length === 0) {
    return '';
  }

  const typeLabels: Record<WorldViewType, string> = {
    era: '时代背景',
    geography: '地理设定',
    society: '社会制度',
    technology: '科技水平',
    magic: '魔法体系',
    custom: '其他设定',
  };

  // 按类型分组
  const grouped: Record<WorldViewType, WorldViewElement[]> = {
    era: [],
    geography: [],
    society: [],
    technology: [],
    magic: [],
    custom: [],
  };

  for (const el of elements) {
    if (grouped[el.type]) {
      grouped[el.type].push(el);
    }
  }

  // 格式化输出
  const contextParts: string[] = [];

  (Object.keys(grouped) as WorldViewType[]).forEach(type => {
    const items = grouped[type];
    if (items.length > 0) {
      const label = typeLabels[type];
      const content = items.map(el => `【${el.title}】${el.content}`).join('\n');
      contextParts.push(`## ${label}\n${content}`);
    }
  });

  return contextParts.join('\n\n');
}

/**
 * 构建完整上下文
 * 整合所有可用的上下文信息
 */
export function buildFullContext(options: ContextBuildOptions): string {
  const parts: string[] = [];

  // 1. 画风信息
  if (options.artStyle) {
    const styleContext = buildStyleContext(options.artStyle);
    if (styleContext) {
      parts.push(`## 视觉风格\n${styleContext}`);
    }
  }

  // 2. 角色信息
  if (options.characters && options.characters.length > 0) {
    const charContext = buildCharacterContext(options.characters);
    if (charContext) {
      parts.push(`## 角色设定\n${charContext}`);
    }
  }

  // 3. 世界观信息
  if (options.worldViewElements && options.worldViewElements.length > 0) {
    const worldContext = buildWorldViewContext(options.worldViewElements);
    if (worldContext) {
      parts.push(`## 世界观\n${worldContext}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * 填充提示词模板
 * 用上下文信息替换模板中的占位符
 */
export function fillPromptTemplate(
  template: string,
  options: ContextBuildOptions
): string {
  let result = template;

  // 构建各类上下文
  const styleContext = options.artStyle 
    ? buildStyleContext(options.artStyle) 
    : '';
  
  const charContext = options.characters && options.characters.length > 0
    ? buildCharacterContext(options.characters)
    : '';
  
  const worldContext = options.worldViewElements && options.worldViewElements.length > 0
    ? buildWorldViewContext(options.worldViewElements)
    : '';

  // 替换已知变量
  const replacements: Record<string, string> = {
    // 画风相关
    '{style}': styleContext,
    '{styleFullPrompt}': styleContext,
    '{{styleFullPrompt}}': styleContext,
    
    // 角色相关
    '{characters}': charContext,
    '{protagonist}': options.protagonist || charContext,
    
    // 世界观相关
    '{worldview}': worldContext,
    '{world_view}': worldContext,
    
    // 场景相关
    '{scene_description}': options.sceneDescription || '',
    '{scene_summary}': options.sceneSummary || '',
    '{current_scene_summary}': options.sceneSummary || '',
    '{prev_scene_summary}': options.prevSceneSummary || '',

    // 分镜内容相关
    '{shot_prompt}': options.shotPrompt || '',
    '{keyframe_prompt}': options.shotPrompt || '',
    '{keyframe_prompts}': options.shotPrompt || '',
    '{motion_prompt}': options.motionPrompt || '',
     
    // 故事相关
    '{summary}': options.summary || '',
    '{{summary}}': options.summary || '',
  };

  // 执行替换
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.split(placeholder).join(value);
  }

  return result;
}

/**
 * 获取用于特定Skill的增强上下文
 * 根据Skill的requiredContext自动构建所需的上下文
 */
export function buildContextForSkill(
  skillName: string,
  options: ContextBuildOptions
): string {
  // 根据不同的skill返回定制化的上下文
  switch (skillName) {
    case 'scene-list':
    case 'scene-list-generator':
      // 分镜列表生成：需要画风、世界观、故事梗概
      return buildFullContext({
        artStyle: options.artStyle,
        worldViewElements: options.worldViewElements,
      });
    
    case 'scene-description':
      // 场景描述：需要画风、角色、世界观
      return buildFullContext({
        artStyle: options.artStyle,
        characters: options.characters,
        worldViewElements: options.worldViewElements,
      });
    
    case 'keyframe-prompt':
      // 关键帧提示词：需要画风、角色
      return buildFullContext({
        artStyle: options.artStyle,
        characters: options.characters,
      });
    
    case 'motion-prompt':
      // 时空提示词：需要画风
      return buildFullContext({
        artStyle: options.artStyle,
      });
    
    case 'dialogue':
      // 台词生成：需要角色
      return buildFullContext({
        characters: options.characters,
      });
    
    default:
      return buildFullContext(options);
  }
}
