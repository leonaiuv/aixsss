import { z } from 'zod';
import { PROVIDER_TYPES } from '../types.js';

export const ProviderTypeSchema = z.enum(PROVIDER_TYPES);

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
      maxTokens: z.number().int().min(1).max(8192).optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
    })
    .optional(),
});

export type CreateAIProfileInput = z.infer<typeof CreateAIProfileInputSchema>;

export const UpdateAIProfileInputSchema = CreateAIProfileInputSchema.partial();

export type UpdateAIProfileInput = z.infer<typeof UpdateAIProfileInputSchema>;


