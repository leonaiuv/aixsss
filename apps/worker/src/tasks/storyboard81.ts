import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage, ProviderChatConfig, ResponseFormat } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import {
  mergeTokenUsage,
  styleFullPrompt,
  toProviderChatConfig,
  type TokenUsage,
} from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import { parseJsonFromText } from './aiJson.js';
import {
  GENERATED_IMAGE_KEYFRAMES,
  SceneBibleSchema,
  StoryboardCameraModeSchema,
  StoryboardGroupDraftSchema,
  StoryboardGroupsJsonSchema,
  StoryboardPlanSchema,
  type ContinuityState,
  ContinuityStateSchema,
  type SceneBible,
  type StoryboardCameraMode,
  type StoryboardGroupDraft,
  type StoryboardGroupsJson,
  type StoryboardPlan,
} from '@aixsss/shared';

type ValidationIssue = { path: string; message: string };

function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function formatIssuesForPrompt(issues: ValidationIssue[]): string {
  return issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
}

function validatePanelsBasic(group: StoryboardGroupDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const panels = group.panels ?? [];

  if (panels.length !== 9) {
    issues.push({ path: 'panels', message: `panels 必须恰好 9 个，当前=${panels.length}` });
    return issues;
  }

  const indexSet = new Set<number>();
  for (const p of panels) {
    if (typeof p.index !== 'number' || !Number.isInteger(p.index)) {
      issues.push({ path: 'panels.index', message: 'index 必须为整数' });
      continue;
    }
    if (p.index < 1 || p.index > 9) {
      issues.push({ path: `panels.${p.index}.index`, message: 'index 必须在 1..9' });
    }
    if (indexSet.has(p.index)) {
      issues.push({ path: `panels.${p.index}.index`, message: 'index 重复' });
    }
    indexSet.add(p.index);

    if (typeof p.en !== 'string' || !p.en.trim()) {
      issues.push({ path: `panels.${p.index}.en`, message: 'en 不能为空' });
    }
  }

  for (let i = 1; i <= 9; i += 1) {
    if (!indexSet.has(i)) issues.push({ path: 'panels', message: `缺少 index=${i}` });
  }

  // 重复检测：先做“完全重复”兜底
  const seen = new Map<string, number>();
  for (const p of panels) {
    const key = normalizeText(p.en ?? '');
    if (!key) continue;
    const prev = seen.get(key);
    if (prev !== undefined) {
      issues.push({
        path: `panels.${p.index}.en`,
        message: `与 panels.${prev}.en 完全重复`,
      });
    } else {
      seen.set(key, p.index);
    }
  }

  return issues;
}

function validateCameraMode(
  group: StoryboardGroupDraft,
  cameraMode: StoryboardCameraMode,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (cameraMode === 'A') {
    for (const p of group.panels) {
      const en = typeof p.en === 'string' ? p.en.trim() : '';
      if (!/^\[[^\]]+\]\s+\S/.test(en)) {
        issues.push({
          path: `panels.${p.index}.en`,
          message:
            'camera_mode=A 时，en 必须以方括号镜头语言前缀开头，例如：[LS|eye|35mm|pan→] ...',
        });
      }
    }
    return issues;
  }

  for (const p of group.panels) {
    const cam = p.camera as unknown;
    const ok =
      cam &&
      typeof cam === 'object' &&
      typeof (cam as { shot_size?: unknown }).shot_size === 'string' &&
      typeof (cam as { angle?: unknown }).angle === 'string' &&
      typeof (cam as { lens?: unknown }).lens === 'string' &&
      typeof (cam as { motion?: unknown }).motion === 'string';
    if (!ok) {
      issues.push({
        path: `panels.${p.index}.camera`,
        message: 'camera_mode=B 时，camera 必须存在且包含 shot_size/angle/lens/motion 字符串字段',
      });
    }
  }

  return issues;
}

function validateContinuityCarryOver(args: {
  prevEndState: ContinuityState;
  nextEndState: ContinuityState;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const prevChars = (args.prevEndState.characters ?? [])
    .map((c) => normalizeText(c.name))
    .filter(Boolean);
  const nextChars = new Set(
    (args.nextEndState.characters ?? []).map((c) => normalizeText(c.name)).filter(Boolean),
  );
  for (const name of prevChars) {
    if (!nextChars.has(name)) {
      issues.push({ path: 'continuity.end_state.characters', message: `未承接上一组角色：${name}` });
    }
  }

  const prevProps = (args.prevEndState.props ?? [])
    .map((p) => normalizeText(p.name))
    .filter(Boolean);
  const nextProps = new Set(
    (args.nextEndState.props ?? []).map((p) => normalizeText(p.name)).filter(Boolean),
  );
  for (const name of prevProps) {
    if (!nextProps.has(name)) {
      issues.push({ path: 'continuity.end_state.props', message: `未承接上一组道具：${name}` });
    }
  }

  return issues;
}

function coerceContinuityStateLite(value: unknown): ContinuityState {
  const parsed = ContinuityStateSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return { characters: [], props: [], next_intent_hint: '' };
}

function buildShotRanges(): string[] {
  const ranges: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const start = i * 9 + 1;
    const end = i * 9 + 9;
    ranges.push(`${start}-${end}`);
  }
  return ranges;
}

