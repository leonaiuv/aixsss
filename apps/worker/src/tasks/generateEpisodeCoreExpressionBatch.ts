import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { generateEpisodeCoreExpression } from './generateEpisodeCoreExpression.js';

type FailedEpisode = { episodeId: string; order: number; error: string };

type BatchProgress = {
  pct?: unknown;
  message?: unknown;
  completedEpisodeIds?: unknown;
  skippedEpisodeIds?: unknown;
  failedEpisodes?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePreviousProgress(progress: unknown): {
  completedEpisodeIds: string[];
  skippedEpisodeIds: string[];
  failedEpisodes: FailedEpisode[];
} {
  const raw = progress as BatchProgress | undefined;
  const completedEpisodeIds = Array.isArray(raw?.completedEpisodeIds)
    ? raw.completedEpisodeIds.filter((id): id is string => typeof id === 'string')
    : [];
  const skippedEpisodeIds = Array.isArray(raw?.skippedEpisodeIds)
    ? raw.skippedEpisodeIds.filter((id): id is string => typeof id === 'string')
    : [];
  const failedEpisodes = Array.isArray(raw?.failedEpisodes)
    ? raw.failedEpisodes
        .map((entry) => {
          if (!isRecord(entry)) return null;
          const episodeId = entry.episodeId;
          const order = entry.order;
          const error = entry.error;
          if (typeof episodeId !== 'string' || typeof order !== 'number') return null;
          return { episodeId, order, error: typeof error === 'string' ? error : '未知错误' };
        })
        .filter((v): v is FailedEpisode => Boolean(v))
    : [];
  return { completedEpisodeIds, skippedEpisodeIds, failedEpisodes };
}

export async function generateEpisodeCoreExpressionBatch(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  episodeIds?: string[];
  force?: boolean;
  updateProgress: (progress: JobProgress) => Promise<void>;
  previousProgress?: unknown;
}) {
  const {
    prisma,
    projectId,
    teamId,
    aiProfileId,
    apiKeySecret,
    updateProgress,
    episodeIds,
    previousProgress,
    force,
  } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new Error('Project not found');

  const episodes = await prisma.episode.findMany({
    where: {
      projectId,
      ...(episodeIds && episodeIds.length > 0 ? { id: { in: episodeIds } } : {}),
    },
    select: { id: true, order: true, coreExpression: true },
    orderBy: { order: 'asc' },
  });

  if (episodes.length === 0) throw new Error('No episodes found');

  const previous = parsePreviousProgress(previousProgress);
  const completed = new Set(previous.completedEpisodeIds);
  const skipped = new Set(previous.skippedEpisodeIds);
  const failedMap = new Map(previous.failedEpisodes.map((entry) => [entry.episodeId, entry]));

  // 默认只生成缺失的 coreExpression（避免意外覆盖/额外成本）
  if (!force) {
    for (const ep of episodes) {
      if (ep.coreExpression && !completed.has(ep.id) && !failedMap.has(ep.id)) skipped.add(ep.id);
    }
  }

  const orderedEpisodes = episodes.filter((ep) => !completed.has(ep.id) && !skipped.has(ep.id) && !failedMap.has(ep.id));
  const totalEpisodes = episodes.length;
  const initialProcessed = totalEpisodes - orderedEpisodes.length;

  const buildProgress = (progress: {
    pct: number | null;
    message: string | null;
    currentEpisodeId?: string;
    currentEpisodeOrder?: number;
  }): JobProgress => {
    return {
      pct: progress.pct,
      message: progress.message,
      totalEpisodes,
      completedEpisodeIds: [...completed],
      skippedEpisodeIds: [...skipped],
      failedEpisodes: [...failedMap.values()],
      currentEpisodeId: progress.currentEpisodeId ?? null,
      currentEpisodeOrder: progress.currentEpisodeOrder ?? null,
    } satisfies JobProgress;
  };

  let processed = initialProcessed;
  if (processed > 0) {
    const pct = Math.round((processed / totalEpisodes) * 100);
    await updateProgress(buildProgress({ pct, message: '已恢复上次进度' }));
  }

  for (const ep of orderedEpisodes) {
    const base = processed / totalEpisodes;
    await updateProgress(
      buildProgress({
        pct: Math.round(base * 100),
        message: `准备生成第 ${ep.order} 集核心表达（${processed + 1}/${totalEpisodes}）...`,
        currentEpisodeId: ep.id,
        currentEpisodeOrder: ep.order,
      }),
    );

    try {
      await generateEpisodeCoreExpression({
        prisma,
        teamId,
        projectId,
        episodeId: ep.id,
        aiProfileId,
        apiKeySecret,
        updateProgress: async (episodeProgress) => {
          const pct =
            typeof (episodeProgress as { pct?: unknown }).pct === 'number'
              ? (episodeProgress as { pct: number }).pct
              : null;
          const message =
            typeof (episodeProgress as { message?: unknown }).message === 'string'
              ? (episodeProgress as { message: string }).message
              : null;
          const delta = pct !== null ? pct / 100 : 0;
          const overall = Math.round(((processed + delta) / totalEpisodes) * 100);
          await updateProgress(
            buildProgress({
              pct: overall,
              message: message ? `第 ${ep.order} 集：${message}` : `生成第 ${ep.order} 集核心表达...`,
              currentEpisodeId: ep.id,
              currentEpisodeOrder: ep.order,
            }),
          );
        },
      });
      completed.add(ep.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failedMap.set(ep.id, { episodeId: ep.id, order: ep.order, error: detail });
    } finally {
      processed += 1;
      const pct = Math.round((processed / totalEpisodes) * 100);
      await updateProgress(
        buildProgress({
          pct,
          message: `已处理 ${processed}/${totalEpisodes}`,
          currentEpisodeId: undefined,
          currentEpisodeOrder: undefined,
        }),
      );
    }
  }

  await updateProgress(buildProgress({ pct: 100, message: '批量生成完成' }));

  return {
    totalEpisodes,
    completedEpisodeIds: [...completed],
    skippedEpisodeIds: [...skipped],
    failedEpisodes: [...failedMap.values()],
  };
}

