# OpenAI-img 图片编辑（DMXAPI）

## 端点

- `POST https://www.dmxapi.cn/v1/images/edits`
- 请求体为 `multipart/form-data`

## 模型支持

- `gpt-image-1.5`
- `gpt-image-1`
- `gpt-image-1-mini`
- `dall-e-3` 不支持编辑端点

## 输入约束

- 支持 1~16 张图片
- 单图大小 `< 50MB`
- 格式建议：`png` / `jpg` / `webp`

## 参数矩阵

- 通用：`model`、`prompt`、`size`、`quality`
- 仅 `gpt-image-*`：`background`、`output_format`、`output_compression`
- `input_fidelity`：仅 `gpt-image-1.5` / `gpt-image-1`，`gpt-image-1-mini` 不支持

## 关键约束

- `input_fidelity`: `high` / `low`
- `size`: `1024x1024` / `1536x1024` / `1024x1536` / `auto`
- `output_compression` 仅在 `output_format=jpeg/webp` 时有效

## 返回解析

- 读取 `data[].b64_json`
- 编辑接口通常返回单图；需要组图时由上层循环调用

## 典型 payload（字段）

- `model=gpt-image-1.5`
- `prompt=保留主体，替换背景为纯白`
- `size=1024x1024`
- `background=auto`
- `input_fidelity=high`
- `output_format=png`
- `quality=high`
- `image=<binary>` (可重复)

## 落地建议

- 服务端先校验 `projectId`、图片类型、大小，再进入模型调用
- 对多图编辑开启显式开关，避免误选大量图片导致高成本
- 对 `mini` 模型禁用 `input_fidelity`，在前端直接隐藏
