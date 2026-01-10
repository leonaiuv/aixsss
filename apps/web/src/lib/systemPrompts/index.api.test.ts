import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SYSTEM_PROMPT_DEFINITIONS } from '@aixsss/shared';

const mocks = vi.hoisted(() => ({
  apiListSystemPrompts: vi.fn(),
  apiUpdateSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/runtime/mode', () => ({
  isApiMode: () => true,
}));

vi.mock('@/lib/api/systemPrompts', () => ({
  apiListSystemPrompts: mocks.apiListSystemPrompts,
  apiUpdateSystemPrompt: mocks.apiUpdateSystemPrompt,
}));

import {
  getSystemPromptContent,
  invalidateSystemPromptsCache,
  listSystemPrompts,
  saveSystemPromptContent,
} from '@/lib/systemPrompts';

describe('systemPrompts (api mode)', () => {
  beforeEach(() => {
    invalidateSystemPromptsCache();
    mocks.apiListSystemPrompts.mockReset();
    mocks.apiUpdateSystemPrompt.mockReset();

    const apiItems = SYSTEM_PROMPT_DEFINITIONS.map((def) => ({
      key: def.key,
      title: def.title,
      description: def.description ?? null,
      category: def.category,
      content: def.defaultContent,
      defaultContent: def.defaultContent,
      createdAt: null,
      updatedAt: null,
    }));

    mocks.apiListSystemPrompts.mockResolvedValue(apiItems);
    mocks.apiUpdateSystemPrompt.mockImplementation(
      async (key: string, input: { content: string }) => {
        const def = SYSTEM_PROMPT_DEFINITIONS.find((d) => d.key === key);
        if (!def) throw new Error(`Unknown system prompt key: ${key}`);
        return {
          key,
          title: def.title,
          description: def.description ?? null,
          category: def.category,
          content: input.content,
          defaultContent: def.defaultContent,
          createdAt: null,
          updatedAt: new Date().toISOString(),
        };
      },
    );
  });

  it('reads from API list cache', async () => {
    const items = await listSystemPrompts();
    expect(items).toHaveLength(SYSTEM_PROMPT_DEFINITIONS.length);
    expect(mocks.apiListSystemPrompts).toHaveBeenCalledTimes(1);

    const key = items[0].key;
    expect(await getSystemPromptContent(key)).toBe(items[0].content);
    expect(mocks.apiListSystemPrompts).toHaveBeenCalledTimes(1);
  });

  it('updates API cache after save', async () => {
    await listSystemPrompts();

    const key = SYSTEM_PROMPT_DEFINITIONS[0].key;
    await saveSystemPromptContent(key, 'NEW_CONTENT');
    expect(mocks.apiUpdateSystemPrompt).toHaveBeenCalledTimes(1);
    expect(await getSystemPromptContent(key)).toBe('NEW_CONTENT');
  });
});
