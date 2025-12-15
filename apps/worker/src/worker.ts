import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { EnvSchema } from './config/env.js';
import { generateSceneList } from './tasks/generateSceneList.js';
import { generateSceneAnchor } from './tasks/generateSceneAnchor.js';
import { generateKeyframePrompt } from './tasks/generateKeyframePrompt.js';
import { generateMotionPrompt } from './tasks/generateMotionPrompt.js';
import { generateDialogue } from './tasks/generateDialogue.js';
import { refineSceneAll } from './tasks/refineSceneAll.js';
import { llmChat } from './tasks/llmChat.js';
import { planEpisodes } from './tasks/planEpisodes.js';
import { generateEpisodeCoreExpression } from './tasks/generateEpisodeCoreExpression.js';
import { generateEpisodeSceneList } from './tasks/generateEpisodeSceneList.js';

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
          attempts: { increment: 1 },
        },
      });

      try {
        switch (job.name) {
          case 'llm_chat': {
            const result = await llmChat({
              prisma,
              teamId,
              aiProfileId,
              messages: data.messages,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

            return result;
          }
          case 'generate_scene_list': {
            const result = await generateSceneList({
              prisma,
              teamId,
              projectId,
              aiProfileId,
              apiKeySecret: env.API_KEY_ENCRYPTION_KEY,
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

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
              updateProgress: async (progress) => {
                await job.updateProgress(progress);
              },
            });

            await prisma.aIJob.update({
              where: { id: jobId },
              data: {
                status: 'succeeded',
                finishedAt: new Date(),
                result,
                error: null,
              },
            });

            return result;
          }
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.aIJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: message,
          },
        });
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
    console.error('[worker] job failed', { id: job?.id, name: job?.name, err: err?.message });
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
