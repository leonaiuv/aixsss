import { z } from 'zod';

export const DurationEstimateSchema = z.object({
  dialogueSec: z.number().min(0),
  actionSec: z.number().min(0),
  transitionSec: z.number().min(0),
  pauseSec: z.number().min(0),
  totalSec: z.number().min(0),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  breakdown: z.array(
    z.object({
      sceneOrder: z.number().int(),
      seconds: z.number().min(0),
      source: z.string().max(200),
    }),
  ).default([]),
});

export type DurationEstimate = z.infer<typeof DurationEstimateSchema>;
