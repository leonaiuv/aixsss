# 模型选型速记

以 `doubao-MD-Doc/模型列表.md` 为准；本文件只提供工程侧的“怎么选”与常见约束。

## 选型步骤

1. 明确是否需要：深度思考、结构化输出、工具调用、多模态输入（图/视频/文档）、上下文编辑、超长上下文。
2. 在 `doubao-MD-Doc/模型列表.md` 中确认：模型 ID、能力支持、上下文窗口与限流。
3. 记录“能力边界”并落到代码开关：不支持的能力要直接降级或切模型，不要靠提示词硬凑。

## 常见选择（示例）

- 通用 + Agent（优先默认）：`doubao-seed-1-8-251215`
  - 文档提示：`doubao-MD-Doc/模型列表.md`、`doubao-MD-Doc/使用ResponsesAPI/迁移至 Responses API.md`
  - 上下文编辑（beta）文档明确支持：`doubao-MD-Doc/使用ResponsesAPI/上下文编辑.md`
- 编程场景增强：`doubao-seed-code-preview-251028`
- 视觉/多模态：`doubao-seed-1-6-vision-250815`（结合 `Files API` 更稳）
  - 参考：`doubao-MD-Doc/使用ResponsesAPI/多模态理解.md`

## 结构化输出注意点

- 结构化输出（beta）建议优先用 `json_schema` + `strict: true`。
- 文档明确说明：`doubao-seed-1-6-lite-251015` 不支持结构化输出（见 `doubao-MD-Doc/使用ResponsesAPI/结构化输出(beta).md`）。
