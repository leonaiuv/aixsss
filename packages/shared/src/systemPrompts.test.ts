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

  it('contains professional workflow prompt keys', () => {
    const keys = new Set(SYSTEM_PROMPT_DEFINITIONS.map((d) => d.key));
    expect(keys.has('workflow.scene_script.system')).toBe(true);
    expect(keys.has('workflow.emotion_arc.system')).toBe(true);
    expect(keys.has('workflow.sound_design.system')).toBe(true);
    expect(keys.has('workflow.character_relationships.system')).toBe(true);
    expect(keys.has('workflow.character_expansion.system')).toBe(true);
    expect(keys.has('workflow.character_expansion.agent.system')).toBe(true);
    expect(keys.has('workflow.scene_script.fix.system')).toBe(true);
    expect(keys.has('workflow.sound_design.fix.system')).toBe(true);
    expect(keys.has('workflow.narrative_causal_chain.phase3_4.agent.system')).toBe(true);
    expect(keys.has('workflow.supervisor.agent.system')).toBe(true);
  });
});
