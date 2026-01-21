# 工具调用（Function Calling / 内置工具 / MCP）

以 `doubao-MD-Doc/使用ResponsesAPI/工具调用.md` 与 `doubao-MD-Doc/工具调用/工具概述.md` 为准；本文件提供工程落地 checklist。

## Function Calling：工具定义规范

- 使用 `tools: [{ "type": "function", "name": "...", "description": "...", "parameters": {JSON Schema} }]`。
- `name` 使用稳定的 `snake_case`，避免随意变更（影响缓存与历史上下文一致性）。
- `description` 写“做什么 + 关键约束”，避免把业务规则塞进提示词。
- `parameters` 使用 JSON Schema：
  - 必填项写入 `required`
  - 枚举用 `enum`
  - 结构复杂时建议加 `additionalProperties: false`（配合结构化输出更稳）

## Function Calling：标准 loop（Responses API）

1. 首次请求：携带 `tools`，让模型决定是否触发工具调用。
2. 解析响应：遍历 `response.output[]`，收集 `type == "function_call"` 的条目。
3. 执行工具：对每条 `function_call`：
   - 解析 `arguments`（通常是 JSON 字符串）
   - 执行本地函数/外部 API
4. 回传结果：再次调用 `POST /responses`：
   - `previous_response_id = 上一轮 response.id`
   - `input` 填入 `type: "function_call_output"`，并严格携带对应的 `call_id`
5. 继续循环：若第二轮仍有 `function_call`，继续；必要时设置 `max_tool_calls` 防止死循环。

## 常见坑

- 不要“自己拼” `call_id`，必须回传模型给的值。
- 不要把工具返回当作 assistant 内容拼回去；要用 `function_call_output` 类型回传。
- 工具输出建议是 JSON 字符串（便于模型消费与二次工具触发）。

## 内置工具：类型与 beta header

来自 `doubao-MD-Doc/工具调用/工具概述.md` 的示例（以文档为准）：

- 豆包助手（doubao_app）：需要 header `ark-beta-doubao-app: true`
- 联网搜索（web_search）：`tools: [{"type":"web_search"}]`
- 图像处理（image_process）：需要 header `ark-beta-image-process: true`
- 私域知识库搜索（knowledge_search）：需要 header `ark-beta-knowledge-search: true`
  - 场景上通常会 `thinking.type=disabled` 并配合 `max_tool_calls: 1` 控制轮次
- MCP（mcp）：需要 header `ark-beta-mcp: true`

## MCP：落地建议

- 明确 `server_label` 与 `server_url`，并设置 `require_approval` 策略（文档示例包含 `never`）。
- 先用最小 `curl` 跑通 MCP，再在 SDK/业务代码里封装。
