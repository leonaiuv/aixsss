import type { PrismaClient } from '@prisma/client';
import { SYSTEM_PROMPT_DEFINITION_BY_KEY } from '@aixsss/shared';

export async function loadSystemPrompt(args: {
  prisma: PrismaClient;
  teamId: string;
  key: string;
}): Promise<string> {
  const def = SYSTEM_PROMPT_DEFINITION_BY_KEY[args.key];
  if (!def) {
    throw new Error(`Unknown system prompt key: ${args.key}`);
  }

  try {
    const row = await args.prisma.systemPrompt.findUnique({
      where: { teamId_key: { teamId: args.teamId, key: args.key } },
      select: { content: true, isCustomized: true },
    });
    const content = row?.content;
    if (row?.isCustomized && typeof content === 'string' && content.trim()) return content;
  } catch {
    // ignore DB read errors; fall back to default content
  }

  return def.defaultContent;
}
