import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";
import { agentTools } from "@/lib/agent/tools";

export const maxDuration = 30;

// 使用 DeepSeek API (OpenAI 兼容接口)
const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  baseURL: "https://api.deepseek.com",
});

// 系统提示词
const SYSTEM_PROMPT = `你是漫剧创作助手，帮助用户创作漫画分镜和提示词。

你的能力包括：
1. 帮助用户创建新的漫剧项目
2. 收集故事基础信息（标题、梗概、画风、主角）
3. 根据故事梗概生成分镜列表
4. 细化每个分镜，生成详细的场景描述和关键帧提示词
5. 导出最终的提示词用于AI绘图

可用工具：
- create_project: 创建新项目
- get_project_state: 获取项目状态
- set_project_info: 设置项目信息
- generate_scenes: 生成分镜
- refine_scene: 细化单个分镜
- batch_refine_scenes: 批量细化分镜
- export_prompts: 导出提示词

在与用户对话时：
- 使用亲切、专业的语气
- 主动引导用户完成创作流程
- 对用户的创意给予积极反馈
- 生成的提示词要具体、详细、适合绘图AI使用

当需要执行操作时，请使用相应的工具。工具调用结果会自动同步到画布显示。`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: deepseek("deepseek-chat"),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: agentTools,
  });

  return result.toUIMessageStreamResponse();
}
