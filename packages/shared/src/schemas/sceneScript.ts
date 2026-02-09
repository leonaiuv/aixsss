import { z } from 'zod';
import { SoundCueSchema } from './soundDesign.js';
import { TransitionSchema } from './transition.js';

export const SceneDialogueBlockSchema = z.object({
  character: z.string().min(1),
  parenthetical: z.string().optional(),
  line: z.string().min(1),
});

export const SceneScriptSchema = z.object({
  sceneHeading: z.string().min(1),
  actionLines: z.array(z.string()),
  dialogueBlocks: z.array(SceneDialogueBlockSchema).default([]),
  emotionalBeat: z.string().optional(),
  soundCues: z.array(SoundCueSchema).default([]),
  transitionOut: TransitionSchema.optional(),
  estimatedDuration: z.number().optional(),
});

export type SceneScript = z.infer<typeof SceneScriptSchema>;
