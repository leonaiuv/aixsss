# OpenAI-img 文生图（DMXAPI）

## 端点

- `POST https://www.dmxapi.cn/v1/images/generations`

## 模型支持

- `gpt-image-1.5`
- `gpt-image-1`
- `gpt-image-1-mini`
- `dall-e-3`

## 参数矩阵

- 通用参数：`model`、`prompt`、`n`、`size`、`quality`
- 仅 `gpt-image-*`：`background`、`moderation`、`output_format`、`output_compression`
- 仅 `dall-e-3`：`response_format`、`style`

## 关键约束

- `dall-e-3`：`n=1`
- `gpt-image-*`：
  - `size`: `1024x1024` / `1536x1024` / `1024x1536` / `auto`
  - `quality`: `auto` / `high` / `medium` / `low`
- `dall-e-3`：
  - `size`: `1024x1024` / `1792x1024` / `1024x1792`
  - `quality`: `standard` / `hd`
  - `style`: `vivid` / `natural`
  - `response_format`: `b64_json` / `url`

## 返回解析

- 优先读取 `data[].b64_json`
- 若使用 `response_format=url`，读取 `data[].url` 并在服务端立即下载（链接有有效期）
- 建议持久化字段：`rawMimeType`、`rawStorageKey`、`responseFormat`

## 请求示例（gpt-image-1.5）

```json
{
  "model": "gpt-image-1.5",
  "prompt": "白底电商产品图，柔和阴影",
  "n": 1,
  "size": "1024x1024",
  "background": "auto",
  "moderation": "auto",
  "output_format": "png",
  "quality": "auto"
}
```

## 请求示例（dall-e-3）

```json
{
  "model": "dall-e-3",
  "prompt": "海报插画风格产品展示",
  "n": 1,
  "size": "1024x1792",
  "quality": "hd",
  "response_format": "b64_json",
  "style": "vivid"
}
```
