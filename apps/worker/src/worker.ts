import 'dotenv/config';
import { Worker } from 'bullmq';
import type { JobProgress } from 'bullmq';
import { Prisma, PrismaClient } from '@prisma/client';
import { EnvSchema } from './config/env.js';
import { generateSceneList } from './tasks/generateSceneList.js';
import { generateSceneAnchor } from './tasks/generateSceneAnchor.js';
import { generateKeyframePrompt } from './tasks/generateKeyframePrompt.js';
import { generateKeyframeImages } from './tasks/generateKeyframeImages.js';
import { generateMotionPrompt } from './tasks/generateMotionPrompt.js';
import { generateDialogue } from './tasks/generateDialogue.js';
import { refineSceneAll } from './tasks/refineSceneAll.js';
import { refineSceneBatch } from './tasks/refineSceneBatch.js';
import { llmChat } from './tasks/llmChat.js';
import { planEpisodes } from './tasks/planEpisodes.js';
import { generateEpisodeCoreExpression } from './tasks/generateEpisodeCoreExpression.js';
import { generateEpisodeSceneList } from './tasks/generateEpisodeSceneList.js';
import { buildNarrativeCausalChain } from './tasks/buildNarrativeCausalChain.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(`Unsupported REDIS_URL protocol: ${parsed.protocol}`);
  }
  const password = parsed.password || undefined;
  const port = parsed.port ? Number(parsed.port) : 6379;
  return { host: parsed.hostname, port, password };
}

