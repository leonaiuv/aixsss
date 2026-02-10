import { z } from 'zod';

export const AgentExecutionModeSchema = z.enum(['agent', 'legacy']);

export const AgentTraceToolCallSchema = z.object({
  name: z.string().min(1),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  status: z.enum(['ok', 'error']).default('ok'),
  error: z.string().optional(),
});

export const AgentTraceStepSchema = z.object({
  index: z.number().int().min(1),
  kind: z.enum(['tool_call', 'final', 'error', 'fallback']),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  durationMs: z.number().int().min(0),
  modelOutput: z.string().optional(),
  parsed: z.unknown().optional(),
  toolCall: AgentTraceToolCallSchema.optional(),
  final: z.unknown().optional(),
  error: z.string().optional(),
  tokenUsage: z
    .object({
      prompt: z.number().int().min(0),
      completion: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .optional(),
});

export const AgentTraceSchema = z.object({
  version: z.literal(1),
  executionMode: AgentExecutionModeSchema,
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  totalDurationMs: z.number().int().min(0),
  steps: z.array(AgentTraceStepSchema),
});

export type AgentExecutionMode = z.infer<typeof AgentExecutionModeSchema>;
export type AgentTraceToolCall = z.infer<typeof AgentTraceToolCallSchema>;
export type AgentTraceStep = z.infer<typeof AgentTraceStepSchema>;
export type AgentTrace = z.infer<typeof AgentTraceSchema>;
