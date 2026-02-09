import { z } from 'zod';
import { TRANSITION_TYPES } from '../types.js';

export const TransitionTypeSchema = z.enum(TRANSITION_TYPES);

export const TransitionSchema = z.object({
  type: TransitionTypeSchema.default('cut'),
  durationMs: z.number().int().min(0).max(5000).default(0),
  motivation: z.string().max(500).optional(),
  matchElement: z.string().max(200).optional(),
});

export type Transition = z.infer<typeof TransitionSchema>;
