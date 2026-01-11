import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SYSTEM_PROMPT_DEFINITION_BY_KEY,
  SYSTEM_PROMPT_DEFINITIONS,
  type UpdateSystemPromptInput,
} from '@aixsss/shared';

function toIso(date: Date): string {
  return date.toISOString();
}

@Injectable()
export class SystemPromptsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async ensureDefaults(teamId: string) {
    const defs = SYSTEM_PROMPT_DEFINITIONS;
    const data = defs.map((d) => ({
      teamId,
      key: d.key,
      content: d.defaultContent,
      isCustomized: false,
    }));

    // Best-effort: avoid races with skipDuplicates
    await this.prisma.systemPrompt.createMany({ data, skipDuplicates: true });
  }

  async list(teamId: string) {
    await this.ensureDefaults(teamId);

    const defs = SYSTEM_PROMPT_DEFINITIONS;
    const keys = defs.map((d) => d.key);

    const rows = await this.prisma.systemPrompt.findMany({
      where: { teamId, key: { in: keys } },
      orderBy: { key: 'asc' },
    });
    const rowByKey = new Map(rows.map((r) => [r.key, r]));

    return defs.map((def) => {
      const row = rowByKey.get(def.key);
      const content =
        row?.isCustomized && typeof row.content === 'string' && row.content.trim()
          ? row.content
          : def.defaultContent;
      return {
        key: def.key,
        title: def.title,
        description: def.description ?? null,
        category: def.category,
        content,
        defaultContent: def.defaultContent,
        createdAt: row ? toIso(row.createdAt) : null,
        updatedAt: row ? toIso(row.updatedAt) : null,
      };
    });
  }

  async update(teamId: string, key: string, input: UpdateSystemPromptInput) {
    const def = SYSTEM_PROMPT_DEFINITION_BY_KEY[key];
    if (!def) throw new NotFoundException('System prompt not found');

    const isCustomized = input.content.trim() !== def.defaultContent.trim();

    const row = await this.prisma.systemPrompt.upsert({
      where: { teamId_key: { teamId, key } },
      update: { content: input.content, isCustomized },
      create: { teamId, key, content: input.content, isCustomized },
    });

    return {
      key: def.key,
      title: def.title,
      description: def.description ?? null,
      category: def.category,
      content: row.isCustomized ? row.content : def.defaultContent,
      defaultContent: def.defaultContent,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }
}
