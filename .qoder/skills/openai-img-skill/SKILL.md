---
name: openai-img-skill
description: 通过 DMXAPI 接入 OpenAI-img（gpt-image-1.5/gpt-image-1/gpt-image-1-mini/dall-e-3）的文生图与图片编辑能力，覆盖参数矩阵、模型差异、请求构建、错误处理与路由隔离。当需要在项目中新增或排查 https://www.dmxapi.cn/v1/images/generations 与 /v1/images/edits，或需要把 OpenAI-img 参数面板和能力标签接入前端时使用。
---

# OpenAI-img × DMXAPI 接入 Skill

## 快速开始

- 先运行 `python3 scripts/dmxapi_openai_img.py --dry-run generate --prompt "白底产品图"`，确认端点、鉴权头和请求参数。
- 配置 `DMXAPI_API_KEY` 后去掉 `--dry-run` 发起真实请求，输出保存到 `output/`。
- 做图片编辑时改用 `edit` 子命令，并通过 `--image <path>` 传入 1~16 张图片。

## 工作流

1. 选择模型：`gpt-image-*` 或 `dall-e-3`。
2. 读取对应参考文档并按模型可用参数组装请求。
3. 使用独立 OpenAI-img 调用模块，不复用 Gemini/ARK 的 payload 和解析。
4. 解析返回中的 `b64_json` 或 `url`，统一落盘并回写元信息。
5. 在前端参数面板只展示当前模型/能力标签允许的选项。
6. 为长任务接入状态查询与取消接口，并在前端提供可见进度与取消按钮。
7. 为素材管理接入单张删除能力，避免只能删整个项目。
8. 为 Inpaint 画笔和 Cutout 参数操作接入撤销/重做，降低反复重绘和误操作成本。

## 隔离规则（必须遵守）

- 仅使用 `/v1/images/generations` 与 `/v1/images/edits` 处理 OpenAI-img，不走 `/v1beta/models/*:generateContent`。
- 不复用 Gemini 的 `contents/parts` 结构；OpenAI-img 必须使用 JSON（generations）或 multipart（edits）。
- 将 OpenAI-img 错误码、超时和 requestId 单独映射，避免与其他 provider 共用错误语义。
- 模型差异严格校验：
  - `dall-e-3` 不接收 `background/moderation/output_format/output_compression/input_fidelity`。
  - `gpt-image-*` 不接收 `style/response_format`。
  - `gpt-image-1-mini` 不接收 `input_fidelity`。

## 参数面板接入建议

- 保持三段式 provider 分发：`ark` / `dmxapi_gemini` / `dmxapi_openai_img`。
- 用 `featureTags` 控制 OpenAI-img 特性开关（例如 `oa_transparent_background`、`oa_style_control`）。
- 对 `output_compression` 做联动：仅在 `output_format=jpeg/webp` 时可编辑。

## 工程化必做能力

- 进度查询：提供 `GET /api/projects/:projectId/generations/:generationId/status`，返回 `status/phase/message/current/total`。
- 取消生成：提供 `POST /api/projects/:projectId/generations/:generationId/cancel`，并将任务状态落为 `cancelled`。
- 失败重试：前端提供“重试上次失败”按钮，复用失败请求参数直接重发，避免手动重填。
- 单素材删除：提供 `DELETE /api/assets/:assetId`，前端至少在画布或历史列表提供入口。
- 批量操作：提供批量下载 ZIP、批量删除、批量导出（JSON/CSV），满足电商团队常见运营场景。
- 编辑撤销/重做：
  - Inpaint：为画笔/橡皮/清空维护本地 mask 历史栈，支持撤销与重做。
  - Cutout：为参数与结果维护本地历史快照，支持回退到上次成功抠图结果。

## 资源导航

- 文生图参数矩阵：`references/openai-img-generations.md`
- 图片编辑参数矩阵：`references/openai-img-edits.md`
- 架构隔离与异常处理：`references/openai-img-integration-guardrails.md`
- 最小可运行脚本：`scripts/dmxapi_openai_img.py`
