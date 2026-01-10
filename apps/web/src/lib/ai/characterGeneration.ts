import { z } from 'zod';
import type {
  AIResponse,
  ArtStyleConfig,
  Character,
  PortraitPrompts,
  WorldViewElement,
} from '@/types';
import { fillPromptTemplate } from '@/lib/ai/contextBuilder';
import { parseFirstJSONObject } from '@/lib/ai/jsonExtractor';
import { getSystemPromptContent } from '@/lib/systemPrompts';

const CHARACTER_BASIC_INFO_PROMPT_KEY = 'web.character.basic_info.user';
const CHARACTER_PORTRAIT_PROMPT_KEY = 'web.character.portrait_prompts.user';
const JSON_REPAIR_PROMPT_KEY = 'web.json_repair.user';

export type CharacterBasicInfoOutput = {
  name: string;
  appearance: string;
  personality: string;
  background: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export type CharacterPortraitOutput = PortraitPrompts;

const HEX_COLOR_RE = /^#?[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!HEX_COLOR_RE.test(trimmed)) return undefined;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

const CharacterBasicInfoOutputSchema = z
  .object({
    name: z.string().min(1).max(120),
    appearance: z.string().min(1).max(8000),
    personality: z.string().min(1).max(8000),
    background: z.string().min(1).max(12000),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
  })
  .passthrough()
  .transform((v) => ({
    name: v.name,
    appearance: v.appearance,
    personality: v.personality,
    background: v.background,
    primaryColor: normalizeHexColor(v.primaryColor),
    secondaryColor: normalizeHexColor(v.secondaryColor),
  }));

const CharacterPortraitOutputSchema = z
  .object({
    midjourney: z.string().min(1).max(12000),
    stableDiffusion: z.string().min(1).max(12000),
    general: z.string().min(1).max(12000),
  })
  .passthrough()
  .transform((v) => ({
    midjourney: v.midjourney,
    stableDiffusion: v.stableDiffusion,
    general: v.general,
  }));

export type ParsedJsonError = {
  reason: string;
  details?: string;
};

export async function buildCharacterBasicInfoPrompt(input: {
  briefDescription: string;
  summary: string;
  protagonist: string;
  artStyle?: ArtStyleConfig;
  worldViewElements?: WorldViewElement[];
  existingCharacters?: Character[];
}): Promise<string> {
  const template = await getSystemPromptContent(CHARACTER_BASIC_INFO_PROMPT_KEY);
  return fillPromptTemplate(template, {
    artStyle: input.artStyle,
    worldViewElements: input.worldViewElements ?? [],
    summary: input.summary,
    protagonist: input.protagonist,
    characters: input.existingCharacters ?? [],
    briefDescription: input.briefDescription,
  });
}

export async function buildCharacterPortraitPrompt(input: {
  characterName: string;
  characterAppearance: string;
  primaryColor?: string;
  secondaryColor?: string;
  artStyle?: ArtStyleConfig;
  worldViewElements?: WorldViewElement[];
}): Promise<string> {
  const template = await getSystemPromptContent(CHARACTER_PORTRAIT_PROMPT_KEY);
  return fillPromptTemplate(template, {
    artStyle: input.artStyle,
    worldViewElements: input.worldViewElements ?? [],
    characterName: input.characterName,
    characterAppearance: input.characterAppearance,
    primaryColor: input.primaryColor ?? '',
    secondaryColor: input.secondaryColor ?? '',
  });
}

export function parseCharacterBasicInfo(
  raw: string,
): { ok: true; value: CharacterBasicInfoOutput } | { ok: false; error: ParsedJsonError } {
  const first = parseFirstJSONObject(raw);
  if (!first.ok) {
    return {
      ok: false,
      error: {
        reason: `解析 JSON 失败：${first.reason}`,
        details: first.candidates?.length ? first.candidates.join('\n---\n') : undefined,
      },
    };
  }

  const parsed = CharacterBasicInfoOutputSchema.safeParse(first.value);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        reason: 'JSON 字段不完整或类型不正确',
        details: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n'),
      },
    };
  }

  return { ok: true, value: parsed.data };
}

export function parseCharacterPortraitPrompts(
  raw: string,
): { ok: true; value: CharacterPortraitOutput } | { ok: false; error: ParsedJsonError } {
  const first = parseFirstJSONObject(raw);
  if (!first.ok) {
    return {
      ok: false,
      error: {
        reason: `解析 JSON 失败：${first.reason}`,
        details: first.candidates?.length ? first.candidates.join('\n---\n') : undefined,
      },
    };
  }

  const parsed = CharacterPortraitOutputSchema.safeParse(first.value);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        reason: 'JSON 字段不完整或类型不正确',
        details: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n'),
      },
    };
  }

  return { ok: true, value: parsed.data };
}

export async function buildJsonRepairPrompt(options: {
  requiredKeys: string[];
  raw: string;
  extraRules?: string[];
}): Promise<string> {
  const template = await getSystemPromptContent(JSON_REPAIR_PROMPT_KEY);

  const keys = options.requiredKeys.join(' / ');
  const rules = options.extraRules?.length
    ? `\n附加要求：\n- ${options.extraRules.join('\n- ')}\n`
    : '';
  const original = options.raw?.trim() ?? '';

  return template.replace('{keys}', keys).replace('{rules}', rules).replace('{original}', original);
}

export function mergeTokenUsage(
  a?: AIResponse['tokenUsage'],
  b?: AIResponse['tokenUsage'],
): AIResponse['tokenUsage'] | undefined {
  if (!a && !b) return undefined;
  return {
    prompt: (a?.prompt ?? 0) + (b?.prompt ?? 0),
    completion: (a?.completion ?? 0) + (b?.completion ?? 0),
    total: (a?.total ?? 0) + (b?.total ?? 0),
  };
}
