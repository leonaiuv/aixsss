import { describe, it, expect } from 'vitest';
import { styleFullPrompt, validateProjectPlannable } from './planningValidation.js';
import type { Prisma } from '@prisma/client';

type ProjectLike = {
  summary: string;
  style: string;
  artStyleConfig: Prisma.JsonValue | null;
};

describe('planningValidation', () => {
  it('uses artStyleConfig.fullPrompt when available', () => {
    const project: ProjectLike = {
      summary: 'a'.repeat(120),
      style: '',
      artStyleConfig: { fullPrompt: 'my style prompt' },
    };
    expect(styleFullPrompt(project)).toBe('my style prompt');
    expect(validateProjectPlannable(project)).toEqual({ ok: true });
  });

  it('fails when summary is too short', () => {
    const project: ProjectLike = {
      summary: '短梗概',
      style: 'anime',
      artStyleConfig: null,
    };
    const res = validateProjectPlannable(project);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missingFields).toContain('summary');
      expect(res.missingFields).not.toContain('artStyle');
    }
  });

  it('fails when style is missing', () => {
    const project: ProjectLike = {
      summary: 'a'.repeat(120),
      style: '',
      artStyleConfig: null,
    };
    const res = validateProjectPlannable(project);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missingFields).toContain('artStyle');
    }
  });

  it('supports configurable minSummaryLength', () => {
    const project: ProjectLike = {
      summary: 'a'.repeat(20),
      style: 'anime',
      artStyleConfig: null,
    };
    expect(validateProjectPlannable(project, { minSummaryLength: 10 })).toEqual({ ok: true });
    const res = validateProjectPlannable(project, { minSummaryLength: 30 });
    expect(res.ok).toBe(false);
  });
});
