---
name: nanobananapro-dmxapi-skill
description: 通过第三方路由 DMXAPI 接入 Google Gemini 图像模型（Nano Banana / nanobananapro），覆盖文生图、图片编辑、 多图融合、多轮图片修改与返回结果解析（inlineData / data:image;base64 文本）。当需要在项目中集成或排查 https://www.dmxapi.cn 的 /v1beta/models/*:generateContent（x-goog-api-key/Authorization 鉴权、generationConfig、thoughtSignature、多模态 parts）时使用；也适用于查阅/复用本 Skill 的 references 示例与 scripts 工具快速跑通最小闭环。
---

# Nano Banana（Gemini 图像）× DMXAPI 接入 Skill

## 快速开始（最小闭环）

- 在本 Skill 目录下运行 `python3 scripts/dmxapi_gemini_image.py --prompt "一只可爱的小猫在愉快的玩耍" --dry-run`，确认端点/请求体拼装是否符合预期。
- 设置环境变量 `DMXAPI_API_KEY`（或直接传 `--api-key`），再去掉 `--dry-run` 发起真实请求并保存图片到 `output/`。
- 需要“图片编辑/融合”时追加 `--image <path>`（可多次传入多张图片）。

## 工作流决策

- **只想接入/跑通调用**：优先用 `scripts/dmxapi_gemini_image.py`（零第三方依赖），先把鉴权、端点、响应解析跑通。
- **要把能力集成进项目代码**：按需求阅读 `references/` 的对应文档并把请求/解析逻辑迁移到项目内。
- **遇到返回结构不稳定、解析失败**：先读 `references/gemini-response-format-variance.md`，再根据“解析规则”做兼容。

## 接入要点（务必对齐）

### 1) 端点与模型

- **基础域名**：`https://www.dmxapi.cn`
- **核心端点（Gemini 风格）**：`/v1beta/models/<model>:generateContent`
- **常用模型名**：
  - `gemini-3-pro-image-preview`：支持 1K/2K/4K，适合高质量编辑/融合/多轮
  - `gemini-2.5-flash-image`：1K，更快（部分参数可能不支持，见参考文档）

### 2) 鉴权头（优先级与排查）

该仓库示例同时出现两种写法；以能成功鉴权为准：

- **优先尝试**：`x-goog-api-key: <sk-...>`
- **不通再试**：`Authorization: <sk-...>`（必要时再尝试 `Authorization: Bearer <sk-...>`）

### 3) 请求体结构（最常用形态）

- `contents[].parts[]` 同时放文本与图片：
  - 文本：`{"text": "..."}`
  - 图片：`{"inline_data": {"mime_type": "image/png", "data": "<base64>"}}`
- 可选 `generationConfig`：
  - `responseModalities`: `["IMAGE"]` 或 `["TEXT","IMAGE"]`
  - `imageConfig`: `aspectRatio`（如 `1:1`、`16:9`）、`imageSize`（如 `1K`/`2K`/`4K`）

### 4) 返回解析规则（必须兼容）

- **常规**：`candidates[].content.parts[].inlineData`（注意是 `inlineData` 驼峰）里有 `mimeType` + `data(base64)`，同级可能有 `thoughtSignature`。
- **非常规**：同一位置可能返回 `text: "data:image/png;base64,..."`，需要从文本中提取 base64。
- **其他**：可能出现 `fileData.fileUri`（返回链接而非 base64）。

### 5) 多轮图片修改（关键点）

- 将上一轮模型返回的图片 base64（inlineData.data）和 `thoughtSignature` 原样带回到下一轮的 `contents` 历史中（作为 `role: "model"` 的 part），再追加新的 user 修改指令。
- 具体可运行示例见 `references/gemini-multi-turn-image-edit.md`。

## 资源导航（按需加载）

- **快速接入（OpenAI 兼容文本对话）**：`references/dmxapi-quickstart.md`
- **图片编辑（单图修改）**：`references/gemini-image-edit.md`
- **多图融合**：`references/gemini-multi-image-fusion.md`
- **多轮图片修改**：`references/gemini-multi-turn-image-edit.md`
- **返回格式不稳定说明/复现代码**：`references/gemini-response-format-variance.md`

## 实操建议（提效）

- 需要快速定位字段/示例时，优先在 `references/` 下全文搜索（例如 `grep -RIn "thoughtSignature" references`）。
- 要在新项目落地时，先用脚本跑通一次真实请求，再把“端点、鉴权头、请求体、解析逻辑”迁移到项目代码，避免一上来就做大集成导致定位困难。
