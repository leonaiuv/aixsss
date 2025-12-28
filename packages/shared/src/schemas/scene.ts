import { z } from 'zod';
import { SCENE_STATUSES } from '../types.js';

export const SceneStatusSchema = z.enum(SCENE_STATUSES);

export const CreateSceneInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  order: z.number().int().nonnegative(),
  summary: z.string().min(0).max(2000).default(''),
  sceneDescription: z.string().min(0).max(6000).default(''),
  actionDescription: z.string().min(0).max(6000).default(''),
  castCharacterIds: z.array(z.string().min(1)).default([]),
  shotPrompt: z.string().min(0).max(12000).default(''),
  motionPrompt: z.string().min(0).max(12000).default(''),
  dialogues: z.unknown().optional(),
  contextSummary: z.unknown().optional(),
  status: SceneStatusSchema.optional(),
  notes: z.string().min(0).max(6000).default(''),
});

export type CreateSceneInput = z.infer<typeof CreateSceneInputSchema>;

export const UpdateSceneInputSchema = CreateSceneInputSchema.partial();

export type UpdateSceneInput = z.infer<typeof UpdateSceneInputSchema>;

