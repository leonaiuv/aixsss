import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { ChatMessage, ProviderChatConfig, ResponseFormat } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { parseJsonFromText } from './aiJson.js';
import { mergeTokenUsage, type TokenUsage } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';

const CONTINUOUS_WORD_PATTERNS: RegExp[] = [
  /\b(then|after|before|while|when)\b/i,
  /\b(starts?\s+to|begin(s)?\s+to)\b/i,
  /\b(slowly|gradually|progressively)\b/i,
  /(然后|之后|随后|接着|同时|一边|开始|逐渐|慢慢|渐渐|正在)/,
];

function findForbiddenContinuousWords(text: string): string[] {
  const raw = (text ?? '').trim();
  if (!raw) return [];
  const hit: string[] = [];
  for (const re of CONTINUOUS_WORD_PATTERNS) {
    const m = raw.match(re);
    if (m?.[0]) hit.push(m[0]);
  }
  return Array.from(new Set(hit));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(o[k])}`).join(',')}}`;
}

const BeatCharacterStateSchema = z
  .object({
    character_id: z.string().min(1),
    state: z.record(z.unknown()).optional(),
  })
  .passthrough();

const BeatStateSchema = z
  .object({
    characters: z.array(BeatCharacterStateSchema).default([]),
  })
  .passthrough();

const ContinuityRulesSchema = z
  .object({
    keep_background: z.boolean().optional(),
    keep_camera: z.boolean().optional(),
    screen_direction: z.string().optional(),
    axis_of_action: z.string().optional(),
    props_must_persist: z.array(z.string()).optional(),
    forbidden_changes: z.array(z.string()).optional(),
  })
  .passthrough();

const ActionBeatSchema = z
  .object({
    beat_id: z.string().min(1),
    beat_summary: z.string().min(1),
    beat_intent: z.string().optional(),
    start_state: BeatStateSchema,
    mid_state: BeatStateSchema,
    end_state: BeatStateSchema,
    continuity_rules: ContinuityRulesSchema.optional(),
    keyframe_mode: z.string().optional(),
    keyframe_count: z.number().int().positive().optional(),
  })
  .passthrough();

export const ActionPlanJsonSchema = z
  .object({
    scene_id: z.string().min(1),
    scene_summary: z.string().min(1),
    beats: z.array(ActionBeatSchema).min(1),
  })
  .passthrough();

export type ActionPlanJson = z.infer<typeof ActionPlanJsonSchema>;
export type ActionBeat = z.infer<typeof ActionBeatSchema>;

const FramePropSchema = z
  .object({
    name: z.string().min(1),
    state: z.string().min(0),
  })
  .passthrough();

const FrameHandsSchema = z
  .object({
    left: z.string().optional(),
    right: z.string().optional(),
  })
  .passthrough();

const FrameSubjectSchema = z
  .object({
    character_id: z.string().min(1),
    name: z.string().min(1),
    position_in_frame: z.string().min(1),
    body_orientation: z.string().min(1),
    pose: z.string().min(1),
    action_snapshot: z.string().min(1),
    expression: z.string().min(1),
    gaze: z.string().min(1),
    hands: FrameHandsSchema.optional(),
    props: z.array(FramePropSchema).optional(),
  })
  .passthrough();

const FrameCompositionSchema = z
  .object({
    rule: z.string().optional(),
    focus: z.string().optional(),
    depth_hint: z.string().optional(),
  })
  .passthrough();

const FrameBubbleSpaceSchema = z
  .object({
    need: z.boolean().optional(),
    area: z.string().optional(),
    size: z.string().optional(),
  })
  .passthrough();

export const FrameSpecSchema = z
  .object({
    used_anchors: z.array(z.string().min(1)).min(1),
    subjects: z.array(FrameSubjectSchema).min(1),
    composition: FrameCompositionSchema.optional(),
    bubble_space: FrameBubbleSpaceSchema.optional(),
  })
  .passthrough();

export type FrameSpec = z.infer<typeof FrameSpecSchema>;

const KeyframeCameraSchema = z
  .object({
    shot_size: z.string().optional(),
    angle: z.string().optional(),
    lens_hint: z.string().optional(),
    aspect_ratio: z.string().optional(),
  })
  .passthrough();

