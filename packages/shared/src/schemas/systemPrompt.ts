import { z } from 'zod';

export const UpdateSystemPromptInputSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
});

export type UpdateSystemPromptInput = z.infer<typeof UpdateSystemPromptInputSchema>;

