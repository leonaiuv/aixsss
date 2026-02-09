import { z } from 'zod';

export const EmotionArcPointSchema = z.object({
  episodeOrder: z.number().int().min(1),
  sceneOrder: z.number().int().min(1).optional(),
  tension: z.number().min(0).max(10),
  emotionalValence: z.number().min(-5).max(5),
  label: z.string().max(100).optional(),
  beatName: z.string().max(120).optional(),
});

export const EmotionArcSchema = z.object({
  points: z.array(EmotionArcPointSchema),
  generatedAt: z.string().optional(),
});

export type EmotionArcPoint = z.infer<typeof EmotionArcPointSchema>;
export type EmotionArc = z.infer<typeof EmotionArcSchema>;
