import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT_DEFINITION_BY_KEY, SYSTEM_PROMPT_DEFINITIONS } from './systemPrompts.js';

describe('systemPrompts', () => {
  it('keeps keys unique and indexed', () => {
    const keys = SYSTEM_PROMPT_DEFINITIONS.map((d) => d.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);

    for (const def of SYSTEM_PROMPT_DEFINITIONS) {
      expect(def.key.trim()).toBeTruthy();
      expect(def.title.trim()).toBeTruthy();
      expect(def.category).toBeTruthy();
      expect(def.defaultContent.trim()).toBeTruthy();
      expect(def.description?.trim()).toBeTruthy();
      expect(SYSTEM_PROMPT_DEFINITION_BY_KEY[def.key]).toBe(def);
    }
  });
});

