# doubao-MD-Doc 索引（本仓库）

## 快速定位

- 入门与鉴权：`doubao-MD-Doc/快速入门.md`
- 模型列表/能力差异：`doubao-MD-Doc/模型列表.md`
- Responses API：
  - 文本生成：`doubao-MD-Doc/使用ResponsesAPI/文本生成.md`
  - 工具调用：`doubao-MD-Doc/使用ResponsesAPI/工具调用.md`
  - 结构化输出：`doubao-MD-Doc/使用ResponsesAPI/结构化输出(beta).md`
  - 上下文缓存：`doubao-MD-Doc/使用ResponsesAPI/上下文缓存.md`
  - 上下文编辑：`doubao-MD-Doc/使用ResponsesAPI/上下文编辑.md`
  - 多模态理解/Files API：`doubao-MD-Doc/使用ResponsesAPI/多模态理解.md`
  - 迁移指南：`doubao-MD-Doc/使用ResponsesAPI/迁移至 Responses API.md`
- 工具（内置/MCP）：`doubao-MD-Doc/工具调用/工具概述.md`
- 提示词工程：`doubao-MD-Doc/进阶使用/提示词工程.md`

## 常用检索命令（PowerShell）

> 提示：打开文档建议使用 `Get-Content -Encoding UTF8 <path>`，避免中文乱码。

- 找上下文串联：`rg "previous_response_id" doubao-MD-Doc -n`
- 找工具调用：`rg "function_call_output|function_call|call_id" doubao-MD-Doc -n`
- 找结构化输出：`rg "json_schema|json_object|text\\s*:\\s*\\{\\s*\\\"format\\\"" doubao-MD-Doc -n`
- 找缓存与命中：`rg "caching|cached_tokens|prefix" doubao-MD-Doc -n`
- 找上下文编辑：`rg "context_management|clear_thinking|clear_tool_uses" doubao-MD-Doc -n`
- 找内置工具 beta header：`rg "ark-beta-" doubao-MD-Doc -n`
