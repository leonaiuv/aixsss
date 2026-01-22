# Responses API 速查（工程侧）

以 `doubao-MD-Doc/使用ResponsesAPI/` 为准；本文件强调“最常用字段”和“最容易错的地方”。

## 基本信息

- Base URL：`https://ark.cn-beijing.volces.com/api/v3`
- Endpoint：`POST /responses`
- 鉴权：`Authorization: Bearer $ARK_API_KEY`

## 最小请求体（文本）

```json
{
  "model": "doubao-seed-1-8-251215",
  "input": "hello"
}
```

## 常用字段

- 多轮：`previous_response_id`
- 深度思考开关：`thinking: { "type": "enabled" | "disabled" }`
- 流式：`stream: true`
- 工具：`tools: [...]`
- 限制工具循环：`max_tool_calls`
- 结构化输出：`text.format`（见 `references/structured-output.md`）
- 上下文缓存：`caching`（见 `references/context.md`）
- 上下文编辑：`context_management`（见 `references/context.md`）

## input 常见形态（择一）

1. 纯字符串（最简单）：

```json
{ "input": "你好" }
```

2. 消息列表（推荐用于多模态/细粒度控制）：

```json
{
  "input": [
    { "role": "system", "content": "你是一个助手。" },
    { "role": "user", "content": "你好" }
  ]
}
```

3. 多模态内容项（图片/文本混合）：

```json
{
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_image", "file_id": "file-xxxx" },
        { "type": "input_text", "text": "请描述图片。" }
      ]
    }
  ]
}
```

4. 工具回传（Function Calling 结果）：

```json
{
  "previous_response_id": "resp_xxx",
  "input": [
    {
      "type": "function_call_output",
      "call_id": "call_xxx",
      "output": "{\"key\":\"value\"}"
    }
  ]
}
```

## 输出解析最小策略

1. 记录 `response.id`（后续继续对话/回传工具结果都靠它串联）。
2. 若 `output[]` 存在 `type == "function_call"`：执行工具调用循环（见 `references/tool-calling.md`）。
3. 否则从 `output[]` 中提取 `type == "message"` 的 `content[]`（通常包含 `output_text`）。
