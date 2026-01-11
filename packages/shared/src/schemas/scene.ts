import { z } from 'zod';
import { GENERATED_IMAGE_KEYFRAMES, SCENE_STATUSES } from '../types.js';

export const SceneStatusSchema = z.enum(SCENE_STATUSES);

const GeneratedImageSchema = z.object({
  keyframe: z.enum(GENERATED_IMAGE_KEYFRAMES),
  url: z.string().min(1),
  prompt: z.string().min(1).optional(),
  revisedPrompt: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  metadata: z.unknown().optional(),
});

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
  shotPrompt: z.string().min(0).max(36000).default(''),
  motionPrompt: z.string().min(0).max(20000).default(''),
  generatedImages: z.array(GeneratedImageSchema).optional(),
  storyboardSceneBibleJson: z.unknown().optional(),
  storyboardPlanJson: z.unknown().optional(),
  storyboardGroupsJson: z.unknown().optional(),
  dialogues: z.unknown().optional(),
  contextSummary: z.unknown().optional(),
  status: SceneStatusSchema.optional(),
  notes: z.string().min(0).max(6000).default(''),
});

export type CreateSceneInput = z.infer<typeof CreateSceneInputSchema>;

export const UpdateSceneInputSchema = CreateSceneInputSchema.partial();

export type UpdateSceneInput = z.infer<typeof UpdateSceneInputSchema>;
