import { z } from 'zod';
import { CAMERA_ANGLES, CAMERA_MOTIONS, SHOT_SIZES } from '../types.js';

export const LENS_TYPES = ['wide', 'normal', 'telephoto', 'macro', 'fisheye', 'anamorphic'] as const;

export const ShotSizeSchema = z.enum(SHOT_SIZES);
export const CameraAngleSchema = z.enum(CAMERA_ANGLES);
export const CameraMotionSchema = z.enum(CAMERA_MOTIONS);
export const LensTypeSchema = z.enum(LENS_TYPES);

export const ShotLanguageSchema = z.object({
  shotSize: ShotSizeSchema,
  angle: CameraAngleSchema.default('eye_level'),
  motion: CameraMotionSchema.default('static'),
  lens: LensTypeSchema.default('normal'),
  focalLength: z.string().max(20).optional(),
  depthOfField: z.enum(['shallow', 'medium', 'deep']).optional(),
  notes: z.string().max(500).optional(),
});

export type ShotLanguage = z.infer<typeof ShotLanguageSchema>;
