import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SYSTEM_PROMPT_DEFINITIONS } from '@aixsss/shared';
import {
  getSystemPromptContent,
  invalidateSystemPromptsCache,
  listSystemPrompts,
  resetSystemPromptContent,
  saveSystemPromptContent,
} from '@/lib/systemPrompts';

const LOCAL_OVERRIDES_STORAGE_KEY = 'aixsss.system_prompts.overrides.v1';

describe('systemPrompts (local mode)', () => {
  beforeEach(() => {
    invalidateSystemPromptsCache();
    localStorage.removeItem(LOCAL_OVERRIDES_STORAGE_KEY);
  });

  afterEach(() => {
    invalidateSystemPromptsCache();
    localStorage.removeItem(LOCAL_OVERRIDES_STORAGE_KEY);
  });

  it('lists all definitions', async () => {
    const items = await listSystemPrompts();
    expect(items).toHaveLength(SYSTEM_PROMPT_DEFINITIONS.length);

    const keys = items.map((it) => it.key).sort();
    const defKeys = SYSTEM_PROMPT_DEFINITIONS.map((d) => d.key).sort();
    expect(keys).toEqual(defKeys);
  });

  it('supports save/reset overrides', async () => {
    const key = SYSTEM_PROMPT_DEFINITIONS[0].key;
    const baseline = await getSystemPromptContent(key);

    await saveSystemPromptContent(key, 'hello');
    expect(await getSystemPromptContent(key)).toBe('hello');

    await resetSystemPromptContent(key);
    expect(await getSystemPromptContent(key)).toBe(baseline);
  });
});