export const KeyframeGroupSchema = z
  .object({
    beat_id: z.string().min(1),
    camera: KeyframeCameraSchema.optional(),
    frames: z.object({
      start: z.object({ frame_spec: FrameSpecSchema }),
      mid: z.object({ frame_spec: FrameSpecSchema }),
      end: z.object({ frame_spec: FrameSpecSchema }),
    }),
    negative: z
      .object({
        avoid: z.array(z.string().min(1)).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type KeyframeGroup = z.infer<typeof KeyframeGroupSchema>;

export const KeyframeGroupsJsonSchema = z
  .object({
    scene_id: z.string().min(1),
    groups: z.array(KeyframeGroupSchema).min(1),
  })
  .passthrough();

export type KeyframeGroupsJson = z.infer<typeof KeyframeGroupsJsonSchema>;

function buildJsonSchemaResponseFormat(name: string, schema: Record<string, unknown>): ResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

const ACTION_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['scene_id', 'scene_summary', 'beats'],
  properties: {
    scene_id: { type: 'string' },
    scene_summary: { type: 'string' },
    beats: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['beat_id', 'beat_summary', 'start_state', 'mid_state', 'end_state'],
        properties: {
          beat_id: { type: 'string' },
          beat_summary: { type: 'string' },
          beat_intent: { type: 'string' },
          start_state: { type: 'object', additionalProperties: true },
          mid_state: { type: 'object', additionalProperties: true },
          end_state: { type: 'object', additionalProperties: true },
          continuity_rules: {
            type: 'object',
            additionalProperties: true,
            properties: {
              keep_background: { type: 'boolean' },
              keep_camera: { type: 'boolean' },
              screen_direction: { type: 'string' },
              axis_of_action: { type: 'string' },
              props_must_persist: { type: 'array', items: { type: 'string' } },
              forbidden_changes: { type: 'array', items: { type: 'string' } },
            },
          },
          keyframe_mode: { type: 'string' },
          keyframe_count: { type: 'integer' },
        },
      },
    },
  },
};

const FRAME_SPEC_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  required: ['used_anchors', 'subjects'],
  properties: {
    used_anchors: { type: 'array', minItems: 1, items: { type: 'string' } },
    subjects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: true,
        required: [
          'character_id',
          'name',
          'position_in_frame',
          'body_orientation',
          'pose',
          'action_snapshot',
          'expression',
          'gaze',
        ],
        properties: {
          character_id: { type: 'string' },
          name: { type: 'string' },
          position_in_frame: { type: 'string' },
          body_orientation: { type: 'string' },
          pose: { type: 'string' },
          action_snapshot: { type: 'string' },
          expression: { type: 'string' },
          gaze: { type: 'string' },
          hands: {
            type: 'object',
            additionalProperties: true,
            properties: {
              left: { type: 'string' },
              right: { type: 'string' },
            },
          },
          props: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['name', 'state'],
              properties: {
                name: { type: 'string' },
                state: { type: 'string' },
              },
            },
          },
        },
      },
    },
    composition: {
      type: 'object',
      additionalProperties: true,
      properties: {
        rule: { type: 'string' },
        focus: { type: 'string' },
        depth_hint: { type: 'string' },
      },
    },
    bubble_space: {
      type: 'object',
      additionalProperties: true,
      properties: {
        need: { type: 'boolean' },
        area: { type: 'string' },
        size: { type: 'string' },
      },
    },
  },
};

