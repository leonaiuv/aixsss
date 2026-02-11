import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import {
  getAgentMaxSteps,
  getAgentStepTimeoutMs,
  getAgentTotalTimeoutMs,
  isAgentEpisodeCreationEnabled,
  isAgentFallbackToLegacyEnabled,
} from '../agents/runtime/featureFlags.js';
import { toProviderChatConfig } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { generateEpisodeCoreExpression } from './generateEpisodeCoreExpression.js';
import { generateSceneScript } from './generateSceneScript.js';
import { generateEpisodeSceneList } from './generateEpisodeSceneList.js';
import { refineSceneAll } from './refineSceneAll.js';
import { generateSoundDesign } from './generateSoundDesign.js';
import { estimateDuration } from './estimateDuration.js';

type EpisodeCreationStep =
  | 'core_expression'
  | 'scene_script'
  | 'scene_list'
  | 'scene_refinement'
  | 'sound_and_duration';

type StepSummary = {
  step: EpisodeCreationStep;
  status: 'succeeded' | 'failed' | 'skipped';
  message: string;
  executionMode?: 'agent' | 'legacy';
  fallbackUsed?: boolean;
  chunk?: number;
  sourceJobId?: string;
};

type SceneChildTaskSummary = {
  sceneId: string;
  order: number;
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  error?: string;
  chunk?: number;
};

type SceneChildTaskStats = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};

type SceneSnapshot = {
  id: string;
  order: number;
  status: string;
  soundDesignJson: Prisma.JsonValue | null;
  durationEstimateJson: Prisma.JsonValue | null;
};

const DEFAULT_SCENE_CHUNK_SIZE = 2;
const DEFAULT_SCENE_CONCURRENCY = 2;
const SCENE_CHILD_WAIT_TIMEOUT_MS = 20 * 60_000;
const SCENE_CHILD_POLL_INTERVAL_MS = 800;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

function hasSceneScriptDraft(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

function mapChildProgressPct(childPct: unknown, base: number, span: number): number {
  const pct = typeof childPct === 'number' ? childPct : 0;
  const normalized = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.min(99, Math.round(base + (normalized / 100) * span)));
}

function clampPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

function toSceneChildTaskStats(tasks: SceneChildTaskSummary[]): SceneChildTaskStats {
  const stats: SceneChildTaskStats = {
    total: tasks.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const task of tasks) {
    if (task.status === 'queued') stats.queued += 1;
    if (task.status === 'running') stats.running += 1;
    if (task.status === 'succeeded') stats.succeeded += 1;
    if (task.status === 'failed') stats.failed += 1;
    if (task.status === 'cancelled') stats.cancelled += 1;
  }
  return stats;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) return;
  const workerCount = Math.max(1, Math.min(items.length, concurrency));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        await run(items[index], index);
      }
    }),
  );
}

async function loadEpisode(prisma: PrismaClient, projectId: string, episodeId: string) {
  return await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: {
      id: true,
      order: true,
      title: true,
      summary: true,
      coreExpression: true,
      sceneScriptDraft: true,
    },
  });
}

async function loadEpisodeScenes(prisma: PrismaClient, episodeId: string): Promise<SceneSnapshot[]> {
  return await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      order: true,
      status: true,
      soundDesignJson: true,
      durationEstimateJson: true,
    },
  });
}

function summarizeAgentSteps(trace: unknown): Array<{ index: number; kind: string; summary: string }> {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) return [];
  return trace.steps
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, idx) => {
      const kind = typeof item.kind === 'string' ? item.kind : 'unknown';
      const toolName =
        isRecord(item.toolCall) && typeof item.toolCall.name === 'string'
          ? item.toolCall.name
          : null;
      return {
        index: typeof item.index === 'number' ? item.index : idx + 1,
        kind,
        summary: toolName ? `${kind}:${toolName}` : kind,
      };
    });
}

