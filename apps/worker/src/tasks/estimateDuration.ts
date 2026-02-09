import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { DurationEstimateSchema, type DurationEstimate } from '@aixsss/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countTextLength(value: unknown): number {
  if (typeof value !== 'string') return 0;
  return value.replace(/\s+/gu, '').length;
}

function estimateDialogueSeconds(dialogues: unknown): number {
  if (!Array.isArray(dialogues)) return 0;
  const lines = dialogues
    .map((line) => (isRecord(line) ? line.content : ''))
    .map((content) => (typeof content === 'string' ? content : ''))
    .filter((content) => content.trim().length > 0);
  const chars = lines.reduce((sum, content) => sum + countTextLength(content), 0);
  const seconds = lines.length * 0.4 + chars / 6.5;
  return Number(Math.max(0, seconds).toFixed(1));
}

function estimateActionSeconds(scene: { motionPrompt: string; shotPrompt: string }): number {
  const base = 2.8;
  const motionBoost = Math.min(3.5, countTextLength(scene.motionPrompt) / 110);
  const shotBoost = Math.min(2.5, countTextLength(scene.shotPrompt) / 220);
  return Number((base + motionBoost + shotBoost).toFixed(1));
}

function estimateTransitionSeconds(transitionOutJson: unknown): number {
  if (!isRecord(transitionOutJson)) return 0.2;
  const type = transitionOutJson.type;
  if (type === 'cut') return 0.2;
  if (type === 'jump_cut') return 0.15;
  if (type === 'smash_cut') return 0.1;
  if (type === 'dissolve' || type === 'cross_dissolve') return 1.0;
  if (type === 'fade_out' || type === 'fade_to_black' || type === 'dip_to_black') return 1.2;
  return 0.5;
}

function estimatePauseSeconds(soundDesignJson: unknown): number {
  if (!isRecord(soundDesignJson)) return 0.6;
  const cues = Array.isArray(soundDesignJson.cues) ? soundDesignJson.cues : [];
  const silenceCount = cues.filter((cue) => isRecord(cue) && cue.type === 'silence').length;
  const pause = 0.4 + silenceCount * 0.25;
  return Number(Math.min(2, pause).toFixed(1));
}

function buildDurationEstimate(scene: {
  order: number;
  dialogues: unknown;
  motionPrompt: string;
  shotPrompt: string;
  transitionOutJson: unknown;
  soundDesignJson: unknown;
}): DurationEstimate {
  const dialogueSec = estimateDialogueSeconds(scene.dialogues);
  const actionSec = estimateActionSeconds({ motionPrompt: scene.motionPrompt, shotPrompt: scene.shotPrompt });
  const transitionSec = estimateTransitionSeconds(scene.transitionOutJson);
  const pauseSec = estimatePauseSeconds(scene.soundDesignJson);
  const totalSec = Number((dialogueSec + actionSec + transitionSec + pauseSec).toFixed(1));
  const estimate = {
    dialogueSec,
    actionSec,
    transitionSec,
    pauseSec,
    totalSec,
    confidence: 'medium' as const,
    breakdown: [
      {
        sceneOrder: scene.order,
        seconds: totalSec,
        source: 'heuristic_v1',
      },
    ],
  };
  return DurationEstimateSchema.parse(estimate);
}

export async function estimateDuration(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      episodeId: true,
      order: true,
      dialogues: true,
      motionPrompt: true,
      shotPrompt: true,
      transitionOutJson: true,
      soundDesignJson: true,
    },
  });
  if (!scene) throw new Error('Scene not found');

  await updateProgress({ pct: 30, message: '估算分镜时长...' });
  const estimate = buildDurationEstimate({
    order: scene.order,
    dialogues: scene.dialogues,
    motionPrompt: scene.motionPrompt,
    shotPrompt: scene.shotPrompt,
    transitionOutJson: scene.transitionOutJson,
    soundDesignJson: scene.soundDesignJson,
  });

  await updateProgress({ pct: 70, message: '写入时长估算...' });
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      durationEstimateJson: estimate as unknown as Prisma.InputJsonValue,
    },
  });

  if (scene.episodeId) {
    const episodeScenes = await prisma.scene.findMany({
      where: { episodeId: scene.episodeId },
      orderBy: { order: 'asc' },
      select: { order: true, durationEstimateJson: true },
    });

    const breakdown = episodeScenes
      .map((s) => {
        if (!isRecord(s.durationEstimateJson)) return null;
        const sec = s.durationEstimateJson.totalSec;
        if (typeof sec !== 'number') return null;
        return { sceneOrder: s.order, seconds: sec, source: 'scene.durationEstimateJson' };
      })
      .filter((item): item is { sceneOrder: number; seconds: number; source: string } => Boolean(item));

    if (breakdown.length > 0) {
      const totalSec = Number(breakdown.reduce((sum, item) => sum + item.seconds, 0).toFixed(1));
      await prisma.episode.update({
        where: { id: scene.episodeId },
        data: {
          durationEstimateJson: {
            dialogueSec: Number(breakdown.reduce((sum, item) => sum + item.seconds * 0.3, 0).toFixed(1)),
            actionSec: Number(breakdown.reduce((sum, item) => sum + item.seconds * 0.55, 0).toFixed(1)),
            transitionSec: Number(breakdown.length * 0.2),
            pauseSec: Number(breakdown.length * 0.1),
            totalSec,
            confidence: 'medium',
            breakdown,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  await updateProgress({ pct: 100, message: '完成' });

  return {
    sceneId,
    totalSec: estimate.totalSec,
    durationEstimate: estimate,
  };
}

