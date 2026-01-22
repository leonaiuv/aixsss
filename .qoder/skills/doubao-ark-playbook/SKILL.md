---
name: doubao-ark-playbook
description: 豆包/方舟(ARK) 模型工程化接入与规范：基于 Responses API/Chat API 实现文本生成、深度思考、流式输出、多模态(Files API)、结构化输出(json_schema/json_object)、工具调用(Function Calling/内置工具 web_search、image_process、knowledge_search、mcp、doubao_app)、上下文缓存与上下文编辑；用于选型模型、设计工具 Schema、实现 tool-call 循环、排查响应结构与错误、沉淀提示词与评测流程。
---

# Doubao / ARK 工程 Playbook

## 概览

沉淀豆包/方舟(ARK) 的能力地图与工程落地规范，用最少的重复开发成本，把 Responses API 的关键能力（工具调用、结构化输出、上下文与缓存、多模态）稳定接入到真实项目。

## 快速导航（按需读取）

- 文档索引与检索：`references/doc-map.md`
- 模型选型：`references/model-selection.md`
- 请求/字段速查：`references/api-cheatsheet.md`
- 工具调用与 loop：`references/tool-calling.md`
- 结构化输出（JSON）：`references/structured-output.md`
- 上下文缓存/编辑：`references/context.md`
- 提示词工程与评测：`references/prompting.md`

## 默认工作流（落地一个新能力时按序执行）

1. 明确需求维度：深度思考 / 流式输出 / 工具调用 / 结构化输出 / 缓存 / 多模态(Files API) / 联网与私域知识库 / MCP。
2. 选模型：优先查 `doubao-MD-Doc/模型列表.md`（必要时对照 `references/model-selection.md`），明确“支持/不支持”的能力边界。
3. 选接口：默认用 Responses API（`/responses`）；需要完全自管上下文或兼容旧实现时再用 Chat API（`/chat/completions`）。迁移差异查 `doubao-MD-Doc/使用ResponsesAPI/迁移至 Responses API.md`。
4. 先跑通最小请求：用 `curl` 复现（鉴权、base_url、model、input）；再落地 SDK；深度思考/长任务要设置更大的 `timeout`。
5. 解析输出并串联上下文：记录 `response.id`；多轮用 `previous_response_id`；观测 `usage`（cached_tokens / reasoning_tokens）。
6. 工具调用：识别 `output[].type=="function_call"`；严格按 `call_id` 回传 `function_call_output`；必要时设置 `max_tool_calls` 防止循环；内置工具按要求加 beta header（详见 `references/tool-calling.md`）。
7. 结构化输出：优先 `json_schema` + `strict: true`；对 beta 能力加兜底（解析失败时回退自然语言/重试/降级）。
8. 降本与控上下文：重复长前缀启用 `caching`（prefix 缓存需足够 token 才能创建）；上下文膨胀用 `context_management` 清理 thinking/tool_uses（顺序要求见 `references/context.md`）。

## 代码资源

- TypeScript 模板：`assets/typescript/`（直接复制到项目）
- 脚手架：运行 `scripts/scaffold_typescript_client.py --out <dir>` 复制模板到目标目录

## 约定与注意

- `doubao-MD-Doc/` 是本仓库的事实来源，遇到字段/示例差异时以它为准。
- Beta 能力（如结构化输出、上下文编辑）用于生产时要有开关与回退策略。
- 内置工具的 beta header：`ark-beta-doubao-app` / `ark-beta-image-process` / `ark-beta-knowledge-search` / `ark-beta-mcp`。

## 在仓库中快速查规范

- 先读 `references/doc-map.md`，再用 `rg` 在 `doubao-MD-Doc/` 内精确检索关键词。
- 需要可复现问题时，优先保留/构造一条最小 `curl` 请求（model、input、tools、text.format、caching、context_management）。
