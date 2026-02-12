import type { PrismaClient, Prisma } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { generateImagesWithProvider } from '../providers/index.js';
import { extractModelOverrides, styleFullPrompt, toProviderImageConfig } from './common.js';
import { GENERATED_IMAGE_KEYFRAMES, type GeneratedImageKeyframe } from '@aixsss/shared';

type LegacyKeyframeLocaleBlock = {
  subjects?: Array<{
    name?: string;
    position?: string;
    pose?: string;
    action?: string;
    expression?: string;
    gaze?: string;
    interaction?: string;
  }>;
  usedAnchors?: string[];
  composition?: string;
  bubbleSpace?: string;
};

type LegacyKeyframeJsonData = {
  camera?: {
    type?: string;
    angle?: string;
    aspectRatio?: string;
  };
  keyframes?: Record<string, { zh?: LegacyKeyframeLocaleBlock; en?: LegacyKeyframeLocaleBlock } | undefined>;
  avoid?: { zh?: string; en?: string };
};

type StoryboardPromptV2 = {
  storyboard_config?: {
    layout?: string;
    aspect_ratio?: string;
    style?: string;
    visual_anchor?: {
      character?: string;
      environment?: string;
      lighting?: string;
      mood?: string;
    };
  };
  shots?: Array<{
    shot_number?: string;
    type?: string;
    type_cn?: string;
    description?: string;
    angle?: string;
    focus?: string;
  }>;
  technical_requirements?: {
    consistency?: string;
    composition?: string;
    quality?: string;
  };
};

type ParsedShotPrompt =
  | { kind: 'v2'; data: StoryboardPromptV2 }
  | { kind: 'legacy'; data: LegacyKeyframeJsonData }
  | null;

type KeyframeKey = (typeof GENERATED_IMAGE_KEYFRAMES)[number];

type StoredGeneratedImage = {
  keyframe: KeyframeKey;
  url: string;
  prompt?: string;
  revisedPrompt?: string;
  provider?: string;
  model?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

function isKeyframeKey(value: unknown): value is KeyframeKey {
  return (
    typeof value === 'string' &&
    (GENERATED_IMAGE_KEYFRAMES as readonly string[]).includes(value)
  );
}

function parseExistingGeneratedImages(value: unknown): StoredGeneratedImage[] {
  if (!Array.isArray(value)) return [];
  const parsed: StoredGeneratedImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (!isKeyframeKey(raw.keyframe)) continue;
    if (typeof raw.url !== 'string' || !raw.url.trim()) continue;

    const record: StoredGeneratedImage = {
      keyframe: raw.keyframe,
      url: raw.url.trim(),
    };
    if (typeof raw.prompt === 'string') record.prompt = raw.prompt;
    if (typeof raw.revisedPrompt === 'string') record.revisedPrompt = raw.revisedPrompt;
    if (typeof raw.provider === 'string') record.provider = raw.provider;
    if (typeof raw.model === 'string') record.model = raw.model;
    if (typeof raw.createdAt === 'string') record.createdAt = raw.createdAt;
    if (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) {
      record.metadata = raw.metadata as Record<string, unknown>;
    }

    parsed.push(record);
  }
  return parsed;
}

type PersistedImagePayload = {
  url: string;
  metadata?: Record<string, unknown>;
};

function isHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function persistGeneratedImageUrl(url: string): Promise<PersistedImagePayload> {
  const trimmed = url.trim();
  if (!trimmed) return { url };
  if (trimmed.startsWith('data:image/')) {
    return {
      url: trimmed,
      metadata: { persistence: 'data_uri' },
    };
  }
  if (!isHttpUrl(trimmed)) {
    return {
      url: trimmed,
      metadata: { persistence: 'provider_url' },
    };
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawContentType = (response.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase();
    const mimeType = rawContentType.startsWith('image/') ? rawContentType : 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error('empty image body');

    return {
      url: `data:${mimeType};base64,${bytes.toString('base64')}`,
      metadata: {
        persistence: 'data_uri',
        providerUrl: trimmed,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[generateKeyframeImages] persist image failed, fallback to provider url: ${detail}`);
    return {
      url: trimmed,
      metadata: {
        persistence: 'provider_url',
      },
    };
  }
}

function tryParseJson<T>(text: string): T | null {
  try {
    const parsed = JSON.parse(text) as T;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseShotPrompt(text: string): ParsedShotPrompt {
  const parsed = tryParseJson<Record<string, unknown>>(text);
  if (!parsed) return null;
  if (Array.isArray(parsed.shots) && parsed.shots.length > 0) {
    return { kind: 'v2', data: parsed as StoryboardPromptV2 };
  }
  if (parsed.keyframes && typeof parsed.keyframes === 'object') {
    return { kind: 'legacy', data: parsed as LegacyKeyframeJsonData };
  }
  return null;
}

function buildKeyframePromptFromJson(args: {
  camera?: LegacyKeyframeJsonData['camera'];
  locale?: LegacyKeyframeLocaleBlock;
  avoid?: string;
}): string {
  const lines: string[] = [];
  if (args.camera) {
    const cameraParts = [
      args.camera.type ? `type=${args.camera.type}` : null,
      args.camera.angle ? `angle=${args.camera.angle}` : null,
      args.camera.aspectRatio ? `aspectRatio=${args.camera.aspectRatio}` : null,
    ].filter(Boolean);
    if (cameraParts.length > 0) lines.push(`Camera: ${cameraParts.join(', ')}`);
  }

  if (args.locale?.subjects && args.locale.subjects.length > 0) {
    const subjectLines = args.locale.subjects.map((subject) => {
      const parts = [
        subject.name,
        subject.position,
        subject.pose,
        subject.action,
        subject.expression,
        subject.gaze,
        subject.interaction,
      ].filter(Boolean);
      return parts.join(' / ');
    });
    lines.push(`Subjects: ${subjectLines.join(' | ')}`);
  }

  if (args.locale?.usedAnchors && args.locale.usedAnchors.length > 0) {
    lines.push(`Anchors: ${args.locale.usedAnchors.join(', ')}`);
  }
  if (args.locale?.composition) lines.push(`Composition: ${args.locale.composition}`);
  if (args.locale?.bubbleSpace) lines.push(`BubbleSpace: ${args.locale.bubbleSpace}`);
  if (args.avoid) lines.push(`Avoid: ${args.avoid}`);

  return lines.join('\n').trim();
}

function buildStoryboardPromptV2(args: {
  storyboard: StoryboardPromptV2;
  keyframe: KeyframeKey;
  index: number;
}): string {
  const shot = args.storyboard.shots?.[args.index];
  if (!shot) return '';

  const visualAnchor = args.storyboard.storyboard_config?.visual_anchor;
  const tech = args.storyboard.technical_requirements;
  const lines: string[] = [
    `Keyframe: ${args.keyframe}`,
    `Shot: ${shot.shot_number || `分镜${args.index + 1}`} | ${shot.type || '-'} (${shot.type_cn || '-'})`,
    `Angle: ${shot.angle || '-'}`,
    `Focus: ${shot.focus || '-'}`,
    `Description: ${shot.description || '-'}`,
    `storyboard_config: ${JSON.stringify(args.storyboard.storyboard_config ?? {})}`,
    `visual_anchor: ${JSON.stringify(visualAnchor ?? {})}`,
    `technical_requirements: ${JSON.stringify(tech ?? {})}`,
  ];

  return lines.join('\n');
}

function buildKeyframePrompt(args: {
  rawText: string;
  keyframe: KeyframeKey;
  parsed: ParsedShotPrompt;
  index: number;
}): string {
  if (args.parsed?.kind === 'v2') {
    const v2Prompt = buildStoryboardPromptV2({
      storyboard: args.parsed.data,
      keyframe: args.keyframe,
      index: args.index,
    });
    if (v2Prompt) return v2Prompt;
  }

  if (args.parsed?.kind === 'legacy') {
    const json = args.parsed.data;
    const kf = json.keyframes?.[args.keyframe];
    const locale = kf?.en || kf?.zh;
    const avoid = json.avoid?.en || json.avoid?.zh;
    const prompt = buildKeyframePromptFromJson({
      camera: json.camera,
      locale,
      avoid,
    });
    if (prompt) return prompt;
  }

  return `${args.rawText}\n\nKeyframe: ${args.keyframe}`.trim();
}

export async function generateKeyframeImages(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
  keyframeKey?: GeneratedImageKeyframe;
}) {
  const {
    prisma,
    teamId,
    projectId,
    sceneId,
    aiProfileId,
    apiKeySecret,
    updateProgress,
    keyframeKey,
  } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, sceneDescription: true, shotPrompt: true, generatedImages: true },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.shotPrompt?.trim()) throw new Error('Keyframe prompt missing');
  if (keyframeKey && !isKeyframeKey(keyframeKey)) {
    throw new Error(`Invalid keyframe key: ${keyframeKey}`);
  }

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: {
      provider: true,
      model: true,
      baseURL: true,
      apiKeyEncrypted: true,
      imageApiKeyEncrypted: true,
      generationParams: true,
    },
  });
  if (!profile) throw new Error('AI profile not found');

  const basePromptParts = [];
  const style = styleFullPrompt(project);
  if (style) basePromptParts.push(`Style: ${style}`);
  if (scene.sceneDescription?.trim())
    basePromptParts.push(`Scene: ${scene.sceneDescription.trim()}`);

  const textApiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const imageApiKey = profile.imageApiKeyEncrypted
    ? decryptApiKey(profile.imageApiKeyEncrypted, apiKeySecret)
    : '';
  const providerConfig = toProviderImageConfig(profile);
  const overrides = extractModelOverrides(profile.generationParams ?? null);
  const imageProviderOverride = overrides?.imageProvider;
  const textProviderUi =
    profile.provider === 'openai_compatible'
      ? 'openai-compatible'
      : profile.provider === 'doubao_ark'
        ? 'doubao-ark'
        : profile.provider;
  const needsSeparateImageKey =
    imageProviderOverride === 'nanobananapro-dmxapi' ||
    (typeof imageProviderOverride === 'string' && imageProviderOverride !== textProviderUi);
  if (needsSeparateImageKey && !imageApiKey.trim()) {
    throw new Error('图片 API Key 未配置：请在 AI 设置中填写图片 API Key。');
  }
  providerConfig.apiKey = needsSeparateImageKey ? imageApiKey.trim() : textApiKey;

  const parsedShotPrompt = parseShotPrompt(scene.shotPrompt);
  const detectedKeyframes: KeyframeKey[] = (() => {
    if (parsedShotPrompt?.kind === 'v2') {
      const shotCount = parsedShotPrompt.data.shots?.length ?? 0;
      if (shotCount > 0) return GENERATED_IMAGE_KEYFRAMES.slice(0, shotCount) as KeyframeKey[];
    }
    if (parsedShotPrompt?.kind === 'legacy') {
      const present = GENERATED_IMAGE_KEYFRAMES.filter((kf) => Boolean(parsedShotPrompt.data.keyframes?.[kf]));
      if (present.length > 0) return present;
    }
    return ['KF0', 'KF1', 'KF2'] as KeyframeKey[];
  })();
  const keyframes: KeyframeKey[] = keyframeKey ? [keyframeKey] : detectedKeyframes;

  // 用于累积已生成的图片，每生成一张就立即保存，避免崩溃后全部丢失
  const generatedImages: StoredGeneratedImage[] = [];
  const storedImageMap = new Map<KeyframeKey, StoredGeneratedImage>();
  for (const entry of parseExistingGeneratedImages(scene.generatedImages)) {
    storedImageMap.set(entry.keyframe, entry);
  }

  const newlyGeneratedImages: Array<{
    keyframe: KeyframeKey;
    url: string;
    prompt: string;
    revisedPrompt?: string;
    provider: string;
    model: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  }> = [];

  await updateProgress({ pct: 5, message: '准备关键帧提示词...' });

  for (let i = 0; i < keyframes.length; i += 1) {
    const keyframe = keyframes[i];
    const keyframeIndex = GENERATED_IMAGE_KEYFRAMES.indexOf(keyframe);
    const keyframePrompt = buildKeyframePrompt({
      rawText: scene.shotPrompt,
      keyframe,
      parsed: parsedShotPrompt,
      index: keyframeIndex >= 0 ? keyframeIndex : i,
    });
    const fullPrompt = [...basePromptParts, keyframePrompt].filter(Boolean).join('\n\n');

    const pct = 10 + Math.floor(((i + 0.5) / keyframes.length) * 85);
    await updateProgress({
      pct,
      message: `生成 ${keyframe} 图片 (${i + 1}/${keyframes.length})...`,
    });

    try {
      const imageRes = await generateImagesWithProvider(providerConfig, fullPrompt);
      const image = imageRes.images[0];

      if (image?.url) {
        const persistedImage = await persistGeneratedImageUrl(image.url);

        // 每生成一张图片就立即保存到数据库
        const imageEntry: (typeof newlyGeneratedImages)[number] = {
          keyframe,
          url: persistedImage.url,
          prompt: fullPrompt,
          provider: profile.provider,
          model: providerConfig.model || 'unknown',
          createdAt: new Date().toISOString(),
        };
        if (persistedImage.metadata) {
          imageEntry.metadata = persistedImage.metadata;
        }
        if (image.revisedPrompt) {
          imageEntry.revisedPrompt = image.revisedPrompt;
        }
        newlyGeneratedImages.push(imageEntry);
        storedImageMap.set(keyframe, imageEntry);
        generatedImages.length = 0;
        for (const kf of GENERATED_IMAGE_KEYFRAMES) {
          const item = storedImageMap.get(kf);
          if (item) generatedImages.push(item);
        }

        // 增量写入数据库，确保已生成的图片不会丢失
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            generatedImages: generatedImages as Prisma.InputJsonValue,
          },
        });

        const donePct = 10 + Math.floor(((i + 1) / keyframes.length) * 85);
        await updateProgress({
          pct: donePct,
          message: `${keyframe} 已保存 (${i + 1}/${keyframes.length})`,
          // 在进度中附带已完成的图片数量，便于前端实时刷新
          completedImages: newlyGeneratedImages.length,
          latestImage: imageEntry,
        });
      } else {
        // 图片生成失败但不中断流程，继续下一张
        console.warn(`[generateKeyframeImages] ${keyframe} 生成失败：无图片URL`);
        await updateProgress({
          pct: 10 + Math.floor(((i + 1) / keyframes.length) * 85),
          message: `${keyframe} 生成失败，继续下一张...`,
        });
      }
    } catch (err) {
      // 单张图片生成失败不中断整个流程
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[generateKeyframeImages] ${keyframe} 生成出错:`, errMsg);
      await updateProgress({
        pct: 10 + Math.floor(((i + 1) / keyframes.length) * 85),
        message: `${keyframe} 出错 (${errMsg})，继续下一张...`,
      });
    }
  }

  await updateProgress({
    pct: 100,
    message: `完成！已生成 ${newlyGeneratedImages.length}/${keyframes.length} 张图片`,
  });

  return {
    sceneId,
    generatedImages: newlyGeneratedImages,
  };
}
