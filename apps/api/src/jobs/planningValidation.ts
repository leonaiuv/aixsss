import type { Prisma } from '@prisma/client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function styleFullPrompt(project: { style: string; artStyleConfig: Prisma.JsonValue | null }): string {
  if (project.artStyleConfig && isRecord(project.artStyleConfig)) {
    const fullPrompt = project.artStyleConfig['fullPrompt'];
    if (typeof fullPrompt === 'string' && fullPrompt.trim()) return fullPrompt.trim();
  }
  return project.style || '';
}

export function validateProjectPlannable(
  project: { summary: string; style: string; artStyleConfig: Prisma.JsonValue | null },
  options?: { minSummaryLength?: number },
): { ok: true } | { ok: false; missingFields: string[] } {
  const missingFields: string[] = [];

  const minSummaryLength = options?.minSummaryLength ?? 100;
  const summary = project.summary?.trim() ?? '';
  if (summary.length < minSummaryLength) missingFields.push('summary');

  const style = styleFullPrompt(project).trim();
  if (!style) missingFields.push('artStyle');

  if (missingFields.length > 0) return { ok: false, missingFields };
  return { ok: true };
}

