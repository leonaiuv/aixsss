# OpenAI-img 接入隔离与异常处理

## 目标

避免 OpenAI-img 与 Gemini/ARK 之间的调用耦合，防止参数污染、结构错配与回归风险。

## 架构约束

- 为 OpenAI-img 创建独立模块，例如 `src/server/dmxapi/openai-images.ts`。
- 模块内只处理：
  - `/v1/images/generations`
  - `/v1/images/edits`
- 禁止在 OpenAI-img 模块里复用 Gemini 的 `contents/parts` 数据结构。

## 鉴权策略

- 主头：`Authorization: <DMXAPI_API_KEY>`
- 兼容重试：`Authorization: Bearer <DMXAPI_API_KEY>`
- 401/403 视为鉴权失败，切换头重试后仍失败则抛业务错误。

## 错误映射建议

- `401/403 -> AUTH_FAILED`
- `404 -> NOT_FOUND`
- `429 -> RATE_LIMITED`
- `5xx -> UPSTREAM_ERROR`
- `AbortError -> TIMEOUT`
- URL 下载失败（response_format=url）单独映射 `IMAGE_FETCH_FAILED`

## 参数污染防护

- `dall-e-3` 收到 `background/moderation/output_format/output_compression/input_fidelity` 时立即返回 400。
- `gpt-image-*` 收到 `style/response_format` 时立即返回 400。
- `gpt-image-1-mini` 收到 `input_fidelity` 时立即返回 400。

## 前端能力标签建议

- `oa_image_generation`
- `oa_image_edit`
- `oa_multi_image_edit`
- `oa_transparent_background`
- `oa_quality_control`
- `oa_compression_control`
- `oa_style_control`
- `oa_url_output`
- `oa_input_fidelity`

在参数模块中按标签显隐，避免给用户展示无效参数。

## 组图策略

- `group` 建议在应用层控制：
  - 文生图：优先一次请求 `n`（非 `dall-e-3`）
  - 编辑：通常循环请求单图
- 对返回数量不足时补偿重试，最终按目标数量截断。

## 交互与可观测性

- 不要让前端同步阻塞等待 300 秒：至少提供 polling 状态接口。
- 建议状态字段统一：`queued/processing/succeeded/failed/cancelled`。
- 取消应贯穿到 provider 调用层（`AbortSignal`），并在错误映射层识别为 `GENERATION_CANCELLED`。
- 前端在生成中展示实时进度文本，并提供“取消生成”按钮。
- 前端在失败后保留“重试上次失败”动作，直接复用失败请求参数重新提交。
- Inpaint/Cutout 必须支持撤销/重做：
  - Inpaint 撤销/重做应基于前端 mask canvas 快照栈，不增加 provider API 耦合。
  - Cutout 撤销/重做应基于参数+结果快照，不触发新的上游调用。
  - 推荐支持按钮态禁用（无可撤销/可重做步骤时禁用）和固定历史上限（例如 30 步）。

## 资产生命周期

- 提供单素材删除接口：`DELETE /api/assets/:assetId`。
- 提供批量资产接口（建议 `POST /api/projects/:projectId/assets/batch`）统一处理：
  - `download_zip`
  - `delete`
  - `export`（`json/csv`）
- 删除原图后按引用计数清理缩略图，避免孤儿文件。
- 删除后更新项目时间戳并刷新前端预览选择，防止悬空引用。

## 资产落库建议

- 保存原始输出（`generated_raw`）
- 统一转 JPEG 做展示与拼接
- 在 `metaJson` 记录：`model`、`rawMimeType`、`responseFormat`、`inputAssetIds`
