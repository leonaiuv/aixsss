import { z } from 'zod';
import { SOUND_CUE_TYPES } from '../types.js';

export const SoundCueTypeSchema = z.enum(SOUND_CUE_TYPES);

export const SoundCueSchema = z.object({
  id: z.string().min(1),
  type: SoundCueTypeSchema,
  description: z.string().max(500),
  timingHint: z.string().max(100).optional(),
  intensity: z.enum(['subtle', 'normal', 'prominent', 'dominant']).default('normal'),
  mood: z.string().max(100).optional(),
  reference: z.string().max(500).optional(),
  loopable: z.boolean().default(false),
});

export const SceneSoundDesignSchema = z.object({
  cues: z.array(SoundCueSchema).default([]),
  masterMood: z.string().max(200).optional(),
  generatedAt: z.string().optional(),
});

export type SoundCue = z.infer<typeof SoundCueSchema>;
export type SceneSoundDesign = z.infer<typeof SceneSoundDesignSchema>;