function sortKeyframes<T extends { group_id: (typeof GENERATED_IMAGE_KEYFRAMES)[number] }>(groups: T[]): T[] {
  const order = new Map(GENERATED_IMAGE_KEYFRAMES.map((id, idx) => [id, idx] as const));
  return groups
    .slice()
    .sort((a, b) => (order.get(a.group_id) ?? 999) - (order.get(b.group_id) ?? 999));
}

function buildInitialGroupsJson(plan: StoryboardPlan, cameraMode: StoryboardCameraMode): StoryboardGroupsJson {
  const sorted = sortKeyframes(plan.groups);
  return {
    version: 1,
    settings: { camera_mode: cameraMode },
    groups: sorted.map((g) => ({ group_id: g.group_id, shot_range: g.shot_range, status: 'pending' })),
    translation: { status: 'pending' },
  };
}

function panelCameraBadge(panel: StoryboardGroupDraft['panels'][number]): string {
  const cam = panel.camera as unknown as
    | { shot_size?: string; angle?: string; lens?: string; motion?: string }
    | undefined;
  const parts = [cam?.shot_size, cam?.angle, cam?.lens, cam?.motion]
    .map((x) => (x ?? '').trim())
    .filter(Boolean);
  return parts.length ? `[${parts.join('|')}]` : '';
}

function renderPromptEn(args: {
  sceneBible: SceneBible;
  style: string;
  group: StoryboardGroupDraft;
  cameraMode: StoryboardCameraMode;
}): { template_version: number; prompt_en: string; render_json: unknown } {
  const templateVersion = 1;
  const lines: string[] = [];

  lines.push('Generate ONE 3x3 storyboard grid image (9 panels).');
  lines.push(`Group: ${args.group.group_id} (shots ${args.group.shot_range}).`);
  if (args.style?.trim()) lines.push(`Style: ${args.style.trim()}`);
  if (args.sceneBible.scene_premise?.trim()) lines.push(`Premise: ${args.sceneBible.scene_premise.trim()}`);
  if (args.sceneBible.setting_lock?.trim()) lines.push(`Setting lock: ${args.sceneBible.setting_lock.trim()}`);
  if (Array.isArray(args.sceneBible.props_list) && args.sceneBible.props_list.length) {
    lines.push(`Key props: ${args.sceneBible.props_list.join(', ')}`);
  }

  lines.push('');
  lines.push('Requirements:');
  lines.push('- Clean 3x3 grid layout with clear gutters.');
  lines.push('- Consistent characters, props, and setting across all 9 panels.');
  lines.push('- Each panel clearly depicts its described action (no missing panels).');
  lines.push('');
  lines.push('Panels (1-9):');

  const panelsSorted = args.group.panels.slice().sort((a, b) => a.index - b.index);
  for (const p of panelsSorted) {
    const en = (p.en ?? '').trim();
    const badge = args.cameraMode === 'B' ? panelCameraBadge(p) : '';
    lines.push(`${p.index}. ${badge ? `${badge} ` : ''}${en}`);
  }

  const prompt_en = lines.join('\n').trim();
  const render_json = {
    provider: 'nano-banana-pro',
    schema_version: 'placeholder_v1',
    template_version: templateVersion,
    input: { prompt_en, group_id: args.group.group_id, shot_range: args.group.shot_range },
  };

  return { template_version: templateVersion, prompt_en, render_json };
}

const SCENE_BIBLE_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'scene_bible_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['scene_premise', 'characters', 'setting_lock', 'props_list', 'must_happen_beats'],
      properties: {
        scene_premise: { type: 'string' },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
              name: { type: 'string' },
              identity: { type: 'string' },
              relation: { type: 'string' },
            },
          },
        },
        setting_lock: { type: 'string' },
        props_list: { type: 'array', items: { type: 'string' } },
        must_happen_beats: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
    },
  },
};

