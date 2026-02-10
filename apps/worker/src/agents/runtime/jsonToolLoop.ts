import { z } from 'zod';
import type { ChatMessage } from '../../providers/types.js';
import { parseJsonFromText } from '../../tasks/aiJson.js';
import { mergeTokenUsage, type TokenUsage } from '../../tasks/common.js';

type AgentTraceToolCall = {
  name: string;
  input?: unknown;
  output?: unknown;
  status: 'ok' | 'error';
  error?: string;
};

type AgentTraceStep = {
  index: number;
  kind: 'tool_call' | 'final' | 'error' | 'fallback';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelOutput?: string;
  parsed?: unknown;
  toolCall?: AgentTraceToolCall;
  final?: unknown;
  error?: string;
  tokenUsage?: TokenUsage;
};

type AgentTrace = {
  version: 1;
  executionMode: 'agent' | 'legacy';
  fallbackUsed: boolean;
  fallbackReason?: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: AgentTraceStep[];
};

export type AgentTool = {
  description: string;
  execute: (input: unknown, context: { stepIndex: number; messages: ChatMessage[] }) => Promise<unknown>;
};

export type AgentToolMap = Record<string, AgentTool>;

export type ModelCallResult = {
  content: string;
  tokenUsage?: TokenUsage;
};

export type RunJsonToolLoopArgs<TFinal> = {
  initialMessages: ChatMessage[];
  callModel: (messages: ChatMessage[], context: { stepIndex: number }) => Promise<ModelCallResult>;
  tools: AgentToolMap;
  maxSteps?: number;
  stepTimeoutMs?: number;
  totalTimeoutMs?: number;
  parseFinal?: (value: unknown) => TFinal;
  fallbackEnabled?: boolean;
  fallback?: (error: unknown) => Promise<{ final: TFinal; reason?: string }>;
};

export type RunJsonToolLoopResult<TFinal> = {
  final: TFinal;
  executionMode: 'agent' | 'legacy';
  fallbackUsed: boolean;
  trace: AgentTrace;
  tokenUsage?: TokenUsage;
};

const AgentToolCallActionSchema = z.object({
  kind: z.literal('tool_call'),
  toolName: z.string().min(1),
  toolInput: z.unknown().optional(),
});

const AgentFinalActionSchema = z.object({
  kind: z.literal('final'),
  final: z.unknown(),
});

const AgentActionSchema = z.discriminatedUnion('kind', [AgentToolCallActionSchema, AgentFinalActionSchema]);

function nowIso(): string {
  return new Date().toISOString();
}

