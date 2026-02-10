import { z } from 'zod';
import { composeStyleFullPrompt, type ArtStyleConfig, type WorldViewElement } from '@/types';
import { parseFirstJSONObject } from './jsonExtractor';

const HEX_COLOR_RE = /^#?[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!HEX_COLOR_RE.test(trimmed)) return undefined;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

const WorldViewTypeSchema = z.enum(['era', 'geography', 'society', 'technology', 'magic', 'custom']);

const GeneratedArtStyleSchema = z.object({
  baseStyle: z.string().min(1).max(500),
  technique: z.string().min(1).max(500),
  colorPalette: z.string().min(1).max(500),
  culturalFeature: z.string().min(1).max(500),
});

const GeneratedWorldViewSchema = z.object({
  type: WorldViewTypeSchema,
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(3000),
});

const GeneratedCharacterSchema = z
  .object({
    name: z.string().min(1).max(120),
    briefDescription: z.string().min(1).max(200),
    appearance: z.string().min(1).max(8000),
    personality: z.string().min(1).max(8000),
    background: z.string().min(1).max(12000),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
  })
  .transform((v) => ({
    ...v,
    primaryColor: normalizeHexColor(v.primaryColor),
    secondaryColor: normalizeHexColor(v.secondaryColor),
  }));

const GeneratedGlobalSettingsSchema = z.object({
  summary: z.string().min(1).max(300),
  protagonist: z.string().min(1).max(150),
  artStyle: GeneratedArtStyleSchema,
  worldViewElements: z.array(GeneratedWorldViewSchema).min(1).max(12),
  characters: z.array(GeneratedCharacterSchema).min(1).max(8),
});

export type GeneratedGlobalSettingsPayload = {
  summary: string;
  protagonist: string;
  artStyle: ArtStyleConfig;
  worldViewElements: Array<{
    type: WorldViewElement['type'];
    title: string;
    content: string;
  }>;
  characters: Array<{
    name: string;
    briefDescription: string;
    appearance: string;
    personality: string;
    background: string;
    primaryColor?: string;
    secondaryColor?: string;
  }>;
};

export function buildGlobalSettingsGenerationPrompt(input: {
  inspiration: string;
  currentSummary?: string;
  currentProtagonist?: string;
  currentStyleFullPrompt?: string;
}) {
  return [
    '你是资深动漫剧本与世界观设计师。请根据用户灵感，生成“全局设定”完整 JSON。',
    '',
    '要求：',
    '1. 只输出 JSON，不要任何解释。',
    '2. summary 控制在 120~260 字。',
    '3. protagonist 控制在 40~120 字。',
    '4. worldViewElements 产出 3~6 条，type 只能是 era/geography/society/technology/magic/custom。',
    '5. characters 产出 2~5 个，name 不能重复，字段完整。',
    '6. 若给出颜色，必须是 #RRGGBB（可不带 #）。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "summary": "string",',
    '  "protagonist": "string",',
    '  "artStyle": {',
    '    "baseStyle": "string",',
    '    "technique": "string",',
    '    "colorPalette": "string",',
    '    "culturalFeature": "string"',
    '  },',
    '  "worldViewElements": [',
    '    { "type": "era|geography|society|technology|magic|custom", "title": "string", "content": "string" }',
    '  ],',
    '  "characters": [',
    '    {',
    '      "name": "string",',
    '      "briefDescription": "string",',
    '      "appearance": "string",',
    '      "personality": "string",',
    '      "background": "string",',
    '      "primaryColor": "#RRGGBB 可选",',
    '      "secondaryColor": "#RRGGBB 可选"',
    '    }',
    '  ]',
    '}',
    '',
    '用户灵感：',
    input.inspiration.trim(),
    '',
    '当前已填写内容（如有则参考并保持一致性）：',
    `- summary: ${input.currentSummary?.trim() || '-'}`,
    `- protagonist: ${input.currentProtagonist?.trim() || '-'}`,
    `- style: ${input.currentStyleFullPrompt?.trim() || '-'}`,
  ].join('\n');
}

export function parseGeneratedGlobalSettingsPayload(
  raw: string,
):
  | { ok: true; value: GeneratedGlobalSettingsPayload }
  | { ok: false; reason: string; details?: string } {
  const first = parseFirstJSONObject(raw);
  if (!first.ok) {
    return {
      ok: false,
      reason: `解析 JSON 失败：${first.reason}`,
      details: first.candidates?.join('\n---\n'),
    };
  }

  const parsed = GeneratedGlobalSettingsSchema.safeParse(first.value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'JSON 字段不完整或类型不正确',
      details: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n'),
    };
  }

  const artStyle: ArtStyleConfig = {
    presetId: 'custom',
    baseStyle: parsed.data.artStyle.baseStyle,
    technique: parsed.data.artStyle.technique,
    colorPalette: parsed.data.artStyle.colorPalette,
    culturalFeature: parsed.data.artStyle.culturalFeature,
    fullPrompt: composeStyleFullPrompt(parsed.data.artStyle),
  };

  return {
    ok: true,
    value: {
      summary: parsed.data.summary,
      protagonist: parsed.data.protagonist,
      artStyle,
      worldViewElements: parsed.data.worldViewElements,
      characters: parsed.data.characters,
    },
  };
}
