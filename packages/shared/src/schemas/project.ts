import { z } from 'zod';
import { WORKFLOW_STATES, SCENE_STEPS } from '../types.js';

export const WorkflowStateSchema = z.enum(WORKFLOW_STATES);
export const SceneStepSchema = z.enum(SCENE_STEPS);

export const CreateProjectInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  title: z.string().min(1).max(120),
  summary: z.string().min(0).max(2000).default(''),
  protagonist: z.string().min(0).max(2000).default(''),
  style: z.string().min(0).max(2000).default(''),
  artStyleConfig: z.unknown().optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = CreateProjectInputSchema.partial().extend({
  workflowState: WorkflowStateSchema.optional(),
  currentSceneOrder: z.number().int().nonnegative().optional(),
  currentSceneStep: SceneStepSchema.optional(),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;


