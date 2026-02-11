import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { extractModelOverrides, styleFullPrompt } from './common.js';

type ArkHttpError = Error & { status?: number; statusText?: string; detail?: string };

function normalizeApiKey(apiKey: string): string {
  const trimmed = (apiKey || '').trim();
  return trimmed.replace(/^Bearer\s+/i, '').trim().replace(/\s+/g, '');
}

function normalizeArkModel(model: string): string {
  const trimmed = (model || '').trim();
  if (!trimmed) return '';
  const endpointMatch = trimmed.match(/\bep-[0-9a-zA-Z][0-9a-zA-Z-]*\b/);
  if (endpointMatch?.[0]) return endpointMatch[0];
  return trimmed.replace(/\s+/g, '');
}

function getRequestTimeoutMs(): number {
  const raw = process.env.AI_REQUEST_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 120_000;
}

function getVideoTimeoutMs(): number {
  const raw = process.env.AI_VIDEO_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 30 * 60_000;
}

function getVideoPollIntervalMs(): number {
  const raw = process.env.AI_VIDEO_POLL_INTERVAL_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 3_000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = getRequestTimeoutMs();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === 'AbortError' || /aborted|timeout/i.test(err.message));
    if (isAbort) {
      throw new Error(`上游请求超时（>${timeoutMs}ms）。请检查网络/VPN/供应商可用性，或提高 AI_REQUEST_TIMEOUT_MS。`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function normalizeBaseURL(baseURL?: string): string {
  let base = (baseURL || '').trim();
  if (!base) base = 'https://ark.cn-beijing.volces.com/api/v3';
  return base.replace(/\/+$/, '');
}

async function throwResponseError(response: Response): Promise<never> {
  let detail = '';
  try {
    const data = (await response.json()) as unknown;
    detail = JSON.stringify(data);
  } catch {
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
  }

  const suffix = detail ? ` - ${detail}` : '';
  const hint =
    response.status === 401 || response.status === 403
      ? '\n提示：请确认使用“方舟控制台”生成的 API Key（不是火山引擎 AccessKey/SecretKey），且不要包含 `Bearer ` 前缀或多余空格/换行。'
      : '';
  const err = new Error(
    `Doubao/ARK error (${response.status} ${response.statusText})${suffix}${hint}`,
  ) as ArkHttpError;
  err.status = response.status;
  err.statusText = response.statusText;
  err.detail = detail;
  throw err;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractVideoUrls(task: unknown): string[] {
  if (!isRecord(task)) return [];

  const content = task.content;
  if (isRecord(content)) {
    const direct =
      typeof content.video_url === 'string'
        ? content.video_url
        : typeof content.videoURL === 'string'
          ? content.videoURL
          : typeof content.videoUrl === 'string'
            ? content.videoUrl
            : null;
    if (direct) return [direct];

    const videos = content.videos;
    if (Array.isArray(videos)) {
      return videos
        .map((v) => {
          if (!isRecord(v)) return null;
          const url =
            typeof v.url === 'string'
              ? v.url
              : typeof v.video_url === 'string'
                ? v.video_url
                : typeof v.videoURL === 'string'
                  ? v.videoURL
                  : typeof v.videoUrl === 'string'
                    ? v.videoUrl
                    : null;
          return url || null;
        })
        .filter((u): u is string => Boolean(u));
    }
  }

  return [];
}

async function createContentGenerationTask(args: {
  baseURL: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ taskId: string; raw: unknown }> {
  const url = `${normalizeBaseURL(args.baseURL)}/content_generation/tasks`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: args.model,
      content: [{ type: 'text', text: args.prompt }],
    }),
  });

  if (!response.ok) await throwResponseError(response);
  const data = (await response.json()) as unknown;
  const taskId = isRecord(data) && typeof data.id === 'string' ? data.id : '';
  if (!taskId) throw new Error('Doubao/ARK 视频任务创建失败：缺少 task id');
  return { taskId, raw: data };
}

async function getContentGenerationTask(args: {
  baseURL: string;
  apiKey: string;
  taskId: string;
}): Promise<unknown> {
  const base = normalizeBaseURL(args.baseURL);
  const urlByPath = `${base}/content_generation/tasks/${encodeURIComponent(args.taskId)}`;
  const response = await fetchWithTimeout(urlByPath, {
    method: 'GET',
    headers: { Authorization: `Bearer ${args.apiKey}` },
  });

  if (response.status === 404) {
    const urlByQuery = `${base}/content_generation/tasks?task_id=${encodeURIComponent(args.taskId)}`;
    const retry = await fetchWithTimeout(urlByQuery, {
      method: 'GET',
      headers: { Authorization: `Bearer ${args.apiKey}` },
    });
    if (!retry.ok) await throwResponseError(retry);
    return (await retry.json()) as unknown;
  }

  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as unknown;
}