export async function runEpisodeCreationAgent(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  apiKeySecret: string;
  currentJobId?: string;
  chunkIndex?: number;
  enqueueContinuation?: () => Promise<string>;
  enqueueSceneTask?: (scene: { sceneId: string; order: number }) => Promise<{ jobId: string }>;
  sceneChunkSize?: number;
  sceneConcurrency?: number;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const {
    prisma,
    teamId,
    projectId,
    episodeId,
    aiProfileId,
    apiKeySecret,
    currentJobId,
    chunkIndex,
    enqueueContinuation,
    enqueueSceneTask,
    sceneChunkSize,
    sceneConcurrency,
    updateProgress,
  } = args;
  const refinementChunkSize = clampPositiveInt(sceneChunkSize, DEFAULT_SCENE_CHUNK_SIZE);
  const refinementConcurrency = clampPositiveInt(sceneConcurrency, DEFAULT_SCENE_CONCURRENCY);
  const currentChunk = clampPositiveInt(chunkIndex, 1);

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await loadEpisode(prisma, projectId, episodeId);
  if (!episode) throw new Error('Episode not found');

  const runningConflict = await prisma.aIJob.findFirst({
    where: {
      teamId,
      projectId,
      episodeId,
      type: 'run_episode_creation_agent',
      status: 'running',
      ...(currentJobId ? { id: { not: currentJobId } } : {}),
    },
    select: { id: true },
  });
  if (runningConflict) {
    throw new Error(`Episode creation agent is already running for this episode (${runningConflict.id})`);
  }

  await updateProgress({ pct: 2, message: '单集创作 Agent：准备任务...' });

  let executionMode: 'agent' | 'legacy' = 'legacy';
  let fallbackUsed = false;
  let agentTrace: unknown = null;
  const stepSummaries: StepSummary[] = [];
  const sceneChildTasks: SceneChildTaskSummary[] = [];
  let continuationJobId: string | null = null;

  if (isAgentEpisodeCreationEnabled()) {
    const profile = await prisma.aIProfile.findFirst({
      where: { id: aiProfileId, teamId },
      select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
    });
    if (!profile) throw new Error('AI profile not found');

    const providerConfig = toProviderChatConfig(profile);
    providerConfig.apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
    const systemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.episode_creation.agent.system',
    });

    await updateProgress({ pct: 5, message: '单集创作 Agent 规划中...' });
    const loop = await runJsonToolLoop<{ proceed: true }>({
      initialMessages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            '目标：按顺序完成单集创作五个阶段。',
            `projectId=${projectId}`,
            `episodeId=${episodeId}`,
            '请先读取上下文，再输出 final {"proceed": true}。',
          ].join('\n'),
        },
      ],
      callModel: async (messages, meta) => {
        await updateProgress({
          pct: Math.min(12, 6 + meta.stepIndex * 2),
          message: `单集创作 Agent 执行步骤 ${meta.stepIndex}...`,
        });
        return await chatWithProvider(providerConfig, messages);
      },
      tools: {
        read_episode_context: {
          description: '读取当前剧集上下文状态',
          execute: async () => {
            const ep = await loadEpisode(prisma, projectId, episodeId);
            const scenes = await loadEpisodeScenes(prisma, episodeId);
            return {
              episodeId,
              hasCoreExpression: Boolean(ep?.coreExpression),
              hasSceneScriptDraft: hasSceneScriptDraft(ep?.sceneScriptDraft),
              sceneCount: scenes.length,
              completedSceneCount: scenes.filter((s) => s.status === 'completed').length,
              soundReadyCount: scenes.filter((s) => s.soundDesignJson !== null).length,
              durationReadyCount: scenes.filter((s) => s.durationEstimateJson !== null).length,
            };
          },
        },
      },
      maxSteps: getAgentMaxSteps(),
      stepTimeoutMs: getAgentStepTimeoutMs(),
      totalTimeoutMs: getAgentTotalTimeoutMs(),
      parseFinal: (value) => {
        const ok = isRecord(value) && value.proceed === true;
        if (!ok) throw new Error('Episode creation final must be {"proceed": true}');
        return { proceed: true };
      },
      fallbackEnabled: isAgentFallbackToLegacyEnabled(),
      fallback: async () => ({ final: { proceed: true }, reason: 'episode_creation_agent_failed_use_legacy' }),
    });

    executionMode = loop.executionMode;
    fallbackUsed = loop.fallbackUsed;
    agentTrace = loop.trace;
  }

  const runStep = async (params: {
    step: EpisodeCreationStep;
    title: string;
    basePct: number;
    spanPct: number;
    run: (stepUpdateProgress: (progress: JobProgress) => Promise<void>) => Promise<{
      skipped?: boolean;
      message?: string;
      childResult?: unknown;
    }>;
  }) => {
    await updateProgress({ pct: params.basePct, message: `单集创作 Agent：${params.title}` });
    try {
      const result = await params.run(async (progress) => {
        if (!isRecord(progress)) return;
        await updateProgress({
          ...progress,
          pct: mapChildProgressPct(progress.pct, params.basePct, params.spanPct),
          message:
            typeof progress.message === 'string'
              ? `${params.title}：${progress.message}`
              : params.title,
        });
      });
      const child = result.childResult;
      const childExecutionMode =
        isRecord(child) && (child.executionMode === 'agent' || child.executionMode === 'legacy')
          ? child.executionMode
          : undefined;
      const childFallbackUsed = isRecord(child) && child.fallbackUsed === true;
      stepSummaries.push({
        step: params.step,
        status: result.skipped ? 'skipped' : 'succeeded',
        message: result.message ?? (result.skipped ? '已存在，跳过' : 'ok'),
        executionMode: childExecutionMode,
        fallbackUsed: childFallbackUsed,
        chunk: currentChunk,
        ...(currentJobId ? { sourceJobId: currentJobId } : {}),
      });
      return result;
    } catch (error) {
      const detail = summarizeError(error);
      stepSummaries.push({
        step: params.step,
        status: 'failed',
        message: detail,
        chunk: currentChunk,
        ...(currentJobId ? { sourceJobId: currentJobId } : {}),
      });
      throw new Error(`episode creation step failed [${params.step}]: ${detail}`);
    }
  };

  await runStep({
    step: 'core_expression',
    title: '核心表达',
    basePct: 12,
    spanPct: 16,
    run: async (stepUpdateProgress) => {
      const ep = await loadEpisode(prisma, projectId, episodeId);
      if (!ep) throw new Error('Episode not found');
      if (ep.coreExpression) return { skipped: true, message: '核心表达已存在' };
      const result = await generateEpisodeCoreExpression({
        prisma,
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      });
      return { childResult: result, message: '核心表达已生成' };
    },
  });

  await runStep({
    step: 'scene_script',
    title: '分场脚本',
    basePct: 28,
    spanPct: 16,
    run: async (stepUpdateProgress) => {
      const ep = await loadEpisode(prisma, projectId, episodeId);
      if (!ep) throw new Error('Episode not found');
      if (hasSceneScriptDraft(ep.sceneScriptDraft)) {
        return { skipped: true, message: '分场脚本已存在' };
      }
      const result = await generateSceneScript({
        prisma,
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      });
      return { childResult: result, message: '分场脚本已生成' };
    },
  });

  await runStep({
    step: 'scene_list',
    title: '分镜列表',
    basePct: 44,
    spanPct: 16,
    run: async (stepUpdateProgress) => {
      const scenes = await loadEpisodeScenes(prisma, episodeId);
      if (scenes.length > 0) {
        return { skipped: true, message: '分镜列表已存在' };
      }
      const result = await generateEpisodeSceneList({
        prisma,
        teamId,
        projectId,
        episodeId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      });
      return { childResult: result, message: '分镜列表已生成' };
    },
  });

  await runStep({
    step: 'scene_refinement',
    title: '分镜细化',
    basePct: 60,
    spanPct: 20,
    run: async (stepUpdateProgress) => {
      const scenes = await loadEpisodeScenes(prisma, episodeId);
      if (scenes.length === 0) {
        throw new Error('scene list is empty, cannot refine');
      }
      const pending = scenes.filter((scene) => scene.status !== 'completed');
      if (pending.length === 0) {
        return { skipped: true, message: '分镜已全部细化完成' };
      }
      const slice = pending.slice(0, refinementChunkSize);
      if (enqueueSceneTask) {
        const emitSceneChildProgress = async (pct: number, message: string) => {
          await stepUpdateProgress({
            pct,
            message,
            sceneChildTasks: sceneChildTasks.map((task) => ({ ...task })),
            sceneChildStats: toSceneChildTaskStats(sceneChildTasks),
          });
        };

        const childJobs: Array<{ sceneId: string; jobId: string; order: number }> = [];
        await runWithConcurrency(slice, refinementConcurrency, async (scene, idx) => {
          const child = await enqueueSceneTask({ sceneId: scene.id, order: scene.order });
          childJobs.push({ sceneId: scene.id, jobId: child.jobId, order: scene.order });
          sceneChildTasks.push({
            sceneId: scene.id,
            order: scene.order,
            jobId: child.jobId,
            status: 'queued',
            chunk: currentChunk,
          });
          await emitSceneChildProgress(
            Math.min(35, Math.round(((idx + 1) / Math.max(1, slice.length)) * 30)),
            `派发分镜子任务 #${scene.order}（${idx + 1}/${slice.length}）`,
          );
        });

        const deadline = Date.now() + SCENE_CHILD_WAIT_TIMEOUT_MS;
        while (true) {
          const rows = await prisma.aIJob.findMany({
            where: { id: { in: childJobs.map((x) => x.jobId) } },
            select: { id: true, status: true, error: true },
          });
          const rowMap = new Map(rows.map((row) => [row.id, row] as const));
          for (const task of sceneChildTasks) {
            const row = rowMap.get(task.jobId);
            if (!row) continue;
            if (
              row.status === 'queued' ||
              row.status === 'running' ||
              row.status === 'succeeded' ||
              row.status === 'failed' ||
              row.status === 'cancelled'
            ) {
              task.status = row.status;
            } else {
              task.status = 'unknown';
            }
            if (typeof row.error === 'string' && row.error.trim().length > 0) {
              task.error = row.error;
            }
          }
          const failed = childJobs.find((child) => {
            const row = rowMap.get(child.jobId);
            return row?.status === 'failed' || row?.status === 'cancelled';
          });
          if (failed) {
            const row = rowMap.get(failed.jobId);
            const reason = row?.error ?? row?.status ?? 'unknown';
            throw new Error(`scene child task failed (#${failed.order}, job=${failed.jobId}): ${reason}`);
          }

          const succeeded = childJobs.filter(
            (child) => rowMap.get(child.jobId)?.status === 'succeeded',
          ).length;
          await emitSceneChildProgress(
            Math.min(99, 35 + Math.round((succeeded / Math.max(1, childJobs.length)) * 65)),
            `等待分镜子任务完成（${succeeded}/${childJobs.length}）`,
          );
          if (succeeded >= childJobs.length) break;
          if (Date.now() > deadline) {
            throw new Error(`scene child tasks timeout (${succeeded}/${childJobs.length})`);
          }
          await sleep(SCENE_CHILD_POLL_INTERVAL_MS);
        }
      } else {
        await runWithConcurrency(slice, refinementConcurrency, async (scene, idx) => {
          const base = (idx / Math.max(1, slice.length)) * 100;
          const span = 100 / Math.max(1, slice.length);
          await stepUpdateProgress({
            pct: Math.min(99, Math.round(base)),
            message: `细化分镜 #${scene.order}（${idx + 1}/${slice.length}）`,
          });
          await refineSceneAll({
            prisma,
            teamId,
            projectId,
            sceneId: scene.id,
            aiProfileId,
            apiKeySecret,
            options: {
              includeSoundDesign: true,
              includeDurationEstimate: true,
            },
            updateProgress: async (progress) => {
              const baseProgress = isRecord(progress) ? progress : {};
              await stepUpdateProgress({
                ...baseProgress,
                pct: mapChildProgressPct(isRecord(progress) ? progress.pct : null, base, span),
              });
            },
          });
        });
      }

      const refreshed = await loadEpisodeScenes(prisma, episodeId);
      const remaining = refreshed.filter((scene) => scene.status !== 'completed').length;
      if (remaining > 0 && !continuationJobId && enqueueContinuation) {
        continuationJobId = await enqueueContinuation();
        return {
          message: `已完成 ${slice.length}/${pending.length} 个分镜细化，剩余 ${remaining} 个分镜，已自动续跑`,
        };
      }
      return { message: `已细化 ${slice.length} 个分镜` };
    },
  });

  await runStep({
    step: 'sound_and_duration',
    title: '声音与时长',
    basePct: 80,
    spanPct: 18,
    run: async (stepUpdateProgress) => {
      if (enqueueSceneTask) {
        if (continuationJobId) {
          return { skipped: true, message: '已创建续跑任务，声音与时长由后续分镜子任务自动处理' };
        }
        return { skipped: true, message: '声音与时长已由分镜子任务处理' };
      }
      if (continuationJobId) {
        return { skipped: true, message: '已创建续跑任务，声音与时长将在后续分片中自动生成' };
      }
      const scenes = await loadEpisodeScenes(prisma, episodeId);
      if (scenes.length === 0) {
        throw new Error('scene list is empty, cannot generate sound and duration');
      }
      const work = scenes
        .map((scene) => ({
          scene,
          needSound: scene.soundDesignJson === null,
          needDuration: scene.durationEstimateJson === null,
        }))
        .filter((item) => item.needSound || item.needDuration);

      if (work.length === 0) {
        return { skipped: true, message: '声音与时长已全部就绪' };
      }
      const slice = work.slice(0, refinementChunkSize);

      const totalUnits = slice.reduce(
        (sum, item) => sum + (item.needSound ? 1 : 0) + (item.needDuration ? 1 : 0),
        0,
      );
      let unitIndex = 0;

      const unitProgress = async (
        label: string,
        run: (update: (progress: JobProgress) => Promise<void>) => Promise<void>,
      ) => {
        const unitBase = (unitIndex / totalUnits) * 100;
        const unitSpan = 100 / totalUnits;
        unitIndex += 1;
        await stepUpdateProgress({ pct: Math.round(unitBase), message: label });
        await run(async (progress) => {
          const baseProgress = isRecord(progress) ? progress : {};
          await stepUpdateProgress({
            ...baseProgress,
            pct: mapChildProgressPct(isRecord(progress) ? progress.pct : null, unitBase, unitSpan),
          });
        });
      };

      for (const item of slice) {
        if (item.needSound) {
          await unitProgress(`声音设计 #${item.scene.order}`, async (childProgress) => {
            await generateSoundDesign({
              prisma,
              teamId,
              projectId,
              sceneId: item.scene.id,
              aiProfileId,
              apiKeySecret,
              updateProgress: childProgress,
            });
          });
        }
        if (item.needDuration) {
          await unitProgress(`时长估算 #${item.scene.order}`, async (childProgress) => {
            await estimateDuration({
              prisma,
              teamId,
              projectId,
              sceneId: item.scene.id,
              updateProgress: childProgress,
            });
          });
        }
      }

      const remaining = work.length - slice.length;
      if (remaining > 0 && !continuationJobId && enqueueContinuation) {
        continuationJobId = await enqueueContinuation();
        return { message: `已补齐 ${slice.length} 个分镜的声音/时长，剩余 ${remaining} 个分镜，已自动续跑` };
      }

      return { message: `已补齐 ${slice.length} 个分镜的声音/时长` };
    },
  });

  await updateProgress({
    pct: 100,
    message: continuationJobId ? '单集创作 Agent 本轮完成，已自动续跑下一任务' : '单集创作 Agent 完成',
  });

  return {
    projectId,
    episodeId,
    chunk: currentChunk,
    executionMode,
    fallbackUsed,
    agentTrace,
    stepSummaries,
    sceneChildTasks,
    agentSteps: summarizeAgentSteps(agentTrace),
    continued: Boolean(continuationJobId),
    nextJobId: continuationJobId,
  };
}
