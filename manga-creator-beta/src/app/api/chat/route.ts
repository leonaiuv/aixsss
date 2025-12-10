import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";
import { tools } from "@/lib/agent/tools";

export const maxDuration = 60;

// 默认系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是漫剧创作助手，帮助用户创作漫画分镜和提示词。

你的能力包括：
1. 帮助用户创建新的漫剧项目
2. 收集故事基础信息（标题、梗概、画风、主角）
3. 根据故事梗概生成分镜列表
4. 细化每个分镜，生成详细的场景描述和关键帧提示词
5. 导出最终的提示词用于AI绘图

可用工具：
- generateScenes: 生成分镜
- refineScene: 细化单个分镜
- batchRefineScenes: 批量细化分镜
- exportPrompts: 导出提示词

在与用户对话时：
- 使用亲切、专业的语气
- 主动引导用户完成创作流程
- 对用户的创意给予积极反馈
- 生成的提示词要具体、详细、适合绘图AI使用

当需要执行操作时，请使用相应的工具。工具调用结果会自动同步到画布显示。`;

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

export async function POST(req: Request) {
  // 从请求头获取用户配置的 API Key
  const apiKey = req.headers.get("X-API-Key") || process.env.DEEPSEEK_API_KEY || "";
  const baseURL = req.headers.get("X-Base-URL") || "https://api.deepseek.com/v1";
  const model = req.headers.get("X-Model") || "deepseek-chat";

  // 检查 API Key 是否存在
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "请配置 API Key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 使用用户配置创建 DeepSeek 客户端，使用自定义 fetch 拦截 developer 角色
  const deepseek = createOpenAI({
    apiKey,
    baseURL,
    fetch: deepseekFetch,
  });

  // 从请求中获取 messages 和 system
  const { messages = [], system } = await req.json();

  // 使用前端传来的 system 或默认值
  const systemPrompt = system || DEFAULT_SYSTEM_PROMPT;

  // 转换消息
  const coreMessages = convertToModelMessages(messages);

  const result = streamText({
    model: deepseek.chat(model),
    system: systemPrompt,
    messages: coreMessages,
    tools,
  });

  return result.toUIMessageStreamResponse();
}