async function main() {
  const env = EnvSchema.parse(process.env);

  const prisma = new PrismaClient();
  const connection = parseRedisUrl(env.REDIS_URL);

  const worker = new Worker(
    env.AI_QUEUE_NAME,
    async (job) => {
      const jobId = String(job.id);
      const data = job.data as Record<string, unknown>;

      const teamId = typeof data.teamId === 'string' ? data.teamId : '';
      const projectId = typeof data.projectId === 'string' ? data.projectId : '';
      const episodeId = typeof data.episodeId === 'string' ? data.episodeId : '';
      const sceneId = typeof data.sceneId === 'string' ? data.sceneId : '';
      const aiProfileId = typeof data.aiProfileId === 'string' ? data.aiProfileId : '';

      await prisma.aIJob.update({
        where: { id: jobId },
        data: {
          status: 'running',
          startedAt: new Date(),
          finishedAt: null,
          error: null,
          result: Prisma.JsonNull,
          attempts: { increment: 1 },
        },
      });

      const updateProgress = async (progress: JobProgress) => {
        // 取消是 best-effort：API 端可能已把 status 置为 cancelled，但 bullmq 的 active job 无法强制中断。
        // 这里做协作式取消：一旦发现已取消，抛错终止后续步骤，避免继续写入产物/覆盖状态。
        const latest = await prisma.aIJob.findFirst({
          where: { id: jobId },
          select: { status: true },
        });
        if (latest?.status === 'cancelled') {
          throw new Error('Job cancelled');
        }
        await job.updateProgress(progress);
        const pct =
          isRecord(progress) && typeof progress.pct === 'number' ? Math.floor(progress.pct) : null;
        const message = isRecord(progress) && typeof progress.message === 'string' ? progress.message : null;
        console.log('[worker] progress', { id: jobId, name: job.name, pct, message });
      };

      try {
        switch (job.name) {
          case 'llm_chat': {
            const result = await llmChat({
              prisma,
              teamId,
              aiProfileId,
              messages: data.messages,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_scene_list': {
            const result = await generateSceneList({
              prisma,
              teamId,
              projectId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'plan_episodes': {
            const rawOptions = isRecord(data.options) ? data.options : null;
            const options =
              rawOptions && typeof rawOptions.targetEpisodeCount === 'number'
                ? { targetEpisodeCount: rawOptions.targetEpisodeCount }
                : undefined;

            const result = await planEpisodes({
              prisma,
              teamId,
              projectId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              options,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'build_narrative_causal_chain': {
            const phase = typeof job.data.phase === 'number' ? job.data.phase : undefined;
            const force = typeof job.data.force === 'boolean' ? job.data.force : undefined;
            const result = await buildNarrativeCausalChain({
              prisma,
              teamId,
              projectId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              phase,
              force,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_episode_core_expression': {
            const result = await generateEpisodeCoreExpression({
              prisma,
              teamId,
              projectId,
              episodeId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_episode_scene_list': {
            const rawOptions = isRecord(data.options) ? data.options : null;
            const options =
              rawOptions && typeof rawOptions.sceneCountHint === 'number'
                ? { sceneCountHint: rawOptions.sceneCountHint }
                : undefined;

            const result = await generateEpisodeSceneList({
              prisma,
              teamId,
              projectId,
              episodeId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              options,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_scene_anchor': {
            const result = await generateSceneAnchor({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_keyframe_prompt': {
            const result = await generateKeyframePrompt({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_keyframe_images': {
            const result = await generateKeyframeImages({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_motion_prompt': {
            const result = await generateMotionPrompt({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'generate_dialogue': {
            const result = await generateDialogue({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'refine_scene_all': {
            const result = await refineSceneAll({
              prisma,
              teamId,
              projectId,
              sceneId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          case 'refine_scene_all_batch': {
            const sceneIds = Array.isArray(data.sceneIds)
              ? data.sceneIds.filter((id): id is string => typeof id === 'string')
              : undefined;
            const result = await refineSceneBatch({
              prisma,
              teamId,
              projectId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              sceneIds,
              updateProgress,
              previousProgress: job.progress,
            });

            const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
            if (latest?.status !== 'cancelled') {
              await prisma.aIJob.update({
                where: { id: jobId },
                data: {
                  status: 'succeeded',
                  finishedAt: new Date(),
                  result,
                  error: null,
                },
              });
            }

            return result;
          }
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const latest = await prisma.aIJob.findFirst({ where: { id: jobId }, select: { status: true } });
        if (latest?.status === 'cancelled' || message === 'Job cancelled') {
          // 不覆盖取消状态；队列层面直接结束（视为已停止）
          return { cancelled: true };
        }
        // BullMQ 可能会自动重试（attempts/backoff）。如果这里把 DB 状态写成 failed，
        // 前端会立刻停止轮询并报错，但后端实际上仍会继续重试 -> 造成“前端已报错，后端还在跑”的错觉。
        const maxAttempts =
          typeof job.opts?.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
        const attemptsMade = typeof job.attemptsMade === 'number' ? job.attemptsMade : 0;
        const currentAttempt = attemptsMade + 1;
        const willRetry = currentAttempt < maxAttempts;

        if (willRetry) {
          // 让前端继续等待：把 DB 状态保持在 queued，并通过 progress 提示“将自动重试”
          try {
            await job.updateProgress({
              pct: null,
              message: `本次尝试失败，将自动重试（${currentAttempt}/${maxAttempts}）：${message}`,
            } satisfies JobProgress);
          } catch {
            // ignore
          }
          await prisma.aIJob.update({
            where: { id: jobId },
            data: {
              status: 'queued',
              // error/finishedAt 不落库，避免 UI 误判为“已失败结束”
              error: null,
              finishedAt: null,
            },
          });
        } else {
          await prisma.aIJob.update({
            where: { id: jobId },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              error: message,
            },
          });
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      // 避免开发环境热重启/网络抖动导致误判 stalled
      lockDuration: 120_000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  worker.on('ready', () => {
    console.log(`[worker] ready (queue=${env.AI_QUEUE_NAME}, concurrency=${env.WORKER_CONCURRENCY})`);
  });

  worker.on('failed', (job, err) => {
    const detail =
      err instanceof Error ? (err.stack || err.message) : typeof err === 'string' ? err : JSON.stringify(err);
    console.error('[worker] job failed', { id: job?.id, name: job?.name, err: detail });
  });

  const shutdown = async () => {
    console.log('[worker] shutting down...');
    await worker.close();
    await prisma.$disconnect();
  };

  process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
}

main().catch((err) => {
  console.error('[worker] bootstrap failed', err);
  process.exit(1);
});
