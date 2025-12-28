import type { PrismaClient, Prisma } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { generateImagesWithProvider } from '../providers/index.js';
import type { ImageResult } from '../providers/types.js';
import { styleFullPrompt, toProviderImageConfig } from './common.js';

type KeyframeLocaleBlock = {
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

type KeyframeJsonData = {
  camera?: {
    type?: string;
    angle?: string;
    aspectRatio?: string;
  };
  keyframes?: {
    KF0?: { zh?: KeyframeLocaleBlock; en?: KeyframeLocaleBlock };
    KF1?: { zh?: KeyframeLocaleBlock; en?: KeyframeLocaleBlock };
    KF2?: { zh?: KeyframeLocaleBlock; en?: KeyframeLocaleBlock };
  };
  avoid?: { zh?: string; en?: string };
};

function tryParseJson(text: string): KeyframeJsonData | null {
  try {
    const parsed = JSON.parse(text) as KeyframeJsonData;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    return null;
  }
  return null;
}

function buildKeyframePromptFromJson(args: {
  camera?: KeyframeJsonData['camera'];
  locale?: KeyframeLocaleBlock;
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

function buildKeyframePrompt(text: string, keyframe: 'KF0' | 'KF1' | 'KF2'): string {
  const json = tryParseJson(text);
  if (!json?.keyframes) return `${text}\n\nKeyframe: ${keyframe}`.trim();

  const kf = json.keyframes[keyframe];
  const locale = kf?.en || kf?.zh;
  const avoid = json.avoid?.en || json.avoid?.zh;
  const prompt = buildKeyframePromptFromJson({
    camera: json.camera,
    locale,
    avoid,
  });

  return prompt || `${text}\n\nKeyframe: ${keyframe}`.trim();
}

export async function generateKeyframeImages(args: {
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
    select: { id: true, sceneDescription: true, shotPrompt: true },
  });
  if (!scene) throw new Error('Scene not found');
  if (!scene.shotPrompt?.trim()) throw new Error('Keyframe prompt missing');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const basePromptParts = [];
  const style = styleFullPrompt(project);
  if (style) basePromptParts.push(`Style: ${style}`);
  if (scene.sceneDescription?.trim()) basePromptParts.push(`Scene: ${scene.sceneDescription.trim()}`);

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderImageConfig(profile);
  providerConfig.apiKey = apiKey;

  const keyframes: Array<'KF0' | 'KF1' | 'KF2'> = ['KF0', 'KF1', 'KF2'];
  const results: Array<{
    keyframe: 'KF0' | 'KF1' | 'KF2';
    prompt: string;
    image: ImageResult | null;
  }> = [];

  await updateProgress({ pct: 5, message: '准备关键帧提示词...' });

  for (let i = 0; i < keyframes.length; i += 1) {
    const keyframe = keyframes[i];
    const keyframePrompt = buildKeyframePrompt(scene.shotPrompt, keyframe);
    const fullPrompt = [...basePromptParts, keyframePrompt].filter(Boolean).join('\n\n');

    const pct = 10 + Math.floor((i / keyframes.length) * 70);
    await updateProgress({ pct, message: `生成 ${keyframe} 图片...` });

    const imageRes = await generateImagesWithProvider(providerConfig, fullPrompt);
    results.push({
      keyframe,
      prompt: fullPrompt,
      image: imageRes.images[0] ?? null,
    });
  }

  await updateProgress({ pct: 85, message: '写入数据库...' });

  const generatedImages = results
    .filter((entry) => Boolean(entry.image?.url))
    .map((entry) => ({
      keyframe: entry.keyframe,
      url: entry.image?.url as string,
      prompt: entry.prompt,
      revisedPrompt: entry.image?.revisedPrompt,
      provider: profile.provider,
      model: profile.model,
      createdAt: new Date().toISOString(),
    }));

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      generatedImages: generatedImages as Prisma.InputJsonValue,
    },
  });

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    generatedImages,
  };
}