const STORYBOARD_PLAN_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'storyboard_plan_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['groups'],
      properties: {
        groups: {
          type: 'array',
          minItems: 9,
          maxItems: 9,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['group_id', 'shot_range', 'goal_en'],
            properties: {
              group_id: { type: 'string', enum: GENERATED_IMAGE_KEYFRAMES as unknown as string[] },
              shot_range: { type: 'string' },
              goal_en: { type: 'string' },
              start_state: {
                type: 'object',
                additionalProperties: true,
                required: ['characters', 'props', 'next_intent_hint'],
                properties: {
                  characters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['name', 'location', 'stance', 'facing', 'emotion', 'props_in_hand'],
                      properties: {
                        name: { type: 'string' },
                        location: { type: 'string' },
                        stance: { type: 'string' },
                        facing: { type: 'string' },
                        emotion: { type: 'string' },
                        props_in_hand: {
                          type: 'object',
                          additionalProperties: true,
                          required: ['left', 'right'],
                          properties: {
                            left: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                            right: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                          },
                        },
                      },
                    },
                  },
                  props: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['name', 'state', 'holder'],
                      properties: {
                        name: { type: 'string' },
                        state: { type: 'string' },
                        holder: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      },
                    },
                  },
                  next_intent_hint: { type: 'string' },
                },
              },
              end_state: {
                type: 'object',
                additionalProperties: true,
                required: ['characters', 'props', 'next_intent_hint'],
                properties: {
                  characters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['name', 'location', 'stance', 'facing', 'emotion', 'props_in_hand'],
                      properties: {
                        name: { type: 'string' },
                        location: { type: 'string' },
                        stance: { type: 'string' },
                        facing: { type: 'string' },
                        emotion: { type: 'string' },
                        props_in_hand: {
                          type: 'object',
                          additionalProperties: true,
                          required: ['left', 'right'],
                          properties: {
                            left: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                            right: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                          },
                        },
                      },
                    },
                  },
                  props: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['name', 'state', 'holder'],
                      properties: {
                        name: { type: 'string' },
                        state: { type: 'string' },
                        holder: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                      },
                    },
                  },
                  next_intent_hint: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const STORYBOARD_GROUP_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'storyboard_group_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: true,
      required: ['group_id', 'shot_range', 'panels', 'continuity'],
      properties: {
        group_id: { type: 'string', enum: GENERATED_IMAGE_KEYFRAMES as unknown as string[] },
        shot_range: { type: 'string' },
        panels: {
          type: 'array',
          minItems: 9,
          maxItems: 9,
          items: {
            type: 'object',
            additionalProperties: true,
            required: ['index', 'en'],
            properties: {
              index: { type: 'integer', minimum: 1, maximum: 9 },
              en: { type: 'string' },
              camera: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  shot_size: { type: 'string' },
                  angle: { type: 'string' },
                  lens: { type: 'string' },
                  motion: { type: 'string' },
                },
              },
            },
          },
        },
        continuity: {
          type: 'object',
          additionalProperties: true,
          required: ['end_state'],
          properties: {
            end_state: {
              type: 'object',
              additionalProperties: true,
              required: ['characters', 'props', 'next_intent_hint'],
              properties: {
                characters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['name', 'location', 'stance', 'facing', 'emotion', 'props_in_hand'],
                    properties: {
                      name: { type: 'string' },
                      location: { type: 'string' },
                      stance: { type: 'string' },
                      facing: { type: 'string' },
                      emotion: { type: 'string' },
                      props_in_hand: {
                        type: 'object',
                        additionalProperties: true,
                        required: ['left', 'right'],
                        properties: {
                          left: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                          right: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                        },
                      },
                    },
                  },
                },
                props: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['name', 'state', 'holder'],
                    properties: {
                      name: { type: 'string' },
                      state: { type: 'string' },
                      holder: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    },
                  },
                },
                next_intent_hint: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const TRANSLATE_PANELS_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'translate_panels_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['panels'],
      properties: {
        panels: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'zh'],
            properties: {
              index: { type: 'integer', minimum: 1, maximum: 9 },
              zh: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

const BACK_TRANSLATE_PANELS_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'back_translate_panels_v1',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['panels'],
      properties: {
        panels: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'en'],
            properties: {
              index: { type: 'integer', minimum: 1, maximum: 9 },
              en: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

async function generateJsonWithValidation<T>(args: {
  providerConfig: ProviderChatConfig;
  messages: ChatMessage[];
  responseFormat: ResponseFormat | undefined;
  parse: (json: unknown) => z.SafeParseReturnType<unknown, T>;
  semanticValidate?: (json: T) => ValidationIssue[];
  buildRepairMessages: (rawJson: string, issues: ValidationIssue[]) => ChatMessage[];
  maxAttempts?: number;
}): Promise<{ json: T; extractedJson: string; tokenUsage?: TokenUsage; attempts: number }> {
  const maxAttempts = Math.max(1, args.maxAttempts ?? 2);
  let tokenUsage: TokenUsage | undefined;
  let lastExtracted = '';
  let lastIssues: ValidationIssue[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const cfg: ProviderChatConfig = args.responseFormat
      ? { ...args.providerConfig, responseFormat: args.responseFormat }
      : args.providerConfig;

    const res = await chatWithProvider(cfg, args.messages);
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage);

    let parsed: { json: unknown; extractedJson: string } | null = null;
    try {
      parsed = parseJsonFromText(res.content, { expectedKind: 'object' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastExtracted = (res.content ?? '').trim();
      lastIssues = [{ path: '$', message: `JSON 解析失败：${message}` }];
    }

    const typed = parsed ? args.parse(parsed.json) : null;
    if (typed && !typed.success) {
      lastExtracted = parsed?.extractedJson ?? lastExtracted;
      lastIssues = typed.error.issues.map((i) => ({
        path: i.path.length ? i.path.join('.') : '$',
        message: i.message,
      }));
    } else if (typed && typed.success && args.semanticValidate) {
      lastExtracted = parsed?.extractedJson ?? lastExtracted;
      lastIssues = args.semanticValidate(typed.data);
    } else if (typed && typed.success) {
      lastExtracted = parsed?.extractedJson ?? lastExtracted;
      lastIssues = [];
    }

    if (typed?.success && lastIssues.length === 0) {
      return { json: typed.data, extractedJson: lastExtracted, tokenUsage, attempts: attempt };
    }

    if (attempt === maxAttempts) break;

    const repairMessages = args.buildRepairMessages(lastExtracted, lastIssues);
    const repairRes = await chatWithProvider(
      args.responseFormat
        ? { ...args.providerConfig, responseFormat: args.responseFormat }
        : args.providerConfig,
      repairMessages,
    );
    tokenUsage = mergeTokenUsage(tokenUsage, repairRes.tokenUsage);

    try {
      const repaired = parseJsonFromText(repairRes.content, { expectedKind: 'object' });
      lastExtracted = repaired.extractedJson;
      const repairedTyped = args.parse(repaired.json);
      if (!repairedTyped.success) {
        lastIssues = repairedTyped.error.issues.map((i) => ({
          path: i.path.length ? i.path.join('.') : '$',
          message: i.message,
        }));
        continue;
      }
      const semIssues = args.semanticValidate ? args.semanticValidate(repairedTyped.data) : [];
      lastIssues = semIssues;
      if (semIssues.length === 0) {
        return { json: repairedTyped.data, extractedJson: lastExtracted, tokenUsage, attempts: attempt + 1 };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastExtracted = (repairRes.content ?? '').trim();
      lastIssues = [{ path: '$', message: `JSON 解析失败：${message}` }];
    }
  }

  const summary = lastIssues.length ? `\n${formatIssuesForPrompt(lastIssues)}` : '';
  throw new Error(`结构化 JSON 生成失败（多次修复仍未通过校验）：${summary}`);
}

function buildFormatFixPrompt(args: {
  systemPrompt: string;
  raw: string;
  issues: ValidationIssue[];
}): ChatMessage[] {
  const user = [
    '下面的输出未通过校验，请做“最小修改”修复，并只输出严格 JSON：',
    '',
    '校验问题：',
    formatIssuesForPrompt(args.issues),
    '',
    '原始输出：',
    '<<<',
    args.raw?.trim() ?? '',
    '>>>',
  ].join('\n');
  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildContinuityRepairPrompt(args: {
  systemPrompt: string;
  groupId: string;
  shotRange: string;
  cameraMode: StoryboardCameraMode;
  goalEn: string;
  prevEndState: ContinuityState;
  rawJson: string;
  issues: ValidationIssue[];
}): ChatMessage[] {
  const user = [
    '请修复当前分镜组的连贯性/重复/承接问题，并只输出严格 JSON。',
    '',
    `group_id: ${args.groupId}`,
    `shot_range: ${args.shotRange}`,
    `camera_mode: ${args.cameraMode}`,
    '',
    'group_goal_en:',
    args.goalEn || '-',
    '',
    'prev_end_state:',
    JSON.stringify(args.prevEndState, null, 2),
    '',
    'issues:',
    formatIssuesForPrompt(args.issues),
    '',
    'current_output_json:',
    args.rawJson,
  ].join('\n');
  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildSceneBibleUserPrompt(args: {
  projectSummary: string;
  style: string;
  sceneSummary: string;
  actionDescription: string;
  sceneAnchorJson: string;
  characterNames: string[];
}): string {
  return [
    '## INPUT',
    'Project summary:',
    args.projectSummary || '-',
    '',
    'Style reference:',
    args.style || '-',
    '',
    'Scene summary:',
    args.sceneSummary || '-',
    '',
    'Scene action/script (if any):',
    args.actionDescription || '-',
    '',
    'Scene anchor (environment lock, JSON):',
    args.sceneAnchorJson || '-',
    '',
    'Cast character names:',
    args.characterNames.length ? args.characterNames.join(', ') : '-',
  ].join('\n');
}

function buildPlanUserPrompt(args: { sceneBible: SceneBible }): string {
  const expectedRanges = buildShotRanges().join(', ');
  return [
    '## INPUT',
    'SceneBible JSON:',
    JSON.stringify(args.sceneBible, null, 2),
    '',
    `Shot ranges must be: ${expectedRanges}`,
  ].join('\n');
}

function buildGroupUserPrompt(args: {
  sceneBible: SceneBible;
  planGroup: { group_id: string; shot_range: string; goal_en: string };
  prevEndState: ContinuityState;
  cameraMode: StoryboardCameraMode;
  runningSummary?: string | null;
}): string {
  return [
    '## INPUT',
    `camera_mode: ${args.cameraMode}`,
    '',
    'SceneBible JSON:',
    JSON.stringify(args.sceneBible, null, 2),
    '',
    'Current plan group:',
    JSON.stringify(args.planGroup, null, 2),
    '',
    'prev_end_state:',
    JSON.stringify(args.prevEndState, null, 2),
    '',
    args.runningSummary?.trim()
      ? ['running_summary (system-maintained, brief):', args.runningSummary.trim(), ''].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTranslateUserPrompt(args: {
  groupId: string;
  panels: Array<{ index: number; en: string }>;
}): string {
  return [`group_id: ${args.groupId}`, 'panels_en:', JSON.stringify({ panels: args.panels }, null, 2)].join(
    '\n',
  );
}

function buildBackTranslateUserPrompt(args: {
  groupId: string;
  panels: Array<{ index: number; zh: string }>;
}): string {
  return [
    `group_id: ${args.groupId}`,
    'panels_zh_dirty_only:',
    JSON.stringify({ panels: args.panels }, null, 2),
  ].join('\n');
}

function normalizeGroupId(input: string): string {
  return input.trim().toUpperCase();
}

function getPrevGroupId(groupId: string): string | null {
  const idx = GENERATED_IMAGE_KEYFRAMES.indexOf(groupId as (typeof GENERATED_IMAGE_KEYFRAMES)[number]);
  if (idx <= 0) return null;
  return GENERATED_IMAGE_KEYFRAMES[idx - 1] ?? null;
}

function assertGroupId(groupId: string): asserts groupId is (typeof GENERATED_IMAGE_KEYFRAMES)[number] {
  if (!GENERATED_IMAGE_KEYFRAMES.includes(groupId as (typeof GENERATED_IMAGE_KEYFRAMES)[number])) {
    throw new Error(`Invalid groupId: ${groupId}`);
  }
}

function ensureStoryboardGroupsJson(scene: {
  storyboardGroupsJson: unknown | null;
  storyboardPlanJson: unknown | null;
}): StoryboardGroupsJson {
  const existing = StoryboardGroupsJsonSchema.safeParse(scene.storyboardGroupsJson);
  if (existing.success) return existing.data;

  const planParsed = StoryboardPlanSchema.safeParse(scene.storyboardPlanJson);
  if (!planParsed.success) throw new Error('Storyboard plan missing/invalid; please generate plan first');

  return buildInitialGroupsJson(planParsed.data, 'B');
}

export async function generateStoryboardSceneBible(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      summary: true,
      actionDescription: true,
      sceneDescription: true,
      castCharacterIds: true,
    },
  });
  if (!scene) throw new Error('Scene not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const characterRows = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });
  const nameById = new Map(characterRows.map((c) => [c.id, c.name] as const));
  const characterNames = (scene.castCharacterIds ?? [])
    .map((id) => nameById.get(id) ?? '')
    .map((s) => s.trim())
    .filter(Boolean);

  const style = styleFullPrompt(project);

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 5, message: '生成 SceneBible...' });
  const systemPrompt = await loadSystemPrompt({ prisma, teamId, key: 'workflow.storyboard.scene_bible.system' });
  const userPrompt = buildSceneBibleUserPrompt({
    projectSummary: project.summary ?? '',
    style,
    sceneSummary: scene.summary ?? '',
    actionDescription: scene.actionDescription ?? '',
    sceneAnchorJson: scene.sceneDescription ?? '',
    characterNames,
  });

  const out = await generateJsonWithValidation<SceneBible>({
    providerConfig,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: SCENE_BIBLE_RESPONSE_FORMAT,
    parse: (json) => SceneBibleSchema.safeParse(json),
    buildRepairMessages: (rawJson, issues) =>
      buildFormatFixPrompt({
        systemPrompt,
        raw: rawJson,
        issues,
      }),
    maxAttempts: 2,
  });

  await updateProgress({ pct: 85, message: '写入数据库...' });
  await prisma.scene.update({
    where: { id: sceneId },
    data: { storyboardSceneBibleJson: out.json as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
  });

  await updateProgress({ pct: 100, message: '完成' });

  return { sceneId, sceneBible: out.json, tokenUsage: out.tokenUsage ?? null };
}

export async function generateStoryboardPlan(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
  options?: { cameraMode?: StoryboardCameraMode };
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, storyboardSceneBibleJson: true, storyboardGroupsJson: true },
  });
  if (!scene) throw new Error('Scene not found');

  const sceneBibleParsed = SceneBibleSchema.safeParse(scene.storyboardSceneBibleJson);
  if (!sceneBibleParsed.success) throw new Error('SceneBible missing/invalid; please generate SceneBible first');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const cameraMode = StoryboardCameraModeSchema.catch('B').parse(args.options?.cameraMode ?? null);

  await updateProgress({ pct: 5, message: '生成 9 组大纲...' });
  const systemPrompt = await loadSystemPrompt({ prisma, teamId, key: 'workflow.storyboard.plan.system' });
  const userPrompt = buildPlanUserPrompt({ sceneBible: sceneBibleParsed.data });

  const out = await generateJsonWithValidation<StoryboardPlan>({
    providerConfig,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: STORYBOARD_PLAN_RESPONSE_FORMAT,
    parse: (json) => StoryboardPlanSchema.safeParse(json),
    semanticValidate: (plan) => {
      const issues: ValidationIssue[] = [];
      const sorted = sortKeyframes(plan.groups);
      const expectedRanges = buildShotRanges();
      for (let i = 0; i < expectedRanges.length; i += 1) {
        const g = sorted[i];
        if (!g) continue;
        const expectedId = GENERATED_IMAGE_KEYFRAMES[i];
        const expectedRange = expectedRanges[i];
        if (g.group_id !== expectedId) issues.push({ path: `groups.${i}.group_id`, message: `必须为 ${expectedId}` });
        if (g.shot_range !== expectedRange)
          issues.push({ path: `groups.${i}.shot_range`, message: `必须为 ${expectedRange}` });
      }
      return issues;
    },
    buildRepairMessages: (rawJson, issues) =>
      buildFormatFixPrompt({
        systemPrompt,
        raw: rawJson,
        issues,
      }),
    maxAttempts: 2,
  });

  const nextGroupsJson = buildInitialGroupsJson(out.json, cameraMode);

  await updateProgress({ pct: 85, message: '写入数据库...' });
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      storyboardPlanJson: out.json as unknown as Prisma.InputJsonValue,
      storyboardGroupsJson: nextGroupsJson as unknown as Prisma.InputJsonValue,
    } as unknown as Prisma.SceneUpdateInput,
  });

  await updateProgress({ pct: 100, message: '完成' });

  return { sceneId, plan: out.json, storyboardGroups: nextGroupsJson, tokenUsage: out.tokenUsage ?? null };
}

