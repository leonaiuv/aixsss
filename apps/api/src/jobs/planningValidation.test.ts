import { describe, it, expect } from 'vitest';
import { styleFullPrompt, validateProjectPlannable } from './planningValidation.js';

describe('planningValidation', () => {
  it('uses artStyleConfig.fullPrompt when available', () => {
    const project = {
      summary: 'a'.repeat(120),
      style: '',
      artStyleConfig: { fullPrompt: 'my style prompt' },
    };
    expect(styleFullPrompt(project as any)).toBe('my style prompt');
    expect(validateProjectPlannable(project as any)).toEqual({ ok: true });
  });

  it('fails when summary is too short', () => {
    const project = {
      summary: '短梗概',
      style: 'anime',
      artStyleConfig: null,
    };
    const res = validateProjectPlannable(project as any);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missingFields).toContain('summary');
      expect(res.missingFields).not.toContain('artStyle');
    }
  });

  it('fails when style is missing', () => {
    const project = {
      summary: 'a'.repeat(120),
      style: '',
      artStyleConfig: null,
    };
    const res = validateProjectPlannable(project as any);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missingFields).toContain('artStyle');
    }
  });

  it('supports configurable minSummaryLength', () => {
    const project = {
      summary: 'a'.repeat(20),
      style: 'anime',
      artStyleConfig: null,
    };
    expect(validateProjectPlannable(project as any, { minSummaryLength: 10 })).toEqual({ ok: true });
    const res = validateProjectPlannable(project as any, { minSummaryLength: 30 });
    expect(res.ok).toBe(false);
  });
});

