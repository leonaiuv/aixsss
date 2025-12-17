import { z } from 'zod';
import { PROVIDER_TYPES } from '../types.js';

export const ProviderTypeSchema = z.enum(PROVIDER_TYPES);

export const AIPricingSchema = z.object({
  currency: z.literal('USD'),
  promptPer1K: z.number().min(0).max(1000),
  completionPer1K: z.number().min(0).max(1000),
  cachedPromptPer1K: z.number().min(0).max(1000).optional(),
});

export const CreateAIProfileInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  name: z.string().min(1).max(80),
  provider: ProviderTypeSchema,
  apiKey: z.string().min(1).max(500),
  baseURL: z.string().url().optional(),
  model: z.string().min(1).max(120),
  generationParams: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      // DeepSeek: chat 最大 8K，reasoner 最大 64K；其它供应商上限依模型而定，这里放宽为 64K
      maxTokens: z.number().int().min(1).max(65536).optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
      // GPT-5 / 推理类模型：推理强度（Responses API: reasoning.effort）
      reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
    })
    .optional(),
  pricing: AIPricingSchema.optional(),
});

export type CreateAIProfileInput = z.infer<typeof CreateAIProfileInputSchema>;

export const UpdateAIProfileInputSchema = CreateAIProfileInputSchema.partial().extend({
  // 允许显式清空
  pricing: AIPricingSchema.nullable().optional(),
});

export type UpdateAIProfileInput = z.infer<typeof UpdateAIProfileInputSchema>;