export async function generateStoryboardGroup(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  groupId: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
  options?: { cameraMode?: StoryboardCameraMode };
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const groupId = normalizeGroupId(args.groupId);
  assertGroupId(groupId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: {
      id: true,
      storyboardSceneBibleJson: true,
      storyboardPlanJson: true,
      storyboardGroupsJson: true,
    },
  });
  if (!scene) throw new Error('Scene not found');

  const sceneBibleParsed = SceneBibleSchema.safeParse(scene.storyboardSceneBibleJson);
  if (!sceneBibleParsed.success) throw new Error('SceneBible missing/invalid; please generate SceneBible first');

  const planParsed = StoryboardPlanSchema.safeParse(scene.storyboardPlanJson);
  if (!planParsed.success) throw new Error('Storyboard plan missing/invalid; please generate plan first');

  const currentGroupsJson = ensureStoryboardGroupsJson({
    storyboardGroupsJson: scene.storyboardGroupsJson,
    storyboardPlanJson: scene.storyboardPlanJson,
  });

  const settingsCameraMode = currentGroupsJson.settings?.camera_mode ?? 'B';
  const cameraMode =
    StoryboardCameraModeSchema.catch(settingsCameraMode).parse(args.options?.cameraMode ?? null) ??
    settingsCameraMode;

  const groupsSorted = sortKeyframes(currentGroupsJson.groups);
  const groupEntry = groupsSorted.find((g) => g.group_id === groupId);
  if (!groupEntry) throw new Error(`Group not found in storyboardGroupsJson: ${groupId}`);

  const planGroupSorted = sortKeyframes(planParsed.data.groups);
  const planGroup = planGroupSorted.find((g) => g.group_id === groupId);
  if (!planGroup) throw new Error(`Group not found in storyboardPlanJson: ${groupId}`);

  const prevGroupId = getPrevGroupId(groupId);
  const prevEndState: ContinuityState = (() => {
    if (!prevGroupId) return coerceContinuityStateLite(planGroupSorted[0]?.start_state ?? null);
    const prevEntry = groupsSorted.find((g) => g.group_id === prevGroupId);
    const endState = prevEntry?.group?.continuity?.end_state as unknown;
    const parsed = ContinuityStateSchema.safeParse(endState);
    if (!parsed.success) {
      throw new Error(`prev_end_state missing/invalid: ${prevGroupId} 未就绪，请先生成上一组`);
    }
    return parsed.data;
  })();

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const nextGroupsJsonGenerating: StoryboardGroupsJson = {
    ...currentGroupsJson,
    settings: { ...(currentGroupsJson.settings ?? { camera_mode: cameraMode }), camera_mode: cameraMode },
    groups: currentGroupsJson.groups.map((g) =>
      g.group_id === groupId ? { ...g, status: 'generating', last_error: undefined } : g,
    ),
  };

  // Best-effort: mark generating so UI can show state
  try {
    await prisma.scene.update({
      where: { id: sceneId },
      data: { storyboardGroupsJson: nextGroupsJsonGenerating as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
    });
  } catch {
    // ignore
  }

  try {
    await updateProgress({ pct: 5, message: `生成 ${groupId}（${groupEntry.shot_range}）...` });

    const genSystemPrompt = await loadSystemPrompt({ prisma, teamId, key: 'workflow.storyboard.group.system' });
    const userPrompt = buildGroupUserPrompt({
      sceneBible: sceneBibleParsed.data,
      planGroup: { group_id: planGroup.group_id, shot_range: planGroup.shot_range, goal_en: planGroup.goal_en },
      prevEndState,
      cameraMode,
      runningSummary: currentGroupsJson.running_summary ?? null,
    });

    const formatFixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.format_fix.storyboard_group.system',
    });
    const continuityRepairSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.continuity_repair.storyboard_group.system',
    });

    const semanticValidate = (group: StoryboardGroupDraft): ValidationIssue[] => {
      const issues: ValidationIssue[] = [];
      if (group.group_id !== groupId) issues.push({ path: 'group_id', message: `必须为 ${groupId}` });
      if (group.shot_range !== groupEntry.shot_range) {
        issues.push({ path: 'shot_range', message: `必须为 ${groupEntry.shot_range}` });
      }
      issues.push(...validatePanelsBasic(group));
      issues.push(...validateCameraMode(group, cameraMode));

      const endState = group.continuity?.end_state;
      const endParsed = ContinuityStateSchema.safeParse(endState);
      if (!endParsed.success) {
        issues.push({ path: 'continuity.end_state', message: 'end_state 结构不合法' });
      } else {
        issues.push(...validateContinuityCarryOver({ prevEndState, nextEndState: endParsed.data }));
      }
      return issues;
    };

    const out = await generateJsonWithValidation<StoryboardGroupDraft>({
      providerConfig,
      messages: [
        { role: 'system', content: genSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: STORYBOARD_GROUP_RESPONSE_FORMAT,
      parse: (json) => StoryboardGroupDraftSchema.safeParse(json),
      semanticValidate,
      buildRepairMessages: (rawJson, issues) => {
        const shouldFormatFix = issues.some(
          (i) =>
            i.path === '$' ||
            i.path.startsWith('panels') ||
            i.path.startsWith('continuity.end_state'),
        );
        if (shouldFormatFix) {
          return buildFormatFixPrompt({ systemPrompt: formatFixSystemPrompt, raw: rawJson, issues });
        }
        return buildContinuityRepairPrompt({
          systemPrompt: continuityRepairSystemPrompt,
          groupId,
          shotRange: groupEntry.shot_range,
          cameraMode,
          goalEn: planGroup.goal_en,
          prevEndState,
          rawJson,
          issues,
        });
      },
      maxAttempts: 2,
    });

    await updateProgress({ pct: 70, message: '系统渲染 prompt_en/render_json...' });
    const style = styleFullPrompt(project);
    const render = renderPromptEn({
      sceneBible: sceneBibleParsed.data,
      style,
      group: out.json,
      cameraMode,
    });

    const nowIso = new Date().toISOString();
    const persisted = { ...out.json, render, meta: { camera_mode: cameraMode, createdAt: nowIso, updatedAt: nowIso } };

    const nextGroupsJson: StoryboardGroupsJson = {
      ...nextGroupsJsonGenerating,
      groups: nextGroupsJsonGenerating.groups.map((g) =>
        g.group_id === groupId ? { ...g, status: 'ready', group: persisted, last_error: undefined } : g,
      ),
    };

    await updateProgress({ pct: 85, message: '写入数据库...' });
    await prisma.scene.update({
      where: { id: sceneId },
      data: { storyboardGroupsJson: nextGroupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
    });

    await updateProgress({ pct: 100, message: '完成' });
    return { sceneId, groupId, group: persisted, tokenUsage: out.tokenUsage ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      const failedGroupsJson: StoryboardGroupsJson = {
        ...nextGroupsJsonGenerating,
        groups: nextGroupsJsonGenerating.groups.map((g) =>
          g.group_id === groupId ? { ...g, status: 'needs_fix', last_error: message } : g,
        ),
      };
      await prisma.scene.update({
        where: { id: sceneId },
        data: { storyboardGroupsJson: failedGroupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
      });
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function translateStoryboardPanels(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, storyboardGroupsJson: true },
  });
  if (!scene) throw new Error('Scene not found');

  const groupsParsed = StoryboardGroupsJsonSchema.safeParse(scene.storyboardGroupsJson);
  if (!groupsParsed.success) throw new Error('StoryboardGroups missing/invalid; please generate plan & groups first');

  let groupsJson: StoryboardGroupsJson = groupsParsed.data;
  const groups = sortKeyframes(groupsJson.groups);
  if (groups.some((g) => g.status !== 'ready' || !g.group)) {
    throw new Error('Not all storyboard groups are ready; please generate KF0-KF8 first');
  }

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.storyboard.translate_panels.system',
  });

  let tokenUsage: TokenUsage | undefined;

  // Mark translation in progress (best-effort)
  groupsJson = {
    ...groupsJson,
    translation: { ...(groupsJson.translation ?? { status: 'pending' }), status: 'in_progress', last_error: undefined },
  };
  await prisma.scene.update({
    where: { id: sceneId },
    data: { storyboardGroupsJson: groupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
  });

  const TranslateSchema = z.object({
    panels: z.array(z.object({ index: z.number().int().min(1).max(9), zh: z.string() })),
  });

  for (let i = 0; i < groups.length; i += 1) {
    const entry = groups[i];
    if (!entry.group) throw new Error(`Missing group payload for ${entry.group_id}`);
    const panels = entry.group.panels
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ index: p.index, en: p.en }));

    const pct = 5 + Math.floor((i / groups.length) * 70);
    await updateProgress({ pct, message: `翻译 ${entry.group_id}...` });

    const userPrompt = buildTranslateUserPrompt({ groupId: entry.group_id, panels });

    const out = await generateJsonWithValidation<z.infer<typeof TranslateSchema>>({
      providerConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: TRANSLATE_PANELS_RESPONSE_FORMAT,
      parse: (json) => TranslateSchema.safeParse(json),
      buildRepairMessages: (rawJson, issues) => buildFormatFixPrompt({ systemPrompt, raw: rawJson, issues }),
      maxAttempts: 2,
    });
    tokenUsage = mergeTokenUsage(tokenUsage, out.tokenUsage);

    const zhByIndex = new Map(out.json.panels.map((p) => [p.index, p.zh] as const));

    groupsJson = {
      ...groupsJson,
      groups: groupsJson.groups.map((g) => {
        if (g.group_id !== entry.group_id || !g.group) return g;
        const nextPanels = g.group.panels.map((p) => {
          const zh = zhByIndex.get(p.index);
          if (typeof zh !== 'string') return p;
          return { ...p, zh, dirtyZh: false };
        });
        return { ...g, group: { ...g.group, panels: nextPanels } };
      }),
    };

    await prisma.scene.update({
      where: { id: sceneId },
      data: { storyboardGroupsJson: groupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
    });
  }

  groupsJson = {
    ...groupsJson,
    translation: { ...(groupsJson.translation ?? { status: 'pending' }), status: 'completed', last_error: undefined },
  };

  await updateProgress({ pct: 85, message: '写入最终状态...' });
  await prisma.scene.update({
    where: { id: sceneId },
    data: { storyboardGroupsJson: groupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
  });

  await updateProgress({ pct: 100, message: '完成' });
  return { sceneId, storyboardGroups: groupsJson, tokenUsage: tokenUsage ?? null };
}