export async function generateSceneVideo(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      sceneDescription: true,
      motionPrompt: true,
      generatedVideos: true,
    },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.motionPrompt?.trim()) throw new Error('Motion prompt missing');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      // 允许视频链路独立于文本 provider/key
      videoApiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');
  const overrides = extractModelOverrides(profile.generationParams ?? null);
  const videoProviderOverride = overrides?.videoProvider;
  const textProviderUi =
    profile.provider === 'openai_compatible'
      ? 'openai-compatible'
      : profile.provider === 'doubao_ark'
        ? 'doubao-ark'
        : profile.provider;
  const needsSeparateVideoKey = Boolean(
    videoProviderOverride && videoProviderOverride !== textProviderUi,
  );
  const effectiveVideoProvider =
    videoProviderOverride === 'doubao-ark' ? 'doubao_ark' : String(profile.provider);
  if (effectiveVideoProvider !== 'doubao_ark') {
    throw new Error('当前仅支持使用「豆包/方舟(ARK)」配置生成视频。请在 AI 设置中选择豆包/ARK。');
  }

  const textApiKey = normalizeApiKey(decryptApiKey(profile.apiKeyEncrypted, apiKeySecret));
  const videoApiKey = profile.videoApiKeyEncrypted
    ? normalizeApiKey(decryptApiKey(profile.videoApiKeyEncrypted, apiKeySecret))
    : '';
  if (needsSeparateVideoKey && !videoApiKey) {
    throw new Error('视频 API Key 未配置：请在 AI 设置中填写视频 API Key。');
  }
  const apiKey = needsSeparateVideoKey ? videoApiKey : textApiKey;
  if (!apiKey)
    throw new Error('Doubao/ARK API Key 为空：请在 AI 设置中填写正确的 API Key（无需包含 Bearer 前缀）。');
  const videoModel =
    normalizeArkModel(overrides?.videoModel ?? '') || 'doubao-seedance-1-5-pro-251215';
  const baseURL =
    overrides?.videoBaseURL ??
    (String(profile.provider) === 'doubao_ark' ? profile.baseURL ?? undefined : undefined) ??
    'https://ark.cn-beijing.volces.com/api/v3';

  const style = styleFullPrompt(project);
  const prompt = [style ? `Style: ${style}` : null, scene.sceneDescription?.trim() ? `Scene: ${scene.sceneDescription.trim()}` : null, `Motion: ${scene.motionPrompt.trim()}`]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  await updateProgress({ pct: 5, message: '创建视频生成任务...' });

  const created = await createContentGenerationTask({
    baseURL,
    apiKey,
    model: videoModel,
    prompt,
  });

  await updateProgress({ pct: 15, message: `任务已创建（${created.taskId}），生成中...` });

  const startedAt = Date.now();
  const timeoutMs = getVideoTimeoutMs();
  const pollIntervalMs = getVideoPollIntervalMs();

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`视频生成超时（>${timeoutMs}ms）。可提高 AI_VIDEO_TIMEOUT_MS 后重试。taskId=${created.taskId}`);
    }

    const task = await getContentGenerationTask({ baseURL, apiKey, taskId: created.taskId });
    const status = isRecord(task) && typeof task.status === 'string' ? task.status : 'unknown';

    if (status === 'succeeded') {
      const urls = extractVideoUrls(task);
      const url = urls[0] ?? '';
      if (!url) throw new Error('视频任务已成功，但未返回 video url');

      await updateProgress({ pct: 90, message: '写入数据库...' });

      const existing = Array.isArray(scene.generatedVideos) ? scene.generatedVideos : [];
      const next = [
        ...existing,
        {
          url,
          prompt,
          provider: effectiveVideoProvider,
          model: videoModel,
          createdAt: new Date().toISOString(),
          metadata: { taskId: created.taskId, task },
        },
      ];

      await prisma.scene.update({
        where: { id: sceneId },
        data: { generatedVideos: next as Prisma.InputJsonValue },
      });

      await updateProgress({ pct: 100, message: '完成' });

      return { sceneId, taskId: created.taskId, videos: [{ url }], model: videoModel };
    }

    if (status === 'failed') {
      const error =
        isRecord(task) && isRecord(task.error) ? (task.error as Record<string, unknown>) : null;
      const message =
        error && typeof error.message === 'string'
          ? error.message
          : error && typeof error.code === 'string'
            ? error.code
            : 'unknown';
      throw new Error(`视频生成失败：${message}`);
    }

    await updateProgress({ pct: 15, message: `生成中（status=${status}）...` });
    await sleep(pollIntervalMs);
  }
}
