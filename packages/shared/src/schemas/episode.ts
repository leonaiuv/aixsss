import { z } from 'zod';
import { EPISODE_WORKFLOW_STATES } from '../types.js';
import { EmotionArcPointSchema } from './emotionArc.js';

export const EpisodeWorkflowStateSchema = z.enum(EPISODE_WORKFLOW_STATES);

export const CreateEpisodeInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  order: z.number().int().min(1),
  title: z.string().min(0).max(200).default(''),
  summary: z.string().min(0).max(4000).default(''),
  outline: z.unknown().optional(),
  coreExpression: z.unknown().optional(),
  contextCache: z.unknown().optional(),
  sceneScriptDraft: z.string().min(0).max(200000).optional(),
  emotionArcJson: z.unknown().optional(),
  durationEstimateJson: z.unknown().optional(),
  workflowState: EpisodeWorkflowStateSchema.optional(),
});

export type CreateEpisodeInput = z.infer<typeof CreateEpisodeInputSchema>;

export const UpdateEpisodeInputSchema = CreateEpisodeInputSchema.partial();

export type UpdateEpisodeInput = z.infer<typeof UpdateEpisodeInputSchema>;

const EpisodePlanEpisodeSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  logline: z.string().min(1).max(2000),
  mainCharacters: z.array(z.string().min(1).max(200)).default([]),
  beats: z.array(z.string().min(1).max(500)).default([]),
  sceneScope: z.string().min(1).max(2000),
  cliffhanger: z.string().min(0).max(2000).optional().nullable(),
});

export const EpisodePlanSchema = z
  .object({
    episodeCount: z.number().int().min(1).max(24),
    reasoningBrief: z.string().min(0).max(2000).optional().nullable(),
    episodes: z.array(EpisodePlanEpisodeSchema).min(1).max(24),
  })
  .superRefine((val, ctx) => {
    if (val.episodeCount !== val.episodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['episodeCount'],
        message: 'episodeCount must equal episodes.length',
      });
    }

    const orders = val.episodes.map((e) => e.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i += 1) {
      if (orders[i] !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['episodes'],
          message: 'episodes.order must be continuous from 1..N',
        });
        break;
      }
    }
  });

export type EpisodePlan = z.infer<typeof EpisodePlanSchema>;

export const CoreExpressionSchema = z.object({
  theme: z.string().min(1).max(500),
  emotionalArc: z.array(z.string().min(1).max(200)).length(4),
  coreConflict: z.string().min(1).max(2000),
  payoff: z.array(z.string().min(1).max(500)).default([]),
  visualMotifs: z.array(z.string().min(1).max(200)).default([]),
  endingBeat: z.string().min(1).max(2000),
  nextHook: z.string().min(0).max(2000).optional().nullable(),
  emotionArcPoints: z.array(EmotionArcPointSchema).optional(),
});

export type CoreExpression = z.infer<typeof CoreExpressionSchema>;

export const EpisodeScriptSchema = z.object({
  title: z.string().min(0).max(200).default(''),
  draft: z.string().min(0).max(200000).default(''),
  scenes: z.array(
    z.object({
      order: z.number().int().min(1),
      sceneHeading: z.string().min(1),
      summary: z.string().min(0).max(2000).default(''),
    }),
  ).default([]),
  generatedAt: z.string().optional(),
});

export type EpisodeScript = z.infer<typeof EpisodeScriptSchema>;
