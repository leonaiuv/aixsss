# 结构化输出（beta）：json_schema / json_object

以 `doubao-MD-Doc/使用ResponsesAPI/结构化输出(beta).md` 为准；本文件只保留工程侧关键点。

## 结论

- 优先使用 `json_schema`（可定义结构 + 可开严格模式 `strict: true`）。
- `json_object` 仅保证输出是合法 JSON，不保证字段结构，适合过渡或快速试验。

## json_schema 示例（最小片段）

```json
{
  "text": {
    "format": {
      "type": "json_schema",
      "name": "my_schema",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": { "result": { "type": "string" } },
        "required": ["result"],
        "additionalProperties": false
      }
    }
  }
}
```

## 配合思考模式的建议

- 对“必须可解析 JSON”的链路，优先关闭思考：`thinking: { "type": "disabled" }`（提升确定性与一致性）。

## 模型支持与限制

- 文档提示：250615 之后版本的大语言模型通常支持 Responses API 的结构化输出能力。
- 文档明确说明：`doubao-seed-1-6-lite-251015` 不支持结构化输出。
- 该能力处于 beta：生产使用要有开关、回退与监控。

## 解析与兜底（工程实现）

1. 先按 JSON 解析。
2. 解析失败：
   - 记录可复现的 request（model、input、text.format、thinking）
   - 重试一次（可加更强约束/更短输入）
   - 或直接降级为非结构化输出路径
