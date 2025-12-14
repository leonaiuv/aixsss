import { z } from 'zod';

export const WORLD_VIEW_TYPES = ['era', 'geography', 'society', 'technology', 'magic', 'custom'] as const;
export const WorldViewTypeSchema = z.enum(WORLD_VIEW_TYPES);

export const CreateWorldViewElementInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  type: WorldViewTypeSchema,
  title: z.string().min(1).max(120),
  content: z.string().min(0).max(12000).default(''),
  order: z.number().int().nonnegative(),
});

export type CreateWorldViewElementInput = z.infer<typeof CreateWorldViewElementInputSchema>;

export const UpdateWorldViewElementInputSchema = CreateWorldViewElementInputSchema.partial();

export type UpdateWorldViewElementInput = z.infer<typeof UpdateWorldViewElementInputSchema>;