const KEYFRAME_GROUP_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  required: ['beat_id', 'frames'],
  properties: {
    beat_id: { type: 'string' },
    camera: {
      type: 'object',
      additionalProperties: true,
      properties: {
        shot_size: { type: 'string' },
        angle: { type: 'string' },
        lens_hint: { type: 'string' },
        aspect_ratio: { type: 'string' },
      },
    },
    frames: {
      type: 'object',
      additionalProperties: false,
      required: ['start', 'mid', 'end'],
      properties: {
        start: { type: 'object', additionalProperties: true, required: ['frame_spec'], properties: { frame_spec: FRAME_SPEC_JSON_SCHEMA } },
        mid: { type: 'object', additionalProperties: true, required: ['frame_spec'], properties: { frame_spec: FRAME_SPEC_JSON_SCHEMA } },
        end: { type: 'object', additionalProperties: true, required: ['frame_spec'], properties: { frame_spec: FRAME_SPEC_JSON_SCHEMA } },
      },
    },
    negative: {
      type: 'object',
      additionalProperties: true,
      properties: {
        avoid: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export const ACTION_PLAN_RESPONSE_FORMAT = buildJsonSchemaResponseFormat('action_plan', ACTION_PLAN_JSON_SCHEMA);
export const KEYFRAME_GROUP_RESPONSE_FORMAT = buildJsonSchemaResponseFormat('keyframe_group', KEYFRAME_GROUP_JSON_SCHEMA);
export const FRAME_SPEC_RESPONSE_FORMAT = buildJsonSchemaResponseFormat('frame_spec', FRAME_SPEC_JSON_SCHEMA);

type ValidationIssue = { path: string; message: string };

function zodIssuesToValidationIssues(err: z.ZodError): ValidationIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

function validateActionPlanContinuity(plan: ActionPlanJson): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [i, beat] of plan.beats.entries()) {
    if (seen.has(beat.beat_id)) {
      issues.push({ path: `beats.${i}.beat_id`, message: 'beat_id 重复' });
    }
    seen.add(beat.beat_id);
  }

  for (let i = 0; i < plan.beats.length - 1; i += 1) {
    const a = plan.beats[i];
    const b = plan.beats[i + 1];
    const endChars = Array.isArray(a.end_state.characters) ? a.end_state.characters : [];
    const startChars = Array.isArray(b.start_state.characters) ? b.start_state.characters : [];
    const startById = new Map(startChars.map((c) => [c.character_id, c]));

    for (const c of endChars) {
      const next = startById.get(c.character_id);
      if (!next) continue;
      const aState = asRecord(c.state) ?? {};
      const bState = asRecord(next.state) ?? {};
      for (const key of ['location', 'stance', 'facing', 'props_in_hand']) {
        const av = aState[key];
        const bv = bState[key];
        if (av === undefined || bv === undefined) continue;
        if (stableStringify(av) !== stableStringify(bv)) {
          issues.push({
            path: `beats.${i + 1}.start_state.characters(${c.character_id}).state.${key}`,
            message: `与上一个 beat 的 end_state 不连续（字段 ${key} 不一致）`,
          });
        }
      }
    }
  }

  return issues;
}

type SubjectLike = {
  character_id?: string;
  position_in_frame?: string;
  body_orientation?: string;
  pose?: string;
  action_snapshot?: string;
  expression?: string;
  gaze?: string;
  hands?: { left?: string; right?: string };
  props?: Array<{ name?: string; state?: string }>;
};

function subjectToComparable(subject: SubjectLike): Record<string, unknown> {
  return {
    position_in_frame: subject.position_in_frame ?? '',
    body_orientation: subject.body_orientation ?? '',
    pose: subject.pose ?? '',
    action_snapshot: subject.action_snapshot ?? '',
    expression: subject.expression ?? '',
    gaze: subject.gaze ?? '',
    hands: {
      left: subject.hands?.left ?? '',
      right: subject.hands?.right ?? '',
    },
    props: Array.isArray(subject.props)
      ? subject.props
          .map((p) => ({ name: p.name ?? '', state: p.state ?? '' }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [],
  };
}

function diffScoreFrame(a: FrameSpec, b: FrameSpec): number {
  let score = 0;

  const aById = new Map(a.subjects.map((s) => [s.character_id, s]));
  const bById = new Map(b.subjects.map((s) => [s.character_id, s]));
  const ids = new Set([...aById.keys(), ...bById.keys()]);

  for (const id of ids) {
    const sa = aById.get(id);
    const sb = bById.get(id);
    if (!sa || !sb) {
      score += 2;
      continue;
    }
    const ca = subjectToComparable(sa);
    const cb = subjectToComparable(sb);

    for (const key of Object.keys(ca)) {
      if (stableStringify(ca[key]) !== stableStringify(cb[key])) score += 1;
    }
  }

  return score;
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  for (let i = 0; i < as.length; i += 1) {
    if (as[i] !== bs[i]) return false;
  }
  return true;
}

export function validateKeyframeGroup(group: KeyframeGroup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const start = group.frames.start.frame_spec;
  const mid = group.frames.mid.frame_spec;
  const end = group.frames.end.frame_spec;

  const forbidden = (label: string, frame: FrameSpec) => {
    for (const [idx, s] of frame.subjects.entries()) {
      const hits = findForbiddenContinuousWords(s.action_snapshot);
      if (hits.length) {
        issues.push({
          path: `frames.${label}.frame_spec.subjects.${idx}.action_snapshot`,
          message: `action_snapshot 含连续叙事词：${hits.join(', ')}`,
        });
      }
    }
  };

  forbidden('start', start);
  forbidden('mid', mid);
  forbidden('end', end);

  if (!sameStringSet(start.used_anchors, mid.used_anchors) || !sameStringSet(mid.used_anchors, end.used_anchors)) {
    issues.push({ path: 'frames.*.frame_spec.used_anchors', message: '同一 beat 内 used_anchors 应保持一致' });
  }

  const s1 = diffScoreFrame(start, mid);
  const s2 = diffScoreFrame(mid, end);
  if (s1 < 3) issues.push({ path: 'frames.start->mid', message: `start->mid 可见差异点不足（=${s1}，期望 >=3）` });
  if (s2 < 3) issues.push({ path: 'frames.mid->end', message: `mid->end 可见差异点不足（=${s2}，期望 >=3）` });

  return issues;
}

export function validateContinuity(prevEnd: FrameSpec, nextStart: FrameSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!sameStringSet(prevEnd.used_anchors, nextStart.used_anchors)) {
    issues.push({ path: 'used_anchors', message: 'beat 连接处 used_anchors 不一致（背景疑似跳变）' });
  }

  const prevById = new Map(prevEnd.subjects.map((s) => [s.character_id, s]));
  const nextById = new Map(nextStart.subjects.map((s) => [s.character_id, s]));
  for (const [id, prev] of prevById.entries()) {
    const next = nextById.get(id);
    if (!next) continue;
    const keys: Array<keyof SubjectLike> = ['position_in_frame', 'body_orientation', 'pose'];
    for (const key of keys) {
      const a = prev[key];
      const b = next[key];
      if (a && b && a !== b) {
        issues.push({ path: `subjects(${id}).${key}`, message: `与上一 beat end 不连续（${key} 不一致）` });
      }
    }
    const aHands = prev.hands;
    const bHands = next.hands;
    if (aHands && bHands && stableStringify(aHands) !== stableStringify(bHands)) {
      issues.push({ path: `subjects(${id}).hands`, message: '与上一 beat end 不连续（hands 不一致）' });
    }
    const aProps = prev.props ?? [];
    const bProps = next.props ?? [];
    if (aProps.length || bProps.length) {
      const norm = (arr: Array<{ name: string; state: string }>) =>
        arr
          .map((p) => ({ name: p.name, state: p.state }))
          .sort((x, y) => x.name.localeCompare(y.name));
      if (stableStringify(norm(aProps)) !== stableStringify(norm(bProps))) {
        issues.push({ path: `subjects(${id}).props`, message: '与上一 beat end 不连续（props 不一致）' });
      }
    }
  }

  return issues;
}

function formatIssuesForPrompt(issues: ValidationIssue[]): string {
  if (!issues.length) return '- (none)';
  return issues.map((i) => `- ${i.path}: ${i.message}`).join('\n');
}

function buildActionPlanPrompt(args: {
  systemPrompt: string;
  sceneId: string;
  sceneSummary: string;
  prevSceneSummary?: string;
  cast: Array<{ id: string; name: string }>;
  sceneAnchorJson: string;
  styleFullPrompt: string;
}): ChatMessage[] {
  const user = [
    `scene_id: ${args.sceneId}`,
    `scene_summary: ${args.sceneSummary || '-'}`,
    `previous_scene_summary: ${args.prevSceneSummary || '-'}`,
    '',
    'cast（角色 id + name）：',
    args.cast.length ? args.cast.map((c) => `- ${c.id}: ${c.name}`).join('\n') : '- (none)',
    '',
    'scene_anchor_json（环境锚点 JSON，保持背景一致）：',
    args.sceneAnchorJson || '-',
    '',
    'global_style_meta（风格约束背景）：',
    args.styleFullPrompt || '-',
    '',
    '输出要求：',
    '- beats 可以为 1..N（按动作点拆）。',
    '- 每个 beat 的 keyframe_mode 固定为 start_mid_end，keyframe_count=3。',
  ].join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildActionPlanRepairPrompt(args: {
  systemPrompt: string;
  rawJson: string;
  issues: ValidationIssue[];
}): ChatMessage[] {
  const user = [
    '下面 JSON 未通过校验，请修复：',
    '',
    '校验错误：',
    formatIssuesForPrompt(args.issues),
    '',
    '原始 JSON：',
    args.rawJson,
  ].join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildKeyframeGroupPrompt(args: {
  systemPrompt: string;
  sceneAnchorJson: string;
  styleFullPrompt: string;
  cast: Array<{ id: string; name: string }>;
  beat: ActionBeat;
  prevEndFrameSpec?: FrameSpec | null;
}): ChatMessage[] {
  const user = [
    'beat_summary:',
    args.beat.beat_summary,
    '',
    'beat_intent:',
    args.beat.beat_intent || '-',
    '',
    'beat.start_state（必须满足）：',
    JSON.stringify(args.beat.start_state, null, 2),
    '',
    'beat.mid_state（必须满足）：',
    JSON.stringify(args.beat.mid_state, null, 2),
    '',
    'beat.end_state（必须满足）：',
    JSON.stringify(args.beat.end_state, null, 2),
    '',
    'continuity_rules:',
    JSON.stringify(args.beat.continuity_rules ?? {}, null, 2),
    '',
    args.prevEndFrameSpec
      ? [
          'prev_end_frame_spec（用于承接上一 beat 的 end，next start 必须能接上）：',
          JSON.stringify(args.prevEndFrameSpec, null, 2),
          '',
        ].join('\n')
      : '',
    'scene_anchor_json（环境锚点 JSON）：',
    args.sceneAnchorJson || '-',
    '',
    'cast（角色 id + name）：',
    args.cast.length ? args.cast.map((c) => `- ${c.id}: ${c.name}`).join('\n') : '- (none)',
    '',
    'global_style_meta（风格约束背景）：',
    args.styleFullPrompt || '-',
    '',
    '输出要求：',
    '- frames.start/mid/end 的 frame_spec.action_snapshot 必须是“瞬间定格”，不写过程。',
    '- used_anchors 必须从 scene_anchor_json.anchors 中选 2-4 个（不要重新发明锚点名）。',
    '- negative.avoid 给出避免项（如新增人物/水印/文字/logo/背景突变）。',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildKeyframeGroupRepairPrompt(args: {
  systemPrompt: string;
  rawJson: string;
  issues: ValidationIssue[];
}): ChatMessage[] {
  const user = [
    '下面 JSON 未通过校验，请修复：',
    '',
    '校验错误：',
    formatIssuesForPrompt(args.issues),
    '',
    '原始 JSON：',
    args.rawJson,
  ].join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildContinuityRepairPrompt(args: {
  systemPrompt: string;
  prevEnd: FrameSpec;
  nextStart: FrameSpec;
  beatSummary: string;
}): ChatMessage[] {
  const user = [
    'beat_summary:',
    args.beatSummary,
    '',
    'prev_end_frame_spec:',
    JSON.stringify(args.prevEnd, null, 2),
    '',
    'next_start_frame_spec（需要修复）：',
    JSON.stringify(args.nextStart, null, 2),
  ].join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

function buildContinuityRepairRepairPrompt(args: {
  systemPrompt: string;
  prevEnd: FrameSpec;
  nextStart: FrameSpec;
  beatSummary: string;
  rawJson: string;
  issues: ValidationIssue[];
}): ChatMessage[] {
  const user = [
    '下面输出未通过校验，请修复并只输出 JSON：',
    '',
    'beat_summary:',
    args.beatSummary,
    '',
    'prev_end_frame_spec:',
    JSON.stringify(args.prevEnd, null, 2),
    '',
    'next_start_frame_spec（目标修复）：',
    JSON.stringify(args.nextStart, null, 2),
    '',
    '校验错误：',
    formatIssuesForPrompt(args.issues),
    '',
    '上一轮输出（供参考，可忽略）：',
    args.rawJson,
  ].join('\n');

  return [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: user },
  ];
}

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
      lastIssues = zodIssuesToValidationIssues(typed.error);
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
      args.responseFormat ? { ...args.providerConfig, responseFormat: args.responseFormat } : args.providerConfig,
      repairMessages,
    );
    tokenUsage = mergeTokenUsage(tokenUsage, repairRes.tokenUsage);

    try {
      const repaired = parseJsonFromText(repairRes.content, { expectedKind: 'object' });
      lastExtracted = repaired.extractedJson;
      const repairedTyped = args.parse(repaired.json);
      if (!repairedTyped.success) {
        lastIssues = zodIssuesToValidationIssues(repairedTyped.error);
        continue;
      }
      const semIssues = args.semanticValidate ? args.semanticValidate(repairedTyped.data) : [];
      lastIssues = semIssues;
      if (semIssues.length === 0) {
        return {
          json: repairedTyped.data,
          extractedJson: lastExtracted,
          tokenUsage,
          attempts: attempt + 1,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastExtracted = (repairRes.content ?? '').trim();
      lastIssues = [{ path: '$', message: `JSON 解析失败：${message}` }];
    }
  }

  const summary = lastIssues.length ? `\n${formatIssuesForPrompt(lastIssues)}` : '';
  throw new Error(`结构化 JSON 生成失败（多次修复仍未通过校验）${summary}`);
}

export async function generateActionPlanJson(args: {
  prisma: PrismaClient;
  teamId: string;
  providerConfig: ProviderChatConfig;
  sceneId: string;
  sceneSummary: string;
  prevSceneSummary?: string;
  cast: Array<{ id: string; name: string }>;
  sceneAnchorJson: string;
  styleFullPrompt: string;
  systemPrompt?: string;
  repairSystemPrompt?: string;
}): Promise<{ plan: ActionPlanJson; tokenUsage?: TokenUsage }> {
  const systemPrompt =
    args.systemPrompt ??
    (await loadSystemPrompt({
      prisma: args.prisma,
      teamId: args.teamId,
      key: 'workflow.action_beats.action_plan.system',
    }));
  const repairSystemPrompt =
    args.repairSystemPrompt ??
    (await loadSystemPrompt({
      prisma: args.prisma,
      teamId: args.teamId,
      key: 'workflow.action_beats.action_plan.repair.system',
    }));

  const messages = buildActionPlanPrompt({ ...args, systemPrompt });

  const out = await generateJsonWithValidation<ActionPlanJson>({
    providerConfig: args.providerConfig,
    messages,
    responseFormat: ACTION_PLAN_RESPONSE_FORMAT,
    parse: (json) => ActionPlanJsonSchema.safeParse(json),
    semanticValidate: validateActionPlanContinuity,
    buildRepairMessages: (rawJson, issues) =>
      buildActionPlanRepairPrompt({ systemPrompt: repairSystemPrompt, rawJson, issues }),
    maxAttempts: 2,
  });

  return { plan: out.json, tokenUsage: out.tokenUsage };
}

export async function generateKeyframeGroupJson(args: {
  prisma: PrismaClient;
  teamId: string;
  providerConfig: ProviderChatConfig;
  sceneAnchorJson: string;
  styleFullPrompt: string;
  cast: Array<{ id: string; name: string }>;
  beat: ActionBeat;
  prevEndFrameSpec?: FrameSpec | null;
  systemPrompt?: string;
  repairSystemPrompt?: string;
}): Promise<{ group: KeyframeGroup; tokenUsage?: TokenUsage }> {
  const systemPrompt =
    args.systemPrompt ??
    (await loadSystemPrompt({
      prisma: args.prisma,
      teamId: args.teamId,
      key: 'workflow.action_beats.keyframe_group.system',
    }));
  const repairSystemPrompt =
    args.repairSystemPrompt ??
    (await loadSystemPrompt({
      prisma: args.prisma,
      teamId: args.teamId,
      key: 'workflow.action_beats.keyframe_group.repair.system',
    }));

  const messages = buildKeyframeGroupPrompt({ ...args, systemPrompt });

  const out = await generateJsonWithValidation<KeyframeGroup>({
    providerConfig: args.providerConfig,
    messages,
    responseFormat: KEYFRAME_GROUP_RESPONSE_FORMAT,
    parse: (json) => KeyframeGroupSchema.safeParse(json),
    semanticValidate: validateKeyframeGroup,
    buildRepairMessages: (rawJson, issues) =>
      buildKeyframeGroupRepairPrompt({ systemPrompt: repairSystemPrompt, rawJson, issues }),
    maxAttempts: 2,
  });

  return { group: out.json, tokenUsage: out.tokenUsage };
}

function validateCameraContinuity(prev: KeyframeGroup, next: KeyframeGroup): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const a = prev.camera ?? {};
  const b = next.camera ?? {};
  const keys: Array<keyof NonNullable<KeyframeGroup['camera']>> = [
    'shot_size',
    'angle',
    'lens_hint',
    'aspect_ratio',
  ];
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (!av || !bv) continue;
    if (av !== bv) issues.push({ path: `camera.${key}`, message: `与上一 beat 的 camera 不一致（${av} != ${bv}）` });
  }
  return issues;
}

export async function generateKeyframeGroupsJson(args: {
  prisma: PrismaClient;
  teamId: string;
  providerConfig: ProviderChatConfig;
  sceneId: string;
  sceneAnchorJson: string;
  styleFullPrompt: string;
  cast: Array<{ id: string; name: string }>;
  beats: ActionBeat[];
}): Promise<{ keyframeGroups: KeyframeGroupsJson; tokenUsage?: TokenUsage }> {
  const keyframeGroupSystemPrompt = await loadSystemPrompt({
    prisma: args.prisma,
    teamId: args.teamId,
    key: 'workflow.action_beats.keyframe_group.system',
  });
  const keyframeGroupRepairSystemPrompt = await loadSystemPrompt({
    prisma: args.prisma,
    teamId: args.teamId,
    key: 'workflow.action_beats.keyframe_group.repair.system',
  });
  const continuityRepairSystemPrompt = await loadSystemPrompt({
    prisma: args.prisma,
    teamId: args.teamId,
    key: 'workflow.action_beats.continuity_repair.system',
  });

  const groups: KeyframeGroup[] = [];
  let tokenUsage: TokenUsage | undefined;
  let prevEnd: FrameSpec | null = null;
  let prevGroup: KeyframeGroup | null = null;

  for (const beat of args.beats) {
    const res = await generateKeyframeGroupJson({
      prisma: args.prisma,
      teamId: args.teamId,
      providerConfig: args.providerConfig,
      sceneAnchorJson: args.sceneAnchorJson,
      styleFullPrompt: args.styleFullPrompt,
      cast: args.cast,
      beat,
      prevEndFrameSpec: prevEnd,
      systemPrompt: keyframeGroupSystemPrompt,
      repairSystemPrompt: keyframeGroupRepairSystemPrompt,
    });
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage);

    const group: KeyframeGroup = {
      ...res.group,
      beat_id: beat.beat_id || res.group.beat_id,
    };

    if (prevGroup) {
      const camIssues = validateCameraContinuity(prevGroup, group);
      if (camIssues.length) {
        const repaired = await generateJsonWithValidation<KeyframeGroup>({
          providerConfig: args.providerConfig,
          messages: buildKeyframeGroupRepairPrompt({
            systemPrompt: keyframeGroupRepairSystemPrompt,
            rawJson: JSON.stringify(group, null, 2),
            issues: camIssues,
          }),
          responseFormat: KEYFRAME_GROUP_RESPONSE_FORMAT,
          parse: (json) => KeyframeGroupSchema.safeParse(json),
          semanticValidate: validateKeyframeGroup,
          buildRepairMessages: (rawJson, issues) =>
            buildKeyframeGroupRepairPrompt({ systemPrompt: keyframeGroupRepairSystemPrompt, rawJson, issues }),
          maxAttempts: 2,
        });
        tokenUsage = mergeTokenUsage(tokenUsage, repaired.tokenUsage);
        Object.assign(group, repaired.json, { beat_id: group.beat_id });
      }
    }

    if (prevEnd) {
      const continuityIssues = validateContinuity(prevEnd, group.frames.start.frame_spec);
      if (continuityIssues.length) {
        const repaired = await repairContinuityJson({
          prisma: args.prisma,
          teamId: args.teamId,
          providerConfig: args.providerConfig,
          prevEnd,
          nextStart: group.frames.start.frame_spec,
          beatSummary: beat.beat_summary,
          systemPrompt: continuityRepairSystemPrompt,
        });
        tokenUsage = mergeTokenUsage(tokenUsage, repaired.tokenUsage);
        group.frames.start.frame_spec = repaired.frameSpec;
      }

      const still = validateContinuity(prevEnd, group.frames.start.frame_spec);
      if (still.length) {
        throw new Error(`连续性修复失败：\n${formatIssuesForPrompt(still)}`);
      }
    }

    const semIssues = validateKeyframeGroup(group);
    if (semIssues.length) {
      const repaired = await generateJsonWithValidation<KeyframeGroup>({
        providerConfig: args.providerConfig,
        messages: buildKeyframeGroupRepairPrompt({
          systemPrompt: keyframeGroupRepairSystemPrompt,
          rawJson: JSON.stringify(group, null, 2),
          issues: semIssues,
        }),
        responseFormat: KEYFRAME_GROUP_RESPONSE_FORMAT,
        parse: (json) => KeyframeGroupSchema.safeParse(json),
        semanticValidate: validateKeyframeGroup,
        buildRepairMessages: (rawJson, issues) =>
          buildKeyframeGroupRepairPrompt({ systemPrompt: keyframeGroupRepairSystemPrompt, rawJson, issues }),
        maxAttempts: 2,
      });
      tokenUsage = mergeTokenUsage(tokenUsage, repaired.tokenUsage);
      groups.push({ ...repaired.json, beat_id: group.beat_id });
      prevEnd = repaired.json.frames.end.frame_spec;
      prevGroup = repaired.json;
      continue;
    }

    groups.push(group);
    prevEnd = group.frames.end.frame_spec;
    prevGroup = group;
  }

  const keyframeGroups: KeyframeGroupsJson = { scene_id: args.sceneId, groups };
  const parsed = KeyframeGroupsJsonSchema.safeParse(keyframeGroups);
  if (!parsed.success) {
    const issues = zodIssuesToValidationIssues(parsed.error);
    throw new Error(`KeyframeGroupsJson 校验失败：\n${formatIssuesForPrompt(issues)}`);
  }

  return { keyframeGroups, tokenUsage };
}

export async function repairContinuityJson(args: {
  prisma: PrismaClient;
  teamId: string;
  providerConfig: ProviderChatConfig;
  prevEnd: FrameSpec;
  nextStart: FrameSpec;
  beatSummary: string;
  systemPrompt?: string;
}): Promise<{ frameSpec: FrameSpec; tokenUsage?: TokenUsage }> {
  const systemPrompt =
    args.systemPrompt ??
    (await loadSystemPrompt({
      prisma: args.prisma,
      teamId: args.teamId,
      key: 'workflow.action_beats.continuity_repair.system',
    }));
  const messages = buildContinuityRepairPrompt({ ...args, systemPrompt });
  const out = await generateJsonWithValidation<FrameSpec>({
    providerConfig: args.providerConfig,
    messages,
    responseFormat: FRAME_SPEC_RESPONSE_FORMAT,
    parse: (json) => FrameSpecSchema.safeParse(json),
    semanticValidate: (frame) => {
      const issues: ValidationIssue[] = [];
      for (const [idx, s] of frame.subjects.entries()) {
        const hits = findForbiddenContinuousWords(s.action_snapshot);
        if (hits.length) {
          issues.push({
            path: `subjects.${idx}.action_snapshot`,
            message: `action_snapshot 含连续叙事词：${hits.join(', ')}`,
          });
        }
      }
      return issues;
    },
    buildRepairMessages: (rawJson, issues) =>
      buildContinuityRepairRepairPrompt({
        systemPrompt,
        prevEnd: args.prevEnd,
        nextStart: args.nextStart,
        beatSummary: args.beatSummary,
        rawJson,
        issues,
      }),
    maxAttempts: 2,
  });
  return { frameSpec: out.json, tokenUsage: out.tokenUsage };
}

type LegacyKeyframeLocaleBlock = {
  subjects?: Array<{
    name?: string;
    position?: string;
    pose?: string;
    action?: string;
    expression?: string;
    gaze?: string;
    interaction?: string;
  }>;
  usedAnchors?: string[];
  composition?: string;
  bubbleSpace?: string;
};

type LegacyKeyframeJsonData = {
  camera?: {
    type?: string;
    angle?: string;
    aspectRatio?: string;
  };
  keyframes?: Record<string, { zh?: LegacyKeyframeLocaleBlock; en?: LegacyKeyframeLocaleBlock } | undefined>;
  avoid?: { zh?: string; en?: string };
};

function buildLegacyComposition(frame: FrameSpec): string | undefined {
  const c = frame.composition;
  if (!c) return undefined;
  const parts = [c.rule, c.focus, c.depth_hint].filter(Boolean);
  return parts.length ? parts.join(' / ') : undefined;
}

function buildLegacyBubbleSpace(frame: FrameSpec): string | undefined {
  const b = frame.bubble_space;
  if (!b) return undefined;
  if (b.need === false) return 'none';
  const parts = [b.area, b.size].filter(Boolean);
  return parts.length ? parts.join(' / ') : undefined;
}

function buildLegacyInteraction(subject: FrameSpec['subjects'][number]): string | undefined {
  const parts: string[] = [];
  if (subject.hands) {
    if (subject.hands.left) parts.push(`left_hand=${subject.hands.left}`);
    if (subject.hands.right) parts.push(`right_hand=${subject.hands.right}`);
  }
  if (Array.isArray(subject.props) && subject.props.length) {
    parts.push(
      `props=${subject.props
        .map((p) => `${p.name}:${p.state}`)
        .filter(Boolean)
        .join(',')}`,
    );
  }
  return parts.length ? parts.join(' ; ') : undefined;
}

function frameSpecToLegacyBlock(frame: FrameSpec): LegacyKeyframeLocaleBlock {
  return {
    subjects: frame.subjects.map((s) => ({
      name: s.name,
      position: s.position_in_frame,
      pose: s.pose,
      action: s.action_snapshot,
      expression: s.expression,
      gaze: s.gaze,
      interaction: buildLegacyInteraction(s),
    })),
    usedAnchors: frame.used_anchors,
    composition: buildLegacyComposition(frame),
    bubbleSpace: buildLegacyBubbleSpace(frame),
  };
}

export function keyframeGroupToLegacyShotPrompt(group: KeyframeGroup): string {
  const start = group.frames.start.frame_spec;
  const mid = group.frames.mid.frame_spec;
  const end = group.frames.end.frame_spec;
  const avoidText = group.negative?.avoid?.length ? group.negative.avoid.join('; ') : '';

  const data: LegacyKeyframeJsonData = {
    camera: {
      type: group.camera?.shot_size,
      angle: group.camera?.angle,
      aspectRatio: group.camera?.aspect_ratio,
    },
    keyframes: {
      KF0: { zh: frameSpecToLegacyBlock(start), en: frameSpecToLegacyBlock(start) },
      KF1: { zh: frameSpecToLegacyBlock(mid), en: frameSpecToLegacyBlock(mid) },
      KF2: { zh: frameSpecToLegacyBlock(end), en: frameSpecToLegacyBlock(end) },
    },
    avoid: { zh: avoidText, en: avoidText },
  };

  return JSON.stringify(data, null, 2);
}

export function keyframeGroupsToLegacyShotPrompt(groups: KeyframeGroup[], options?: { maxGroups?: number }): string {
  const maxGroups = Math.max(1, Math.min(3, options?.maxGroups ?? 3));
  const selected = (groups ?? []).slice(0, maxGroups);

  if (selected.length < maxGroups) {
    throw new Error(`Expected at least ${maxGroups} keyframe groups, got ${selected.length}`);
  }

  const avoidList = selected.flatMap((g) => g.negative?.avoid ?? []).filter(Boolean);
  const avoidText = Array.from(new Set(avoidList)).join('; ');

  const keyframes: NonNullable<LegacyKeyframeJsonData['keyframes']> = {};
  let idx = 0;

  for (const group of selected) {
    const start = group.frames.start.frame_spec;
    const mid = group.frames.mid.frame_spec;
    const end = group.frames.end.frame_spec;

    const pushFrame = (frame: FrameSpec) => {
      const key = `KF${idx}`;
      keyframes[key] = { zh: frameSpecToLegacyBlock(frame), en: frameSpecToLegacyBlock(frame) };
      idx += 1;
    };

    pushFrame(start);
    pushFrame(mid);
    pushFrame(end);
  }

  const first = selected[0];

  const data: LegacyKeyframeJsonData = {
    camera: {
      type: first.camera?.shot_size,
      angle: first.camera?.angle,
      aspectRatio: first.camera?.aspect_ratio,
    },
    keyframes,
    avoid: { zh: avoidText, en: avoidText },
  };

  return JSON.stringify(data, null, 2);
}
