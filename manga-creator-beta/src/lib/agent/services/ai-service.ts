import { generateText, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { SceneStatus } from '@/types';

// =====================
// 类型定义
// =====================

/**
 * 分镜生成上下文
 */
export interface GenerateScenesContext {
  title: string;
  summary: string;
  artStyle: string;
  protagonist: string;
  count: number;
  model?: LanguageModel; // 可选：注入模型用于测试
}

/**
 * 分镜细化上下文
 */
export interface RefineSceneContext {
  sceneId: string;
  sceneSummary: string;
  artStyle: string;
  protagonist: string;
  projectTitle: string;
  dialogues?: Array<{ character: string; content: string }>;
  model?: LanguageModel; // 可选：注入模型用于测试
}

/**
 * 生成的分镜数据
 */
export interface GeneratedScene {
  id: string;
  order: number;
  summary: string;
  status: SceneStatus;
}

/**
 * 细化后的分镜数据
 */
export interface RefinedSceneData {
  sceneId: string;
  sceneDescription: string;
  keyframePrompt: string;
  spatialPrompt: string;
  fullPrompt: string; // 包含画风的完整提示词
  status: SceneStatus;
}

/**
 * AI 服务结果
 */
export interface AIServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// =====================
// AI 客户端配置
// =====================

// 自定义 fetch：拦截请求，将 developer 角色替换为 system
const deepseekFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const data = JSON.parse(init.body);
      if (data.messages && Array.isArray(data.messages)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.messages = data.messages.map((msg: any) => {
          if (msg.role === 'developer') {
            return { ...msg, role: 'system' };
          }
          return msg;
        });
        init = { ...init, body: JSON.stringify(data) };
      }
    } catch {
      // 解析失败时不处理
    }
  }
  return fetch(input, init);
};

/**
 * 获取 DeepSeek 模型客户端
 */
function getAIModel() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }
  
  const deepseek = createOpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
    fetch: deepseekFetch,
  });
  
  // 使用 .chat() 强制使用 Chat Completions API
  return deepseek.chat('deepseek-chat');
}

// =====================
// 分镜生成服务
// =====================

/**
 * 使用 AI 生成分镜列表
 */
