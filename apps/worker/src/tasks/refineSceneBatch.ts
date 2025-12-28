import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { refineSceneAll } from './refineSceneAll.js';

type FailedScene = { sceneId: string; order: number; error: string };

type BatchProgress = {
  pct?: unknown;
  message?: unknown;
  completedSceneIds?: unknown;
  failedScenes?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePreviousProgress(progress: unknown): {
  completedSceneIds: string[];
  failedScenes: FailedScene[];
} {
  const raw = progress as BatchProgress | undefined;
  const completedSceneIds = Array.isArray(raw?.completedSceneIds)
    ? raw?.completedSceneIds.filter((id): id is string => typeof id === 'string')
    : [];
  const failedScenes = Array.isArray(raw?.failedScenes)
    ? raw.failedScenes
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const sceneId = entry.sceneId;
          const order = entry.order;
          const error = entry.error;
          if (typeof sceneId !== 'string' || typeof order !== 'number') return null;
          return { sceneId, order, error: typeof error === 'string' ? error : '未知错误' };
        })
        .filter((v): v is FailedScene => Boolean(v))
    : [];
  return { completedSceneIds, failedScenes };
}

export async function refineSceneBatch(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  sceneIds?: string[];
  updateProgress: (progress: JobProgress) => Promise<void>;
  previousProgress?: unknown;
}) {
  const { prisma, projectId, teamId, aiProfileId, apiKeySecret, updateProgress, sceneIds, previousProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true },
  });
  if (!project) {
    throw new Error('Project not found');
  }

  const scenes = await prisma.scene.findMany({
    where: {
      projectId,
      ...(sceneIds && sceneIds.length > 0 ? { id: { in: sceneIds } } : {}),
    },
    select: {
      id: true,
      order: true,
      episode: { select: { order: true } },
    },
    orderBy: [{ episode: { order: 'asc' } }, { order: 'asc' }],
  });

  if (scenes.length === 0) {
    throw new Error('No scenes found');
  }

  const previous = parsePreviousProgress(previousProgress);
  const completed = new Set(previous.completedSceneIds);
  const failedMap = new Map(previous.failedScenes.map((entry) => [entry.sceneId, entry]));

  const orderedScenes = scenes.filter((scene) => !completed.has(scene.id) && !failedMap.has(scene.id));
  const totalScenes = scenes.length;
  const initialProcessed = scenes.length - orderedScenes.length;

  const buildProgress = (progress: {
    pct: number | null;
    message: string | null;
    currentSceneId?: string;
    currentSceneOrder?: number;
  }): JobProgress => {
    return {
      pct: progress.pct,
      message: progress.message,
      totalScenes,
      completedSceneIds: [...completed],
      failedScenes: [...failedMap.values()],
      currentSceneId: progress.currentSceneId ?? null,
      currentSceneOrder: progress.currentSceneOrder ?? null,
    } satisfies JobProgress;
  };

  let processed = initialProcessed;
  if (processed > 0) {
    const pct = Math.round((processed / totalScenes) * 100);
    await updateProgress(buildProgress({ pct, message: '已恢复上次进度', currentSceneId: undefined }));
  }

  for (let index = 0; index < orderedScenes.length; index += 1) {
    const scene = orderedScenes[index];
    const baseProgress = processed / totalScenes;

    await updateProgress(
      buildProgress({
        pct: Math.round(baseProgress * 100),
        message: `准备细化 #${scene.order}（${processed + 1}/${totalScenes}）`,
        currentSceneId: scene.id,
        currentSceneOrder: scene.order,
      }),
    );

    try {
      await refineSceneAll({
        prisma,
        teamId,
        projectId,
        sceneId: scene.id,
        aiProfileId,
        apiKeySecret,
        updateProgress: async (sceneProgress) => {
          const pct = typeof (sceneProgress as { pct?: unknown }).pct === 'number' ? (sceneProgress as { pct: number }).pct : null;
          const message =
            typeof (sceneProgress as { message?: unknown }).message === 'string'
              ? (sceneProgress as { message: string }).message
              : null;
          const delta = pct !== null ? pct / 100 : 0;
          const overall = Math.round(((processed + delta) / totalScenes) * 100);
          await updateProgress(
            buildProgress({
              pct: overall,
              message: message ? `#${scene.order} ${message}` : `细化 #${scene.order}...`,
              currentSceneId: scene.id,
              currentSceneOrder: scene.order,
            }),
          );
        },
      });

      completed.add(scene.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failedMap.set(scene.id, { sceneId: scene.id, order: scene.order, error: detail });
    } finally {
      processed += 1;
      const pct = Math.round((processed / totalScenes) * 100);
      await updateProgress(
        buildProgress({
          pct,
          message: `已处理 ${processed}/${totalScenes}`,
          currentSceneId: undefined,
          currentSceneOrder: undefined,
        }),
      );
    }
  }

  await updateProgress(
    buildProgress({
      pct: 100,
      message: '批量细化完成',
      currentSceneId: undefined,
      currentSceneOrder: undefined,
    }),
  );

  return {
    totalScenes,
    completedSceneIds: [...completed],
    failedScenes: [...failedMap.values()],
  };
}
