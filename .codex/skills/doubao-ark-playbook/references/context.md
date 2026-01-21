# 上下文：缓存（caching）与编辑（context_management）

以 `doubao-MD-Doc/使用ResponsesAPI/上下文缓存.md` 与 `doubao-MD-Doc/使用ResponsesAPI/上下文编辑.md` 为准。

## 上下文缓存（Responses API）

### 适用场景

- 多轮对话、工具调用、角色扮演等：需要反复携带相同长前缀/规则/材料。
- 成本优化：命中缓存的输入有折扣（以平台计费为准）。

### 关键点

- 前缀缓存创建门槛：输入需要大于 1024 tokens，否则无法创建前缀缓存（文档示例提示）。
- 常用字段：
  - `caching: { "type": "enabled" }`
  - 创建前缀缓存：`caching: { "type": "enabled", "prefix": true }`
- 命中观测：在 `usage` 中关注 `cached_tokens` 等字段（示例见文档）。

## 上下文编辑（beta，Responses API）

### 目的

- 控制上下文窗口增长：自动清理旧的思考块/工具调用内容。
- 配合缓存：减少无效 token 占用，提高命中概率。

### 策略一：clear_thinking

- 标识符：`clear_thinking`
- 配置：`keep`
  - 保留最近 N 轮思考：`{ "type": "thinking_turns", "value": N }`（N > 0）
  - 或保留全部：`"all"`

### 策略二：clear_tool_uses

- 标识符：`clear_tool_uses`
- 常用配置：
  - `trigger`：触发阈值（例如工具调用轮次达到多少）
  - `keep`：保留最近 N 轮工具调用
  - `exclude_tools`：不清除的工具名（保留关键上下文）
  - `clear_tool_input`：是否清除工具调用参数

### 组合策略顺序

- 定义顺序：`clear_thinking` 必须排在 `clear_tool_uses` 之前。
- 处理顺序：先清思考块，再清工具调用内容。
