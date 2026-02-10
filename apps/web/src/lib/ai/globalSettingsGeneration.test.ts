import { describe, expect, it } from 'vitest';
import {
  buildGlobalSettingsGenerationPrompt,
  parseGeneratedGlobalSettingsPayload,
} from './globalSettingsGeneration';

describe('globalSettingsGeneration', () => {
  it('buildGlobalSettingsGenerationPrompt should include inspiration and output contract', () => {
    const prompt = buildGlobalSettingsGenerationPrompt({
      inspiration: '未来都市里的记忆盗取阴谋',
      currentSummary: '旧梗概',
      currentProtagonist: '旧主角',
      currentStyleFullPrompt: 'anime style',
    });

    expect(prompt).toContain('未来都市里的记忆盗取阴谋');
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"worldViewElements"');
    expect(prompt).toContain('"characters"');
  });

  it('parseGeneratedGlobalSettingsPayload should parse and normalize valid payload', () => {
    const raw = JSON.stringify({
      summary: '在近未来海港城，一名记忆修复师被卷入企业黑箱实验，引发连锁追捕。',
      protagonist: '女主角，记忆修复师，外冷内热，擅长逆向神经算法。',
      artStyle: {
        baseStyle: 'anime style, cinematic',
        technique: 'clean lineart, subtle grain',
        colorPalette: 'cool neon with warm highlights',
        culturalFeature: 'near future East-Asian megacity',
      },
      worldViewElements: [
        { type: 'era', title: '时代背景', content: '神经接口全面民用化。' },
        { type: 'technology', title: '核心科技', content: '可逆记忆刻写与篡改技术。' },
      ],
      characters: [
        {
          name: '林雾',
          briefDescription: '记忆修复师',
          appearance: '黑色短发，深色风衣，携带便携神经终端。',
          personality: '理性克制，关键时刻果断。',
          background: '曾参与军方项目后离职，经营地下诊所。',
          primaryColor: '334455',
          secondaryColor: '#AA7733',
        },
      ],
    });

    const parsed = parseGeneratedGlobalSettingsPayload(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.summary).toContain('近未来');
    expect(parsed.value.artStyle.presetId).toBe('custom');
    expect(parsed.value.artStyle.fullPrompt).toContain('anime style');
    expect(parsed.value.characters[0].primaryColor).toBe('#334455');
    expect(parsed.value.characters[0].secondaryColor).toBe('#AA7733');
  });

  it('parseGeneratedGlobalSettingsPayload should fail on invalid shape', () => {
    const raw = JSON.stringify({
      summary: 'ok',
      protagonist: 'ok',
      artStyle: {},
      worldViewElements: 'not-array',
      characters: [],
    });

    const parsed = parseGeneratedGlobalSettingsPayload(raw);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain('JSON 字段');
  });
});