function elapsedMs(from: number): number {
  return Math.max(0, Date.now() - from);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function createTrace(args: {
  executionMode: 'agent' | 'legacy';
  fallbackUsed: boolean;
  fallbackReason?: string;
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: AgentTraceStep[];
}): AgentTrace {
  return {
    version: 1,
    executionMode: args.executionMode,
    fallbackUsed: args.fallbackUsed,
    ...(args.fallbackReason ? { fallbackReason: args.fallbackReason } : {}),
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    totalDurationMs: args.totalDurationMs,
    steps: args.steps,
  } as AgentTrace;
}

export async function runJsonToolLoop<TFinal>(args: RunJsonToolLoopArgs<TFinal>): Promise<RunJsonToolLoopResult<TFinal>> {
  const maxSteps = Number.isFinite(args.maxSteps) && (args.maxSteps ?? 0) > 0 ? Math.floor(args.maxSteps ?? 0) : 6;
  const stepTimeoutMs =
    Number.isFinite(args.stepTimeoutMs) && (args.stepTimeoutMs ?? 0) > 0 ? Math.floor(args.stepTimeoutMs ?? 0) : 45_000;
  const totalTimeoutMs =
    Number.isFinite(args.totalTimeoutMs) && (args.totalTimeoutMs ?? 0) > 0
      ? Math.floor(args.totalTimeoutMs ?? 0)
      : 180_000;
  const fallbackEnabled = args.fallbackEnabled !== false;

  const startedAtTs = Date.now();
  const startedAt = nowIso();
  const steps: AgentTraceStep[] = [];
  const messages: ChatMessage[] = [...args.initialMessages];
  let tokenUsage: TokenUsage | undefined;

  const runMain = async (): Promise<{ final: TFinal }> => {
    for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex += 1) {
      if (elapsedMs(startedAtTs) > totalTimeoutMs) {
        throw new Error(`Agent total timeout exceeded (${totalTimeoutMs}ms)`);
      }

      const stepStartedTs = Date.now();
      const stepStartedAt = nowIso();

      const modelRes = await withTimeout(
        args.callModel(messages, { stepIndex }),
        stepTimeoutMs,
        `Agent model step timeout (${stepTimeoutMs}ms) at step=${stepIndex}`,
      );
      tokenUsage = mergeTokenUsage(tokenUsage, modelRes.tokenUsage);

      const parsed = parseJsonFromText(modelRes.content, { expectedKind: 'object' });
      const action = AgentActionSchema.parse(parsed.json);

      if (action.kind === 'final') {
        const finalValue = args.parseFinal ? args.parseFinal(action.final) : (action.final as TFinal);
        const stepFinishedAt = nowIso();
        steps.push({
          index: stepIndex,
          kind: 'final',
          startedAt: stepStartedAt,
          finishedAt: stepFinishedAt,
          durationMs: elapsedMs(stepStartedTs),
          modelOutput: modelRes.content,
          parsed: action,
          final: action.final,
          ...(tokenUsage ? { tokenUsage } : {}),
        });
        return { final: finalValue };
      }

      const tool = args.tools[action.toolName];
      if (!tool) {
        throw new Error(`Agent unknown tool: ${action.toolName}`);
      }

      const toolOutput = await withTimeout(
        tool.execute(action.toolInput ?? {}, { stepIndex, messages }),
        stepTimeoutMs,
        `Agent tool timeout (${stepTimeoutMs}ms) at step=${stepIndex} tool=${action.toolName}`,
      );

      const stepFinishedAt = nowIso();
      steps.push({
        index: stepIndex,
        kind: 'tool_call',
        startedAt: stepStartedAt,
        finishedAt: stepFinishedAt,
        durationMs: elapsedMs(stepStartedTs),
        modelOutput: modelRes.content,
        parsed: action,
        toolCall: {
          name: action.toolName,
          input: action.toolInput,
          output: toolOutput,
          status: 'ok',
        },
        ...(tokenUsage ? { tokenUsage } : {}),
      });

      messages.push({ role: 'assistant', content: modelRes.content });
      messages.push({
        role: 'user',
        content: JSON.stringify({
          toolResult: {
            toolName: action.toolName,
            output: toolOutput,
          },
        }),
      });
    }

    throw new Error(`Agent reached max steps (${maxSteps})`);
  };

  try {
    const { final } = await runMain();
    const finishedAt = nowIso();
    return {
      final,
      executionMode: 'agent',
      fallbackUsed: false,
      trace: createTrace({
        executionMode: 'agent',
        fallbackUsed: false,
        startedAt,
        finishedAt,
        totalDurationMs: elapsedMs(startedAtTs),
        steps,
      }),
      tokenUsage,
    };
  } catch (error) {
    if (!fallbackEnabled || !args.fallback) throw error;

    const fallbackStartedTs = Date.now();
    const fallbackStartedAt = nowIso();
    const fallbackRes = await withTimeout(
      args.fallback(error),
      stepTimeoutMs,
      `Agent fallback timeout (${stepTimeoutMs}ms)`,
    );
    const fallbackFinishedAt = nowIso();
    steps.push({
      index: steps.length + 1,
      kind: 'fallback',
      startedAt: fallbackStartedAt,
      finishedAt: fallbackFinishedAt,
      durationMs: elapsedMs(fallbackStartedTs),
      error: error instanceof Error ? error.message : String(error),
      final: fallbackRes.final,
    });

    const finishedAt = nowIso();
    return {
      final: fallbackRes.final,
      executionMode: 'legacy',
      fallbackUsed: true,
      trace: createTrace({
        executionMode: 'legacy',
        fallbackUsed: true,
        fallbackReason: fallbackRes.reason ?? (error instanceof Error ? error.message : String(error)),
        startedAt,
        finishedAt,
        totalDurationMs: elapsedMs(startedAtTs),
        steps,
      }),
      tokenUsage,
    };
  }
}