export async function generateScenesWithAI(
  context: GenerateScenesContext
): Promise<AIServiceResult<{ scenes: GeneratedScene[] }>> {
  try {
    console.log('[generateScenesWithAI] 开始执行, context:', context.title);
    const model = context.model ?? getAIModel();
    console.log('[generateScenesWithAI] 获取模型成功');
    
    const prompt = `你是一个专业的漫画分镜师。根据以下故事信息，生成 ${context.count} 个分镜摘要。

## 故事信息
- 标题：${context.title}
- 故事梗概：${context.summary}
- 画风：${context.artStyle}
- 主角：${context.protagonist}

## 要求
1. 每个分镜应该包含清晰的场景描述
2. 分镜之间应该有连贯的剧情发展
3. 注意故事的节奏感，有起承转合
4. 每个分镜摘要控制在 50 字以内

## 输出格式
请以 JSON 格式输出，格式如下：
{
  "scenes": [
    { "order": 1, "summary": "分镜摘要" },
    { "order": 2, "summary": "分镜摘要" },
    ...
  ]
}

只输出 JSON，不要包含其他内容。`;

    const result = await generateText({
      model,
      prompt,
    });
    console.log('[generateScenesWithAI] AI 调用成功, 响应长度:', result.text?.length);

    // 解析 AI 响应
    let parsed;
    try {
      // 尝试提取 JSON
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(result.text);
      }
      console.log('[generateScenesWithAI] JSON 解析成功, scenes数量:', parsed.scenes?.length);
    } catch (e) {
      console.error('[generateScenesWithAI] JSON 解析失败:', e, 'text:', result.text?.substring(0, 200));
      return {
        success: false,
        error: '解析 AI 响应失败：无效的 JSON 格式',
      };
    }

    // 验证并转换数据
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      console.error('[generateScenesWithAI] 缺少 scenes 字段, parsed:', JSON.stringify(parsed).substring(0, 200));
      return {
        success: false,
        error: '解析 AI 响应失败：缺少 scenes 字段',
      };
    }

    const scenes: GeneratedScene[] = parsed.scenes.map(
      (scene: { order: number; summary: string }, index: number) => ({
        id: `scene-${Date.now()}-${index + 1}`,
        order: scene.order || index + 1,
        summary: scene.summary || `分镜 ${index + 1}`,
        status: 'pending' as SceneStatus,
      })
    );

    return {
      success: true,
      data: { scenes },
    };
  } catch (error) {
    console.error('[generateScenesWithAI] 错误:', error);
    return {
      success: false,
      error: `AI 服务调用失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =====================
// 分镜细化服务
// =====================

/**
 * 使用 AI 细化单个分镜
 * 
 * 重点：确保画风通过 fullPrompt 传递到最终输出
 */
export async function refineSceneWithAI(
  context: RefineSceneContext
): Promise<AIServiceResult<RefinedSceneData>> {
  try {
    const model = context.model ?? getAIModel();
    
    // 构建对话内容
    const dialoguesText = context.dialogues?.length
      ? `\n## 对话内容\n${context.dialogues.map(d => `${d.character}：${d.content}`).join('\n')}`
      : '';

    const prompt = `你是一个专业的漫画分镜细化师和 AI 绘图提示词专家。

## 任务
将以下分镜摘要细化为详细的场景描述和 AI 绘图提示词。

## 项目信息
- 项目名称：${context.projectTitle}
- 画风风格：${context.artStyle}
- 主角信息：${context.protagonist}

## 分镜信息
- 分镜摘要：${context.sceneSummary}${dialoguesText}

## 输出要求

### 1. 场景描述 (sceneDescription)
用中文详细描述这个场景，包括：
- 环境氛围
- 人物状态
- 关键动作
- 情绪表达

### 2. 关键帧提示词 (keyframePrompt)
用英文生成 AI 绘图提示词，要求：
- 静态画面描述，适合 Midjourney/DALL-E
- 包含人物外观、姿态、表情
- 包含场景环境细节
- 包含光影效果
- 不要包含画风描述（画风将单独处理）

### 3. 时空提示词 (spatialPrompt)
用英文生成视频生成用的动态提示词，要求：
- 描述镜头运动
- 描述时间变化
- 描述动态效果
- 适合 Runway/Pika 等视频 AI

## 输出格式
请以 JSON 格式输出：
{
  "sceneDescription": "中文场景描述...",
  "keyframePrompt": "English static image prompt...",
  "spatialPrompt": "English dynamic/camera movement prompt..."
}

只输出 JSON，不要包含其他内容。`;

    const result = await generateText({
      model,
      prompt,
    });

    // 解析 AI 响应
    let parsed;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(result.text);
      }
    } catch {
      return {
        success: false,
        error: '解析 AI 响应失败：无效的 JSON 格式',
      };
    }

    // 验证必要字段
    if (!parsed.sceneDescription || !parsed.keyframePrompt || !parsed.spatialPrompt) {
      return {
        success: false,
        error: '解析 AI 响应失败：缺少必要字段',
      };
    }

    // 构建完整提示词（融入画风）
    // 重要：画风必须传递到 fullPrompt
    const fullPrompt = `${context.artStyle}, ${parsed.keyframePrompt}`;

    return {
      success: true,
      data: {
        sceneId: context.sceneId,
        sceneDescription: parsed.sceneDescription,
        keyframePrompt: parsed.keyframePrompt,
        spatialPrompt: parsed.spatialPrompt,
        fullPrompt,
        status: 'completed' as SceneStatus,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `AI 服务调用失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =====================
// 批量细化服务
// =====================

/**
 * 批量细化多个分镜
 */
export async function batchRefineWithAI(
  scenes: Array<{ sceneId: string; sceneSummary: string }>,
  context: Omit<RefineSceneContext, 'sceneId' | 'sceneSummary'>
): Promise<AIServiceResult<{ results: RefinedSceneData[] }>> {
  const results: RefinedSceneData[] = [];
  const errors: string[] = [];

  for (const scene of scenes) {
    const result = await refineSceneWithAI({
      ...context,
      sceneId: scene.sceneId,
      sceneSummary: scene.sceneSummary,
    });

    if (result.success && result.data) {
      results.push(result.data);
    } else {
      errors.push(`分镜 ${scene.sceneId}: ${result.error}`);
    }
  }

  if (results.length === 0) {
    return {
      success: false,
      error: `所有分镜细化失败：${errors.join('; ')}`,
    };
  }

  return {
    success: true,
    data: { results },
  };
}

// =====================
// 导出服务
// =====================

/**
 * 导出提示词数据
 */
export interface ExportData {
  projectTitle: string;
  artStyle: string;
  scenes: Array<{
    order: number;
    summary: string;
    sceneDescription?: string;
    keyframePrompt?: string;
    spatialPrompt?: string;
    fullPrompt?: string;
  }>;
  exportedAt: string;
}

/**
 * 格式化导出内容
 */
export function formatExportData(
  data: ExportData,
  format: 'json' | 'txt' | 'csv'
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    
    case 'txt': {
      let output = `# ${data.projectTitle}\n`;
      output += `画风：${data.artStyle}\n`;
      output += `导出时间：${data.exportedAt}\n\n`;
      
      for (const scene of data.scenes) {
        output += `## 分镜 ${scene.order}\n`;
        output += `摘要：${scene.summary}\n`;
        if (scene.sceneDescription) {
          output += `场景描述：${scene.sceneDescription}\n`;
        }
        if (scene.fullPrompt) {
          output += `完整提示词：${scene.fullPrompt}\n`;
        }
        if (scene.spatialPrompt) {
          output += `时空提示词：${scene.spatialPrompt}\n`;
        }
        output += '\n';
      }
      
      return output;
    }
    
    case 'csv': {
      const headers = ['order', 'summary', 'sceneDescription', 'keyframePrompt', 'spatialPrompt', 'fullPrompt'];
      let output = headers.join(',') + '\n';
      
      for (const scene of data.scenes) {
        const row = [
          scene.order,
          `"${(scene.summary || '').replace(/"/g, '""')}"`,
          `"${(scene.sceneDescription || '').replace(/"/g, '""')}"`,
          `"${(scene.keyframePrompt || '').replace(/"/g, '""')}"`,
          `"${(scene.spatialPrompt || '').replace(/"/g, '""')}"`,
          `"${(scene.fullPrompt || '').replace(/"/g, '""')}"`,
        ];
        output += row.join(',') + '\n';
      }
      
      return output;
    }
    
    default:
      return JSON.stringify(data, null, 2);
  }
}