export async function backTranslateStoryboardPanels(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  sceneId: string;
  aiProfileId: string;
  apiKeySecret: string;
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, sceneId, aiProfileId, apiKeySecret, updateProgress } = args;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId },
    select: { id: true, storyboardGroupsJson: true, storyboardSceneBibleJson: true },
  });
  if (!scene) throw new Error('Scene not found');

  const groupsParsed = StoryboardGroupsJsonSchema.safeParse(scene.storyboardGroupsJson);
  if (!groupsParsed.success) throw new Error('StoryboardGroups missing/invalid');
  let groupsJson: StoryboardGroupsJson = groupsParsed.data;

  const dirtyTargets: Array<{ group_id: string; panels: Array<{ index: number; zh: string }> }> = [];
  for (const g of sortKeyframes(groupsJson.groups)) {
    const gg = g.group as unknown as { panels?: Array<{ index: number; zh?: string; dirtyZh?: boolean }> } | undefined;
    const panels = Array.isArray(gg?.panels) ? gg!.panels : [];
    const dirty = panels
      .filter((p) => p && p.dirtyZh === true && typeof p.zh === 'string' && p.zh.trim())
      .map((p) => ({ index: p.index, zh: p.zh!.trim() }));
    if (dirty.length > 0) dirtyTargets.push({ group_id: g.group_id, panels: dirty });
  }

  if (dirtyTargets.length === 0) {
    await updateProgress({ pct: 100, message: '无 dirty 面板，跳过' });
    return { sceneId, updated: 0, tokenUsage: null };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, style: true, artStyleConfig: true },
  });
  if (!project) throw new Error('Project not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.storyboard.back_translate_panels.system',
  });

  const sceneBibleParsed = SceneBibleSchema.safeParse(scene.storyboardSceneBibleJson);
  if (!sceneBibleParsed.success) throw new Error('SceneBible missing/invalid');

  const style = styleFullPrompt(project);
  const cameraMode = StoryboardCameraModeSchema.catch('B').parse(groupsJson.settings?.camera_mode ?? 'B');

  const BackTranslateSchema = z.object({
    panels: z.array(z.object({ index: z.number().int().min(1).max(9), en: z.string() })),
  });

  let tokenUsage: TokenUsage | undefined;
  let updatedCount = 0;

  for (let i = 0; i < dirtyTargets.length; i += 1) {
    const target = dirtyTargets[i];
    const pct = 5 + Math.floor((i / dirtyTargets.length) * 70);
    await updateProgress({ pct, message: `回译 ${target.group_id}...` });

    const userPrompt = buildBackTranslateUserPrompt({ groupId: target.group_id, panels: target.panels });
    const out = await generateJsonWithValidation<z.infer<typeof BackTranslateSchema>>({
      providerConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: BACK_TRANSLATE_PANELS_RESPONSE_FORMAT,
      parse: (json) => BackTranslateSchema.safeParse(json),
      buildRepairMessages: (rawJson, issues) => buildFormatFixPrompt({ systemPrompt, raw: rawJson, issues }),
      maxAttempts: 2,
    });
    tokenUsage = mergeTokenUsage(tokenUsage, out.tokenUsage);

    const enByIndex = new Map(out.json.panels.map((p) => [p.index, p.en] as const));

    groupsJson = {
      ...groupsJson,
      groups: groupsJson.groups.map((g) => {
        if (g.group_id !== target.group_id || !g.group) return g;
        const nextPanels = g.group.panels.map((p) => {
          const en = enByIndex.get(p.index);
          if (typeof en !== 'string' || !en.trim()) return p;
          updatedCount += 1;
          return { ...p, en: en.trim(), dirtyZh: false };
        });

        const draft = StoryboardGroupDraftSchema.safeParse({ ...g.group, panels: nextPanels });
        if (!draft.success) return { ...g, group: { ...g.group, panels: nextPanels } };

        const render = renderPromptEn({
          sceneBible: sceneBibleParsed.data,
          style,
          group: draft.data,
          cameraMode,
        });

        return {
          ...g,
          group: {
            ...g.group,
            panels: nextPanels,
            render,
            meta: { ...(g.group.meta ?? {}), updatedAt: new Date().toISOString() },
          },
        };
      }),
    };

    await prisma.scene.update({
      where: { id: sceneId },
      data: { storyboardGroupsJson: groupsJson as unknown as Prisma.InputJsonValue } as unknown as Prisma.SceneUpdateInput,
    });
  }

  await updateProgress({ pct: 100, message: '完成' });
  return { sceneId, updated: updatedCount, tokenUsage: tokenUsage ?? null };
}
