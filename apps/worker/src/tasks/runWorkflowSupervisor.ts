import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import {
  getAgentMaxSteps,
  getAgentStepTimeoutMs,
  getAgentTotalTimeoutMs,
  isAgentFallbackToLegacyEnabled,
  isAgentSupervisorEnabled,
} from '../agents/runtime/featureFlags.js';
import { toProviderChatConfig } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { expandStoryCharacters } from './expandStoryCharacters.js';
import { buildNarrativeCausalChain } from './buildNarrativeCausalChain.js';
import { generateCharacterRelationships } from './generateCharacterRelationships.js';
import { generateEmotionArc } from './generateEmotionArc.js';

type SupervisorStep =
  | 'character_expansion'
  | 'narrative_phase3'
  | 'narrative_phase4'
  | 'character_relationships'
  | 'emotion_arc';

type StepSummary = {
  step: SupervisorStep;
  status: 'succeeded' | 'failed' | 'skipped';
  message: string;
  executionMode?: 'agent' | 'legacy';
  fallbackUsed?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
}

function mapChildProgressPct(childPct: unknown, base: number, span: number): number {
  const pct = typeof childPct === 'number' ? childPct : 0;
  const normalized = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.min(99, Math.round(base + (normalized / 100) * span)));
}

function readCompletedPhase(contextCache: Prisma.JsonValue | null): number {
  if (!isRecord(contextCache) || !isRecord(contextCache.narrativeCausalChain)) return 0;
  const completed = contextCache.narrativeCausalChain.completedPhase;
  return typeof completed === 'number' && Number.isFinite(completed) ? completed : 0;
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

export async function runWorkflowSupervisor(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  await updateProgress({ pct: 2, message: 'Supervisor：准备运行步骤...' });

  let executionMode: 'agent' | 'legacy' = 'legacy';
  let fallbackUsed = false;
  let agentTrace: unknown = null;
  const stepSummaries: StepSummary[] = [];

  if (isAgentSupervisorEnabled()) {
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
      key: 'workflow.supervisor.agent.system',
    });

    await updateProgress({ pct: 5, message: 'Supervisor Agent 规划中...' });
    const loop = await runJsonToolLoop<{ proceed: true }>({
      initialMessages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            '目标：执行专业工作流中的关键 Agent 步骤。',
            `projectId=${projectId}`,
            '请先按需读取上下文，再输出 final {"proceed": true}。',
          ].join('\n'),
        },
      ],
      callModel: async (messages, meta) => {
        await updateProgress({
          pct: Math.min(12, 6 + meta.stepIndex * 2),
          message: `Supervisor Agent 执行步骤 ${meta.stepIndex}...`,
        });
        return await chatWithProvider(providerConfig, messages);
      },
      tools: {
        read_supervisor_context: {
          description: '读取当前项目工作流上下文',
          execute: async () => ({
            projectId: project.id,
            summary: project.summary,
            completedPhase: readCompletedPhase(project.contextCache),
          }),
        },
      },
      maxSteps: getAgentMaxSteps(),
      stepTimeoutMs: getAgentStepTimeoutMs(),
      totalTimeoutMs: getAgentTotalTimeoutMs(),
      parseFinal: (value) => {
        const ok = isRecord(value) && value.proceed === true;
        if (!ok) throw new Error('Supervisor final must be {"proceed": true}');
        return { proceed: true };
      },
      fallbackEnabled: isAgentFallbackToLegacyEnabled(),
      fallback: async () => ({ final: { proceed: true }, reason: 'supervisor_agent_failed_use_legacy' }),
    });

    executionMode = loop.executionMode;
    fallbackUsed = loop.fallbackUsed;
    agentTrace = loop.trace;
  }

  const runStep = async <T>(params: {
    step: SupervisorStep;
    title: string;
    basePct: number;
    spanPct: number;
    run: (stepUpdateProgress: (progress: JobProgress) => Promise<void>) => Promise<T>;
  }) => {
    await updateProgress({ pct: params.basePct, message: `Supervisor：${params.title}` });

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

      const childExecutionMode =
        isRecord(result) &&
        (result.executionMode === 'agent' || result.executionMode === 'legacy')
          ? result.executionMode
          : undefined;
      const childFallbackUsed = isRecord(result) && result.fallbackUsed === true;
      stepSummaries.push({
        step: params.step,
        status: 'succeeded',
        message: 'ok',
        executionMode: childExecutionMode,
        fallbackUsed: childFallbackUsed,
      });
      return result;
    } catch (error) {
      const detail = summarizeError(error);
      stepSummaries.push({
        step: params.step,
        status: 'failed',
        message: detail,
      });
      throw new Error(`supervisor step failed [${params.step}]: ${detail}`);
    }
  };

  await runStep({
    step: 'character_expansion',
    title: '角色体系扩充',
    basePct: 12,
    spanPct: 18,
    run: async (stepUpdateProgress) =>
      await expandStoryCharacters({
        prisma,
        teamId,
        projectId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      }),
  });

  let completedPhase = readCompletedPhase(project.contextCache);
  if (completedPhase < 2) {
    stepSummaries.push({
      step: 'narrative_phase3',
      status: 'skipped',
      message: '因果链未完成 phase2，跳过 phase3',
    });
    stepSummaries.push({
      step: 'narrative_phase4',
      status: 'skipped',
      message: '因果链未完成 phase2，跳过 phase4',
    });
  } else {
    if (completedPhase < 3) {
      const phase3Res = await runStep({
        step: 'narrative_phase3',
        title: '叙事因果链 Phase3',
        basePct: 30,
        spanPct: 18,
        run: async (stepUpdateProgress) =>
          await buildNarrativeCausalChain({
            prisma,
            teamId,
            projectId,
            aiProfileId,
            apiKeySecret,
            phase: 3,
            updateProgress: stepUpdateProgress,
          }),
      });
      if (isRecord(phase3Res) && typeof phase3Res.completedPhase === 'number') {
        completedPhase = Math.max(completedPhase, phase3Res.completedPhase);
      } else {
        completedPhase = Math.max(completedPhase, 3);
      }
    } else {
      stepSummaries.push({
        step: 'narrative_phase3',
        status: 'skipped',
        message: '已完成 phase3，跳过',
      });
    }

    if (completedPhase < 4) {
      const phase4Res = await runStep({
        step: 'narrative_phase4',
        title: '叙事因果链 Phase4',
        basePct: 48,
        spanPct: 18,
        run: async (stepUpdateProgress) =>
          await buildNarrativeCausalChain({
            prisma,
            teamId,
            projectId,
            aiProfileId,
            apiKeySecret,
            phase: 4,
            updateProgress: stepUpdateProgress,
          }),
      });
      if (isRecord(phase4Res) && typeof phase4Res.completedPhase === 'number') {
        completedPhase = Math.max(completedPhase, phase4Res.completedPhase);
      } else {
        completedPhase = Math.max(completedPhase, 4);
      }
    } else {
      stepSummaries.push({
        step: 'narrative_phase4',
        status: 'skipped',
        message: '已完成 phase4，跳过',
      });
    }
  }

  await runStep({
    step: 'character_relationships',
    title: '角色关系图谱生成',
    basePct: 66,
    spanPct: 16,
    run: async (stepUpdateProgress) =>
      await generateCharacterRelationships({
        prisma,
        teamId,
        projectId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      }),
  });

  await runStep({
    step: 'emotion_arc',
    title: '情绪弧线生成',
    basePct: 82,
    spanPct: 16,
    run: async (stepUpdateProgress) =>
      await generateEmotionArc({
        prisma,
        teamId,
        projectId,
        aiProfileId,
        apiKeySecret,
        updateProgress: stepUpdateProgress,
      }),
  });

  await updateProgress({ pct: 100, message: 'Supervisor 流程完成' });

  return {
    projectId,
    completedPhase,
    executionMode,
    fallbackUsed,
    agentTrace,
    stepSummaries,
    agentStepSummaries: summarizeAgentSteps(agentTrace),
  };
}
