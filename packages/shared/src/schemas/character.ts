import { z } from 'zod';

export const CreateCharacterInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  name: z.string().min(1).max(120),
  briefDescription: z.string().min(0).max(2000).optional(),
  avatar: z.string().min(0).max(2000).optional(),
  appearance: z.string().min(0).max(8000).default(''),
  personality: z.string().min(0).max(8000).default(''),
  background: z.string().min(0).max(12000).default(''),
  portraitPrompts: z.unknown().optional(),
  customStyle: z.string().min(0).max(2000).optional(),
  relationships: z.unknown().optional(),
  appearances: z.unknown().optional(),
  themeColor: z.string().min(0).max(64).optional(),
  primaryColor: z.string().min(0).max(64).optional(),
  secondaryColor: z.string().min(0).max(64).optional(),
});

export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

export const UpdateCharacterInputSchema = CreateCharacterInputSchema.partial();

export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInputSchema>;


