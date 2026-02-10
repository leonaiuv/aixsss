import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { runJsonToolLoop } from '../agents/runtime/jsonToolLoop.js';
import {
  getAgentMaxSteps,
  getAgentStepTimeoutMs,
  getAgentTotalTimeoutMs,
  isAgentFallbackToLegacyEnabled,
  isAgentNarrativePhase34Enabled,
} from '../agents/runtime/featureFlags.js';
import { randomUUID } from 'node:crypto';
import { mergeTokenUsage, toProviderChatConfig, styleFullPrompt, isRecord } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';
import {
  NarrativeCausalChainSchema,
  Phase1ConflictEngineSchema,
  Phase2InfoLayersSchema,
  Phase3BeatFlowSchema,
  Phase4PlotLinesSchema,
  NARRATIVE_CAUSAL_CHAIN_VERSION,
  type NarrativeCausalChain,
  type Phase1ConflictEngine,
  type Phase2InfoLayers,
  type Phase3BeatFlow,
  type Phase4PlotLines,
} from '@aixsss/shared';
import { parseJsonFromText } from './aiJson.js';

// ===================== 格式化函数 =====================

const MAX_CHAIN_VERSIONS_PER_PROJECT = 50;

function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

function schemaPhase1ConflictEngine(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['outlineSummary', 'conflictEngine'],
    properties: {
      outlineSummary: { type: 'string' },
      conflictEngine: {
        type: 'object',
        additionalProperties: false,
        required: ['coreObjectOrEvent', 'stakesByFaction', 'necessityDerivation'],
        properties: {
          coreObjectOrEvent: { type: 'string' },
          stakesByFaction: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          firstMover: {
            type: 'object',
            additionalProperties: false,
            required: ['initiator', 'publicReason', 'hiddenIntent', 'legitimacyMask'],
            properties: {
              initiator: { type: 'string' },
              publicReason: { type: 'string' },
              hiddenIntent: { type: 'string' },
              legitimacyMask: { type: 'string' },
            },
          },
          necessityDerivation: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  };
}

function schemaPhase2InfoLayers(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['infoVisibilityLayers', 'characterMatrix'],
    properties: {
      infoVisibilityLayers: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['layerName', 'roles', 'infoBoundary', 'blindSpot', 'motivation'],
          properties: {
            layerName: { type: 'string' },
            roles: { type: 'array', items: { type: 'string' } },
            infoBoundary: { type: 'string' },
            blindSpot: { type: 'string' },
            motivation: {
              type: 'object',
              additionalProperties: false,
              required: ['gain', 'lossAvoid', 'activationTrigger'],
              properties: {
                gain: { type: 'integer', minimum: 1, maximum: 10 },
                lossAvoid: { type: 'integer', minimum: 1, maximum: 10 },
                activationTrigger: { type: 'string' },
              },
            },
          },
        },
      },
      characterMatrix: {
        type: 'array',
        minItems: 1,
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'identity', 'goal', 'secret', 'vulnerability'],
          properties: {
            name: { type: 'string' },
            identity: { type: 'string' },
            goal: { type: 'string' },
            secret: { type: 'string' },
            vulnerability: { type: 'string' },
          },
        },
      },
    },
  };
}

function schemaPhase3Outline(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['beatFlow'],
    properties: {
      beatFlow: {
        type: 'object',
        additionalProperties: false,
        required: ['actMode', 'acts'],
        properties: {
          actMode: { type: 'string', enum: ['three_act', 'four_act'] },
          acts: {
            type: 'array',
            minItems: 3,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['act', 'actName', 'beats'],
              properties: {
                act: { type: 'integer', minimum: 1, maximum: 4 },
                actName: { type: 'string', minLength: 1 },
                beats: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 5,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['beatName', 'escalation', 'interlock'],
                    properties: {
                      beatName: { type: 'string', minLength: 1 },
                      escalation: { type: 'integer', minimum: 1, maximum: 10 },
                      interlock: { type: 'string', minLength: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function schemaPhase3ActDetail(args: { actMode: 'three_act' | 'four_act'; act: number; beatNames: string[] }): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['beatFlow'],
    properties: {
      beatFlow: {
        type: 'object',
        additionalProperties: false,
        required: ['actMode', 'acts'],
        properties: {
          actMode: { type: 'string', const: args.actMode },
          acts: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['act', 'actName', 'beats'],
              properties: {
                act: { type: 'integer', const: args.act },
                actName: { type: 'string', minLength: 1 },
                beats: {
                  type: 'array',
                  minItems: args.beatNames.length,
                  maxItems: args.beatNames.length,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                      'beatName',
                      'surfaceEvent',
                      'infoFlow',
                      'escalation',
                      'interlock',
                      'location',
                      'characters',
                      'visualHook',
                      'emotionalTone',
                      'estimatedScenes',
                    ],
                    properties: {
                      beatName: { type: 'string', enum: args.beatNames },
                      surfaceEvent: { type: 'string', minLength: 1 },
                      infoFlow: { type: 'string', minLength: 1 },
                      escalation: { type: 'integer', minimum: 1, maximum: 10 },
                      interlock: { type: 'string', minLength: 1 },
                      location: { type: 'string', minLength: 1 },
                      characters: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
                      visualHook: { type: 'string', minLength: 1 },
                      emotionalTone: { type: 'string', minLength: 1 },
                      estimatedScenes: { type: 'integer', minimum: 1, maximum: 10 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function schemaPhase4PlotLines(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['plotLines', 'consistencyChecks'],
    properties: {
      plotLines: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['lineType', 'driver', 'statedGoal', 'trueGoal', 'keyInterlocks', 'pointOfNoReturn'],
          properties: {
            lineType: { type: 'string', enum: ['main', 'sub1', 'sub2', 'sub3'] },
            driver: { type: 'string' },
            statedGoal: { type: 'string' },
            trueGoal: { type: 'string' },
            keyInterlocks: { type: 'array', items: { type: 'string' } },
            pointOfNoReturn: { type: 'string' },
          },
        },
      },
      consistencyChecks: {
        type: 'object',
        additionalProperties: false,
        required: [
          'blindSpotDrivesAction',
          'infoFlowChangesAtLeastTwo',
          'coreConflictHasThreeWayTension',
          'endingIrreversibleTriggeredByMultiLines',
          'noRedundantRole',
          'notes',
        ],
        properties: {
          blindSpotDrivesAction: { type: 'boolean' },
          infoFlowChangesAtLeastTwo: { type: 'boolean' },
          coreConflictHasThreeWayTension: { type: 'boolean' },
          endingIrreversibleTriggeredByMultiLines: { type: 'boolean' },
          noRedundantRole: { type: 'boolean' },
          notes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  };
}

async function tryCreateNarrativeCausalChainVersion(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  source: 'ai' | 'manual' | 'restore';
  phase: number | null;
  label: string | null;
  note: string | null;
  basedOnVersionId: string | null;
  chain: unknown;
}) {
  const { prisma, teamId, projectId } = args;

  // 单测/某些 mock prisma 可能没有 $executeRaw：此功能为 best-effort，不应影响主流程
  if (typeof (prisma as unknown as { $executeRaw?: unknown }).$executeRaw !== 'function') return;

  const id = randomUUID();

  const chainObj = args.chain as Record<string, unknown> | null;
  const completedPhase = chainObj && typeof chainObj.completedPhase === 'number' ? chainObj.completedPhase : null;
  const validationStatus =
    chainObj && typeof chainObj.validationStatus === 'string' ? chainObj.validationStatus : null;
  const chainSchemaVersion = chainObj && typeof chainObj.version === 'string' ? chainObj.version : null;

  try {
    const chainJson = JSON.stringify(args.chain ?? null);
    await prisma.$executeRaw`
      INSERT INTO "NarrativeCausalChainVersion" (
        "id",
        "teamId",
        "projectId",
        "userId",
        "source",
        "phase",
        "completedPhase",
        "validationStatus",
        "chainSchemaVersion",
        "label",
        "note",
        "basedOnVersionId",
        "chain"
      ) VALUES (
        ${id},
        ${teamId},
        ${projectId},
        ${null},
        ${args.source}::"NarrativeCausalChainVersionSource",
        ${args.phase},
        ${completedPhase},
        ${validationStatus},
        ${chainSchemaVersion},
        ${args.label},
        ${args.note},
        ${args.basedOnVersionId},
        ${chainJson}::jsonb
      )
    `;

    // 裁剪旧版本（best-effort）
    await prisma.$executeRaw`
      DELETE FROM "NarrativeCausalChainVersion"
      WHERE "teamId" = ${teamId}
        AND "projectId" = ${projectId}
        AND "id" IN (
          SELECT "id"
          FROM "NarrativeCausalChainVersion"
          WHERE "teamId" = ${teamId} AND "projectId" = ${projectId}
          ORDER BY "createdAt" DESC
          OFFSET ${MAX_CHAIN_VERSIONS_PER_PROJECT}
        )
    `;
  } catch (err) {
    // 兼容：未迁移数据库时不阻断主流程
    try {
      console.warn('[worker] NarrativeCausalChainVersion insert failed (maybe not migrated):', err);
    } catch {
      // ignore
    }
  }
}

function formatWorldView(items: Array<{ type: string; title: string; content: string; order: number }>): string {
  if (items.length === 0) return '-';
  return items
    .map((it) => `- (${it.order}) [${it.type}] ${it.title}: ${String(it.content ?? '').slice(0, 400)}`)
    .join('\n');
}

function formatCharacters(
  items: Array<{ name: string; appearance: string; personality: string; background: string }>,
): string {
  if (items.length === 0) return '-';
  return items
    .map((c) => {
      const parts = [
        c.appearance ? `外观: ${c.appearance}` : '',
        c.personality ? `性格: ${c.personality}` : '',
        c.background ? `背景: ${c.background}` : '',
      ].filter(Boolean);
      return `- ${c.name}${parts.length ? `（${parts.join('；').slice(0, 600)}）` : ''}`;
    })
    .join('\n');
}

function summarizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const compact = message.replace(/\s+/g, ' ').trim();
  return compact.length > 220 ? `${compact.slice(0, 220)}…` : compact;
}

function previewLLMOutput(text: string, maxChars = 5000): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  if (raw.length <= maxChars) return raw;
  const headLen = Math.max(800, Math.floor(maxChars * 0.6));
  const tailLen = Math.max(800, maxChars - headLen);
  const head = raw.slice(0, headLen);
  const tail = raw.slice(-tailLen);
  return `${head}\n\n...TRUNCATED...\n\n${tail}`.trim();
}

function summarizeAgentSteps(trace: unknown): Array<{ index: number; kind: string; summary: string }> {
  if (!isRecord(trace) || !Array.isArray(trace.steps)) return [];
  return trace.steps
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, idx) => {
      const kind = typeof item.kind === 'string' ? item.kind : 'unknown';
      const toolName =
        isRecord(item.toolCall) && typeof item.toolCall.name === 'string'
          ? item.toolCall.name
          : null;
      return {
        index: typeof item.index === 'number' ? item.index : idx + 1,
        kind,
        summary: toolName ? `${kind}:${toolName}` : kind,
      };
    });
}

// ===================== 阶段1：核心冲突引擎 =====================

function buildPhase1UserPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
}): string {
  return [
    '输入设定：',
    `- 故事梗概：${args.storySynopsis}`,
    `- 画风：${args.artStyle}`,
    `- 世界观：${args.worldView}`,
    `- 角色库：${args.characters}`,
  ].join('\n');
}

function parsePhase1(raw: string): { parsed: Phase1ConflictEngine; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase1ConflictEngineSchema.parse(json), extractedJson };
}

// ===================== 阶段2：信息能见度层 + 角色矩阵 =====================

function buildPhase2UserPrompt(args: {
  storySynopsis: string;
  characters: string;
  phase1: Phase1ConflictEngine;
}): string {
  return [
    '阶段1结果：',
    `- 故事大纲：${args.phase1.outlineSummary}`,
    `- 核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}`,
    `- 各方利害：${JSON.stringify(args.phase1.conflictEngine.stakesByFaction)}`,
    '',
    '故事梗概：',
    args.storySynopsis || '-',
    '',
    '角色库：',
    args.characters || '-',
  ].join('\n');
}

function parsePhase2(raw: string): { parsed: Phase2InfoLayers; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase2InfoLayersSchema.parse(json), extractedJson };
}

// ===================== 阶段3（增量版）：3A 目录 + 3B 按幕补全 =====================

type BeatOutline = { beatName: string; escalation?: number | null; interlock?: string | null };
type ActOutline = { act: number; actName?: string | null; beats: BeatOutline[] };

function buildPhase3OutlineUserPrompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
}): string {
  const layerNames = (args.phase2.infoVisibilityLayers ?? []).map((l) => l.layerName).filter(Boolean).join('、');
  const characterNames = (args.phase2.characterMatrix ?? []).map((c) => c.name).filter(Boolean).join('、');

  return [
    '阶段1：',
    `故事大纲：${args.phase1.outlineSummary}`,
    `核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}`,
    '',
    '阶段2：',
    `信息层级：${layerNames || '-'}`,
    `角色：${characterNames || '-'}`,
  ].join('\n');
}

function buildPhase3ActDetailUserPrompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
  actOutline: ActOutline;
  actMode: 'three_act' | 'four_act';
}): string {
  const layersDetail = (args.phase2.infoVisibilityLayers ?? [])
    .map((l) => {
      const roles = (l.roles ?? []).join('、') || '无';
      const trigger = l.motivation?.activationTrigger || '未知';
      return `- ${l.layerName || '未命名层'}：角色[${roles}]，盲区[${l.blindSpot || '无'}]，触发点[${trigger}]`;
    })
    .join('\n');

  const charactersDetail = (args.phase2.characterMatrix ?? [])
    .map((c) => `- ${c.name || '未命名'}：目标[${c.goal || '未知'}]，秘密[${c.secret || '无'}]，软肋[${c.vulnerability || '无'}]`)
    .join('\n');

  const beatsOutlineText = args.actOutline.beats
    .map((b, idx) => `${idx + 1}. ${b.beatName}${typeof b.escalation === 'number' ? `（升${b.escalation}）` : ''}${b.interlock ? `｜咬合：${b.interlock}` : ''}`)
    .join('\n');

  return [
    `actMode: ${args.actMode}`,
    '',
    '阶段1：',
    `故事大纲：${args.phase1.outlineSummary}`,
    `核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}`,
    '',
    '阶段2 信息层级：',
    layersDetail || '-',
    '',
    '阶段2 角色矩阵：',
    charactersDetail || '-',
    '',
    '本幕节拍目录（beatName 必须完全一致，不可修改）：',
    `第${args.actOutline.act}幕「${args.actOutline.actName || ''}」`,
    beatsOutlineText,
  ].join('\n');
}

function buildPhase3ActRepairUserPrompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
  actOutline: ActOutline;
  actMode: 'three_act' | 'four_act';
  currentBeats: unknown;
  missingBeats: Array<Pick<Phase3IncompleteBeat, 'beatName' | 'missing'>>;
}): string {
  const base = buildPhase3ActDetailUserPrompt({
    phase1: args.phase1,
    phase2: args.phase2,
    actOutline: args.actOutline,
    actMode: args.actMode,
  });

  const missingText = args.missingBeats
    .map((x) => `- ${x.beatName}: ${x.missing.join(', ')}`)
    .join('\n');

  const current = JSON.stringify(
    {
      beatFlow: {
        actMode: args.actMode,
        acts: [
          {
            act: args.actOutline.act,
            actName: args.actOutline.actName ?? '',
            beats: args.currentBeats,
          },
        ],
      },
    },
    null,
    2,
  );

  return [
    base.trimEnd(),
    '',
    '校验反馈：你上次输出存在空/缺失字段，请严格补齐以下节拍的字段（必须非空）：',
    missingText || '-',
    '',
    '当前已生成的 beats（供参考，可覆盖修正）：',
    current,
  ].join('\n');
}

function isBeatDetailedEnough(beat: Record<string, unknown>): boolean {
  return getBeatMissingFields(beat).length === 0;
}

function getBeatMissingFields(beat: Record<string, unknown>): Array<'location' | 'visualHook' | 'characters' | 'surfaceEvent' | 'infoFlow'> {
  const missing: Array<'location' | 'visualHook' | 'characters' | 'surfaceEvent' | 'infoFlow'> = [];

  const location = beat['location'];
  if (!(typeof location === 'string' && location.trim().length > 0)) missing.push('location');

  const visualHook = beat['visualHook'];
  if (!(typeof visualHook === 'string' && visualHook.trim().length > 0)) missing.push('visualHook');

  const characters = beat['characters'];
  const hasValidCharacter =
    Array.isArray(characters) && characters.some((c) => typeof c === 'string' && c.trim().length > 0);
  if (!hasValidCharacter) missing.push('characters');

  const surfaceEvent = beat['surfaceEvent'];
  if (!(typeof surfaceEvent === 'string' && surfaceEvent.trim().length > 0)) missing.push('surfaceEvent');

  const infoFlow = beat['infoFlow'];
  if (!(typeof infoFlow === 'string' && infoFlow.trim().length > 0)) missing.push('infoFlow');

  return missing;
}

type Phase3IncompleteBeat = {
  act: number;
  actName?: string | null;
  beatName: string;
  missing: Array<'location' | 'visualHook' | 'characters' | 'surfaceEvent' | 'infoFlow'>;
};

function findPhase3IncompleteBeats(args: {
  beatFlow: Phase3BeatFlow['beatFlow'];
  actCount: number;
}): Phase3IncompleteBeat[] {
  const acts = args.beatFlow.acts ?? [];
  const list: Phase3IncompleteBeat[] = [];

  for (const act of acts) {
    const actNo = typeof act.act === 'number' ? act.act : null;
    if (!actNo || actNo < 1 || actNo > args.actCount) continue;
    for (const b of act.beats ?? []) {
      const beatName = String(b.beatName ?? '').trim();
      if (!beatName) continue;
      const missing = getBeatMissingFields(b as unknown as Record<string, unknown>);
      if (missing.length === 0) continue;
      list.push({ act: actNo, actName: act.actName ?? null, beatName, missing });
    }
  }

  return list;
}

function formatPhase3IncompleteBeats(list: Phase3IncompleteBeat[], maxItems = 8): string {
  const label: Record<Phase3IncompleteBeat['missing'][number], string> = {
    location: 'location(地点)',
    visualHook: 'visualHook(视觉钩子)',
    characters: 'characters(角色)',
    surfaceEvent: 'surfaceEvent(事件)',
    infoFlow: 'infoFlow(信息流)',
  };

  const picked = list.slice(0, maxItems);
  const text = picked
    .map((x) => {
      const miss = x.missing.map((m) => label[m]).join(', ');
      const actName = x.actName ? `「${x.actName}」` : '';
      return `第${x.act}幕${actName}/${x.beatName}: 缺少 ${miss}`;
    })
    .join('；');

  const suffix = list.length > maxItems ? `；...等共${list.length}处` : '';
  return `${text}${suffix}`;
}

function mergeActDetailsIntoBeatFlow(
  beatFlow: Phase3BeatFlow['beatFlow'],
  act: number,
  beats: Phase3BeatFlow['beatFlow']['acts'][number]['beats'],
): Phase3BeatFlow['beatFlow'] {
  const nextActs = (beatFlow.acts ?? []).map((a) => {
    if (a.act !== act) return a;
    return { ...a, beats };
  });
  return { ...beatFlow, acts: nextActs };
}

function parsePhase3(raw: string): { parsed: Phase3BeatFlow; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase3BeatFlowSchema.parse(json), extractedJson };
}

// ===================== 阶段4：叙事线 + 自洽校验 =====================

function buildPhase4UserPrompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
  phase3: Phase3BeatFlow;
}): string {
  // 安全获取数组（防止 null/undefined）
  const acts = args.phase3.beatFlow?.acts ?? [];
  const characters = args.phase2.characterMatrix ?? [];

  // 格式化节拍摘要（包含关键信息）
  const beatsDetail = acts
    .map((act) => {
      const actBeats = (act.beats ?? [])
        .map((b) => `    · ${b.beatName || '未命名'}：${b.surfaceEvent || '无事件'}（${b.characters?.join('、') || '无角色'}）`)
        .join('\n');
      return `  第${act.act}幕「${act.actName || ''}」：\n${actBeats || '    （无节拍）'}`;
    })
    .join('\n');

  // 格式化角色目标摘要
  const characterGoals = characters
    .map((c) => `  - ${c.name || '未命名'}：表面目标[${c.goal || '无'}]，真实意图[${c.secret || '无'}]`)
    .join('\n');

  return [
    '阶段1结果 - 故事骨架：',
    `故事大纲：${args.phase1.outlineSummary}`,
    `核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}`,
    `第一推动因：${args.phase1.conflictEngine.firstMover?.initiator || '未知'}`,
    '',
    '阶段2结果 - 角色目标：',
    characterGoals || '（无）',
    '',
    '阶段3结果 - 节拍结构：',
    beatsDetail || '（无）',
  ].join('\n');
}

function parsePhase4(raw: string): { parsed: Phase4PlotLines; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase4PlotLinesSchema.parse(json), extractedJson };
}

// ===================== 通用修复提示 =====================

function buildJsonFixUserPrompt(raw: string, phase: number): string {
  const phaseHints: Record<number, string> = {
    1: `必须包含 outlineSummary(字符串) 和 conflictEngine(对象，含 coreObjectOrEvent)`,
    2: `必须包含 infoVisibilityLayers(数组) 和 characterMatrix(数组)。
注意：motivation.gain 和 motivation.lossAvoid 必须是数字(如 5)，不是字符串(如 "5")`,
    3: `必须包含 beatFlow(对象，含 actMode 和 acts 数组)。
注意：escalation 和 estimatedScenes 必须是数字(如 3)，不是字符串(如 "3")；
location/visualHook/surfaceEvent/infoFlow 必须是非空字符串；characters 至少包含 1 个非空角色名`,
    4: `必须包含 plotLines(数组) 和 consistencyChecks(对象)。
注意：lineType 必须是 "main"/"sub1"/"sub2"/"sub3" 之一；consistencyChecks 中的值必须是布尔值 true/false（不加引号）`,
  };

  return [
    `phase: ${phase}`,
    `阶段字段要求：${phaseHints[phase] ?? '确保字段完整'}`,
    '',
    '原始输出：',
    '<<<',
    raw?.trim() ?? '',
    '>>>',
  ].join('\n');
}

function stableJsonFixConfig(base: ReturnType<typeof toProviderChatConfig>): ReturnType<typeof toProviderChatConfig> {
  // JSON 修复阶段：尽可能确定性输出，减少格式漂移
  const next = { ...base } as ReturnType<typeof toProviderChatConfig>;
  const model = String(next.model ?? '').toLowerCase();
  // AiHubMix 的 gpt-5.2 模式不支持 minimal（会报 400），但支持 none/low/medium/high/xhigh
  const effort =
    model.includes('gpt-5.2') || model.includes('gpt5.2') ? 'none' : ('minimal' as const);
  next.params = {
    ...(next.params ?? {}),
    temperature: 0,
    topP: 1,
    presencePenalty: 0,
    frequencyPenalty: 0,
    // GPT-5 / 推理模型：修复 JSON 时建议使用最少推理，降低“额外解释文字/格式漂移”概率
    reasoningEffort: effort,
  };
  return next;
}

// ===================== 合并到 contextCache =====================

function mergeProjectContextCache(
  existing: Prisma.JsonValue | null,
  nextNarrative: NarrativeCausalChain,
): Prisma.InputJsonValue {
  const base = existing && isRecord(existing) ? existing : {};
  return {
    ...base,
    narrativeCausalChain: nextNarrative,
    narrativeCausalChainVersion: NARRATIVE_CAUSAL_CHAIN_VERSION,
    narrativeCausalChainUpdatedAt: new Date().toISOString(),
  } as Prisma.InputJsonValue;
}

function getExistingNarrativeChain(contextCache: Prisma.JsonValue | null): NarrativeCausalChain | null {
  if (!contextCache || !isRecord(contextCache)) return null;
  const chain = contextCache['narrativeCausalChain'];
  if (!chain) return null;
  try {
    return NarrativeCausalChainSchema.parse(chain);
  } catch {
    return null;
  }
}

// ===================== 主函数：分阶段生成 =====================

export async function buildNarrativeCausalChain(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  aiProfileId: string;
  apiKeySecret: string;
  phase?: number; // 1-4，不传则自动续接
  force?: boolean; // 显式“重新生成”：忽略缓存/达标判断
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const profile = await prisma.aIProfile.findFirst({
    where: { id: aiProfileId, teamId },
    select: { provider: true, model: true, baseURL: true, apiKeyEncrypted: true, generationParams: true },
  });
  if (!profile) throw new Error('AI profile not found');

  const worldViewElements = await prisma.worldViewElement.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { type: true, title: true, content: true, order: true },
  });

  const characters = await prisma.character.findMany({
    where: { projectId },
    orderBy: { updatedAt: 'desc' },
    take: 30,
    select: { name: true, appearance: true, personality: true, background: true },
  });

  // 获取现有的因果链（如有）
  const existingChain = getExistingNarrativeChain(project.contextCache);
  const completedPhase = existingChain?.completedPhase ?? 0;

  // 决定要执行的阶段
  const targetPhase = args.phase ?? completedPhase + 1;
  if (targetPhase < 1 || targetPhase > 4) {
    throw new Error(`无效的阶段号：${targetPhase}（有效范围 1-4）`);
  }
  if (targetPhase > completedPhase + 1 && !existingChain) {
    throw new Error(`请先完成阶段 ${completedPhase + 1}，再执行阶段 ${targetPhase}`);
  }

  await updateProgress({ pct: 5, message: `准备阶段 ${targetPhase}...` });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  let executionMode: 'agent' | 'legacy' = 'legacy';
  let fallbackUsed = false;
  let agentTrace: unknown = null;
  let stepSummaries: Array<{ index: number; kind: string; summary: string }> = [];

  if (targetPhase >= 3 && isAgentNarrativePhase34Enabled()) {
    await updateProgress({ pct: 10, message: `阶段${targetPhase} Agent 规划中...` });
    const systemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase3_4.agent.system',
    });

    const loop = await runJsonToolLoop<{ proceed: true }>({
      initialMessages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            `目标阶段: ${targetPhase}`,
            `force: ${args.force === true ? 'true' : 'false'}`,
            '请先判断是否需要读取上下文，再输出 final {"proceed": true}。',
          ].join('\n'),
        },
      ],
      callModel: async (messages, meta) => {
        await updateProgress({
          pct: Math.min(18, 10 + meta.stepIndex * 2),
          message: `阶段${targetPhase} Agent 步骤 ${meta.stepIndex}...`,
        });
        return await chatWithProvider(providerConfig, messages);
      },
      tools: {
        read_phase_context: {
          description: '读取阶段执行所需上下文摘要',
          execute: async () => ({
            targetPhase,
            completedPhase,
            hasExistingChain: Boolean(existingChain),
            summary: project.summary,
            style: styleFullPrompt(project),
          }),
        },
      },
      maxSteps: getAgentMaxSteps(),
      stepTimeoutMs: getAgentStepTimeoutMs(),
      totalTimeoutMs: getAgentTotalTimeoutMs(),
      parseFinal: (value) => {
        const parsed = isRecord(value) && value.proceed === true;
        if (!parsed) throw new Error('Agent final must be {"proceed": true}');
        return { proceed: true };
      },
      fallbackEnabled: isAgentFallbackToLegacyEnabled(),
      fallback: async () => ({ final: { proceed: true }, reason: 'agent_failed_use_legacy' }),
    });

    executionMode = loop.executionMode;
    fallbackUsed = loop.fallbackUsed;
    agentTrace = loop.trace;
    stepSummaries = summarizeAgentSteps(loop.trace);
  }

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  let extractedJson: string | null = null;
  let fixed = false;
  let lastParseError: string | null = null;
  let contextCacheForWrite: Prisma.JsonValue | null = project.contextCache;

  // 执行对应阶段
  let updatedChain: NarrativeCausalChain;
  const force = args.force === true;

  if (targetPhase === 1) {
    await updateProgress({ pct: 20, message: '阶段1：生成核心冲突引擎...' });
    const phaseConfig = {
      ...providerConfig,
      responseFormat: jsonSchemaFormat('narrative_phase1_conflict_engine', schemaPhase1ConflictEngine()),
    };
    const systemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase1.system',
    });
    const userPrompt = buildPhase1UserPrompt({
      storySynopsis: project.summary,
      artStyle: styleFullPrompt(project),
      worldView: formatWorldView(worldViewElements),
      characters: formatCharacters(characters),
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const res = await chatWithProvider(phaseConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    await updateProgress({
      pct: 30,
      message: '阶段1：解析输出...',
      output: previewLLMOutput(res.content),
    });

    let parsed: Phase1ConflictEngine | null = null;
    try {
      ({ parsed, extractedJson } = parsePhase1(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段1解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixConfig = stableJsonFixConfig(phaseConfig);
      const jsonFixSystemPrompt = await loadSystemPrompt({
        prisma,
        teamId,
        key: 'workflow.narrative_causal_chain.json_fix.system',
      });
      let lastErr: unknown = err;
      let ok = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段1修复 JSON（第${attempt}/3次）...`,
        });
        const fixRes = await chatWithProvider(fixConfig, [
          { role: 'system', content: jsonFixSystemPrompt },
          { role: 'user', content: buildJsonFixUserPrompt(res.content, 1) },
        ]);
        if (!fixRes.content?.trim()) {
          lastErr = new Error('修复失败：AI 返回空内容');
          continue;
        }
        tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段1修复输出已返回，解析中（第${attempt}/3次）...`,
          output: previewLLMOutput(fixRes.content),
        });
        try {
          ({ parsed, extractedJson } = parsePhase1(fixRes.content));
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      fixed = true;
    }

    if (!parsed) throw new Error('阶段1解析失败：结果为空');

    updatedChain = {
      version: NARRATIVE_CAUSAL_CHAIN_VERSION,
      validationStatus: 'incomplete',
      revisionSuggestions: [],
      completedPhase: 1,
      outlineSummary: parsed.outlineSummary,
      conflictEngine: parsed.conflictEngine,
      infoVisibilityLayers: [],
      characterMatrix: [],
      beatFlow: null,
      plotLines: [],
      consistencyChecks: null,
    };
  } else if (targetPhase === 2) {
    if (!existingChain?.outlineSummary || !existingChain?.conflictEngine) {
      throw new Error('请先完成阶段1');
    }
    await updateProgress({ pct: 20, message: '阶段2：生成信息能见度层...' });
    const phaseConfig = {
      ...providerConfig,
      responseFormat: jsonSchemaFormat('narrative_phase2_info_layers', schemaPhase2InfoLayers()),
    };
    const systemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase2.system',
    });
    const userPrompt = buildPhase2UserPrompt({
      storySynopsis: project.summary,
      characters: formatCharacters(characters),
      phase1: {
        outlineSummary: existingChain.outlineSummary,
        conflictEngine: existingChain.conflictEngine as Phase1ConflictEngine['conflictEngine'],
      },
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const res = await chatWithProvider(phaseConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    await updateProgress({
      pct: 30,
      message: '阶段2：解析输出...',
      output: previewLLMOutput(res.content),
    });

    let parsed: Phase2InfoLayers | null = null;
    try {
      ({ parsed, extractedJson } = parsePhase2(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段2解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixConfig = stableJsonFixConfig(phaseConfig);
      const jsonFixSystemPrompt = await loadSystemPrompt({
        prisma,
        teamId,
        key: 'workflow.narrative_causal_chain.json_fix.system',
      });
      let lastErr: unknown = err;
      let ok = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段2修复 JSON（第${attempt}/3次）...`,
        });
        const fixRes = await chatWithProvider(fixConfig, [
          { role: 'system', content: jsonFixSystemPrompt },
          { role: 'user', content: buildJsonFixUserPrompt(res.content, 2) },
        ]);
        if (!fixRes.content?.trim()) {
          lastErr = new Error('修复失败：AI 返回空内容');
          continue;
        }
        tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段2修复输出已返回，解析中（第${attempt}/3次）...`,
          output: previewLLMOutput(fixRes.content),
        });
        try {
          ({ parsed, extractedJson } = parsePhase2(fixRes.content));
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      fixed = true;
    }

    if (!parsed) throw new Error('阶段2解析失败：结果为空');

    updatedChain = {
      ...existingChain,
      completedPhase: 2,
      infoVisibilityLayers: parsed.infoVisibilityLayers,
      characterMatrix: parsed.characterMatrix,
    };
  } else if (targetPhase === 3) {
    if ((existingChain?.completedPhase ?? 0) < 2) {
      throw new Error('请先完成阶段2');
    }
    const phase1: Phase1ConflictEngine = {
      outlineSummary: existingChain?.outlineSummary ?? '',
      conflictEngine:
        (existingChain?.conflictEngine ?? { coreObjectOrEvent: '' }) as Phase1ConflictEngine['conflictEngine'],
    };
    const phase2: Phase2InfoLayers = {
      infoVisibilityLayers:
        (existingChain?.infoVisibilityLayers ?? []) as Phase2InfoLayers['infoVisibilityLayers'],
      characterMatrix: (existingChain?.characterMatrix ?? []) as Phase2InfoLayers['characterMatrix'],
    };

    const phase3OutlineSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase3a.system',
    });
    const phase3ActSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase3b.system',
    });
    const jsonFixSystemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.json_fix.system',
    });

    // === 3A：生成节拍目录（轻量） ===
    let beatFlow: Phase3BeatFlow['beatFlow'] | null =
      (force ? null : (existingChain?.beatFlow as Phase3BeatFlow['beatFlow'] | null)) ?? null;
    let phase3Mutated = false;

    if (!beatFlow || !Array.isArray(beatFlow.acts) || beatFlow.acts.length === 0) {
      await updateProgress({
        pct: 18,
        message: force ? '阶段3A：重新生成节拍目录（强制）...' : '阶段3A：生成节拍目录（轻量）...',
      });
      const phaseConfigA = stableJsonFixConfig({
        ...providerConfig,
        responseFormat: jsonSchemaFormat('narrative_phase3_outline', schemaPhase3Outline()),
      });
      const promptA = buildPhase3OutlineUserPrompt({ phase1, phase2 });
      const resA = await chatWithProvider(phaseConfigA, [
        { role: 'system', content: phase3OutlineSystemPrompt },
        { role: 'user', content: promptA },
      ]);
      if (!resA.content?.trim()) throw new Error('AI 返回空内容');
      tokenUsage = mergeTokenUsage(tokenUsage, resA.tokenUsage) ?? tokenUsage;

      await updateProgress({
        pct: 22,
        message: '阶段3A：解析输出...',
        output: previewLLMOutput(resA.content),
      });

      let parsedA: Phase3BeatFlow | null = null;
      try {
        ({ parsed: parsedA, extractedJson } = parsePhase3(resA.content));
      } catch (err) {
        lastParseError = err instanceof Error ? err.message : String(err);
        await updateProgress({
          pct: 26,
          message: `阶段3A解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
        });
        const fixConfig = stableJsonFixConfig(phaseConfigA);
        let lastErr: unknown = err;
        let ok = false;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await updateProgress({
            pct: 26 + attempt,
            message: `阶段3A修复 JSON（第${attempt}/3次）...`,
          });
          const fixRes = await chatWithProvider(fixConfig, [
            { role: 'system', content: jsonFixSystemPrompt },
            { role: 'user', content: buildJsonFixUserPrompt(resA.content, 3) },
          ]);
          if (!fixRes.content?.trim()) {
            lastErr = new Error('修复失败：AI 返回空内容');
            continue;
          }
          tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
          await updateProgress({
            pct: 26 + attempt,
            message: `阶段3A修复输出已返回，解析中（第${attempt}/3次）...`,
            output: previewLLMOutput(fixRes.content),
          });
          try {
            ({ parsed: parsedA, extractedJson } = parsePhase3(fixRes.content));
            ok = true;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        fixed = true;
      }

      if (!parsedA) throw new Error('阶段3A解析失败：结果为空');

      beatFlow = parsedA.beatFlow;
      phase3Mutated = true;

      // 先把目录写入（便于断点续跑）
      const draftChain: NarrativeCausalChain = { ...existingChain!, beatFlow, completedPhase: 2 };
      const nextCache = mergeProjectContextCache(contextCacheForWrite, draftChain);
      contextCacheForWrite = nextCache as unknown as Prisma.JsonValue;
      await prisma.project.update({
        where: { id: projectId },
        data: { contextCache: nextCache },
      });
    }

    if (!beatFlow) throw new Error('阶段3：节拍目录为空，无法继续');

    const actCount = beatFlow.actMode === 'four_act' ? 4 : 3;
    let currentBeatFlow = beatFlow;

    // === 3B：按幕补全 ===
    for (let actNo = 1; actNo <= actCount; actNo += 1) {
      const act = (currentBeatFlow.acts ?? []).find((a) => a.act === actNo) ?? null;
      if (!act) continue;
      const beats = act.beats ?? [];
      if (beats.length === 0) continue;

      const actAlreadyDetailed = beats.every((b) => isBeatDetailedEnough(b as unknown as Record<string, unknown>));
      if (!force && actAlreadyDetailed) continue;

      await updateProgress({
        pct: 30 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45),
        message: `阶段3B：补全第${actNo}幕节拍详情...`,
      });

      const actOutline: ActOutline = {
        act: actNo,
        actName: act.actName ?? null,
        beats: beats
          .map((b) => ({
            beatName: String(b.beatName ?? '').trim(),
            escalation: typeof b.escalation === 'number' ? b.escalation : null,
            interlock: typeof b.interlock === 'string' ? b.interlock : null,
          }))
          .filter((b) => b.beatName.length > 0),
      };

      if (actOutline.beats.length === 0) {
        throw new Error(`阶段3：第${actNo}幕节拍目录为空（beatName 缺失）`);
      }

      const promptB = buildPhase3ActDetailUserPrompt({
        phase1,
        phase2,
        actOutline,
        actMode: currentBeatFlow.actMode,
      });

      const phaseConfigB = {
        ...providerConfig,
        responseFormat: jsonSchemaFormat(
          `narrative_phase3_act${actNo}_detail`,
          schemaPhase3ActDetail({
            actMode: currentBeatFlow.actMode,
            act: actNo,
            beatNames: actOutline.beats.map((b) => b.beatName),
          }),
        ),
      };
      const stablePhaseConfigB = stableJsonFixConfig(phaseConfigB);
      const resB = await chatWithProvider(stablePhaseConfigB, [
        { role: 'system', content: phase3ActSystemPrompt },
        { role: 'user', content: promptB },
      ]);
      if (!resB.content?.trim()) throw new Error('AI 返回空内容');
      tokenUsage = mergeTokenUsage(tokenUsage, resB.tokenUsage) ?? tokenUsage;

      await updateProgress({
        pct: 34 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45),
        message: `阶段3B：第${actNo}幕解析输出...`,
        output: previewLLMOutput(resB.content),
      });

      let parsedB: Phase3BeatFlow | null = null;
      try {
        ({ parsed: parsedB, extractedJson } = parsePhase3(resB.content));
      } catch (err) {
        lastParseError = err instanceof Error ? err.message : String(err);
        await updateProgress({
          pct: 38 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45),
          message: `阶段3B解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
        });
        const fixConfig = stableJsonFixConfig(stablePhaseConfigB);
        let lastErr: unknown = err;
        let ok = false;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await updateProgress({
            pct: 40 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45) + attempt,
            message: `阶段3B修复 JSON（第${attempt}/3次）...`,
          });
          const fixRes = await chatWithProvider(fixConfig, [
            { role: 'system', content: jsonFixSystemPrompt },
            { role: 'user', content: buildJsonFixUserPrompt(resB.content, 3) },
          ]);
          if (!fixRes.content?.trim()) {
            lastErr = new Error('修复失败：AI 返回空内容');
            continue;
          }
          tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
          await updateProgress({
            pct: 40 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45) + attempt,
            message: `阶段3B：第${actNo}幕修复输出已返回，解析中（第${attempt}/3次）...`,
            output: previewLLMOutput(fixRes.content),
          });
          try {
            ({ parsed: parsedB, extractedJson } = parsePhase3(fixRes.content));
            ok = true;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        fixed = true;
      }

      if (!parsedB) throw new Error(`阶段3：第${actNo}幕解析失败：结果为空`);

      const detailAct = (parsedB.beatFlow.acts ?? []).find((a) => a.act === actNo) ?? null;
      if (!detailAct || !Array.isArray(detailAct.beats) || detailAct.beats.length === 0) {
        throw new Error(`阶段3：第${actNo}幕补全结果为空`);
      }

      // 用 beatName 对齐合并：保留目录顺序/名称，补齐细节字段
      const detailMap = new Map<string, (typeof detailAct.beats)[number]>();
      for (const b of detailAct.beats) {
        const name = String(b.beatName ?? '').trim();
        if (!name) continue;
        detailMap.set(name, b);
      }

      let mergedBeats = beats.map((b) => {
        const name = String(b.beatName ?? '').trim();
        const d = name ? detailMap.get(name) : undefined;
        return d ? { ...b, ...d, beatName: name } : b;
      });

      let actIncomplete: Array<Pick<Phase3IncompleteBeat, 'beatName' | 'missing'>> = mergedBeats
        .map((b) => {
          const beatName = String((b as { beatName?: unknown }).beatName ?? '').trim();
          return {
            beatName,
            missing: getBeatMissingFields(b as unknown as Record<string, unknown>),
          };
        })
        .filter((x) => x.beatName.length > 0 && x.missing.length > 0);

      // 若字段缺失：对同一幕进行定向修复（避免整阶段重跑）
      for (let repairAttempt = 1; repairAttempt <= 2 && actIncomplete.length > 0; repairAttempt += 1) {
        await updateProgress({
          pct: 55 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 35) + repairAttempt,
          message: `阶段3B：第${actNo}幕检测到缺失字段，尝试修复（${repairAttempt}/2）...`,
        });

        const repairPrompt = buildPhase3ActRepairUserPrompt({
          phase1,
          phase2,
          actOutline,
          actMode: currentBeatFlow.actMode,
          currentBeats: mergedBeats,
          missingBeats: actIncomplete,
        });

        const repairRes = await chatWithProvider(stablePhaseConfigB, [
          { role: 'system', content: phase3ActSystemPrompt },
          { role: 'user', content: repairPrompt },
        ]);
        if (!repairRes.content?.trim()) throw new Error('AI 返回空内容');
        tokenUsage = mergeTokenUsage(tokenUsage, repairRes.tokenUsage) ?? tokenUsage;

        await updateProgress({
          pct: 58 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 35) + repairAttempt,
          message: `阶段3B：第${actNo}幕修复输出已返回，解析中...`,
          output: previewLLMOutput(repairRes.content),
        });

        let parsedRepair: Phase3BeatFlow | null = null;
        try {
          ({ parsed: parsedRepair, extractedJson } = parsePhase3(repairRes.content));
        } catch (err) {
          lastParseError = err instanceof Error ? err.message : String(err);
          await updateProgress({
            pct: 60 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 35) + repairAttempt,
            message: `阶段3B修复解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
          });
          const fixConfig = stableJsonFixConfig(stablePhaseConfigB);
          let lastErr: unknown = err;
          let ok = false;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            const fixRes = await chatWithProvider(fixConfig, [
              { role: 'system', content: jsonFixSystemPrompt },
              { role: 'user', content: buildJsonFixUserPrompt(repairRes.content, 3) },
            ]);
            if (!fixRes.content?.trim()) {
              lastErr = new Error('修复失败：AI 返回空内容');
              continue;
            }
            tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
            await updateProgress({
              pct: 62 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 35) + attempt,
              message: `阶段3B：第${actNo}幕修复解析失败，JSON 修复输出已返回（第${attempt}/3次）...`,
              output: previewLLMOutput(fixRes.content),
            });
            try {
              ({ parsed: parsedRepair, extractedJson } = parsePhase3(fixRes.content));
              ok = true;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
          fixed = true;
        }

        if (!parsedRepair) throw new Error(`阶段3：第${actNo}幕修复解析失败：结果为空`);

        const repairAct = (parsedRepair.beatFlow.acts ?? []).find((a) => a.act === actNo) ?? null;
        if (!repairAct || !Array.isArray(repairAct.beats) || repairAct.beats.length === 0) {
          throw new Error(`阶段3：第${actNo}幕修复结果为空`);
        }

        const repairMap = new Map<string, (typeof repairAct.beats)[number]>();
        for (const b of repairAct.beats) {
          const name = String(b.beatName ?? '').trim();
          if (!name) continue;
          repairMap.set(name, b);
        }

        mergedBeats = beats.map((b) => {
          const name = String(b.beatName ?? '').trim();
          const d = name ? repairMap.get(name) : undefined;
          return d ? { ...b, ...d, beatName: name } : b;
        });

        actIncomplete = mergedBeats
          .map((b) => {
            const beatName = String((b as { beatName?: unknown }).beatName ?? '').trim();
            return {
              beatName,
              missing: getBeatMissingFields(b as unknown as Record<string, unknown>),
            };
          })
          .filter((x) => x.beatName.length > 0 && x.missing.length > 0);
      }

      phase3Mutated = true;
      currentBeatFlow = mergeActDetailsIntoBeatFlow(currentBeatFlow, actNo, mergedBeats);

      // 每补完一幕就写入一次（断点续跑）
      const draftChain: NarrativeCausalChain = { ...existingChain!, beatFlow: currentBeatFlow, completedPhase: 2 };
      const nextCache = mergeProjectContextCache(contextCacheForWrite, draftChain);
      contextCacheForWrite = nextCache as unknown as Prisma.JsonValue;
      await prisma.project.update({
        where: { id: projectId },
        data: { contextCache: nextCache },
      });

      if (actIncomplete.length > 0) {
        const missing = formatPhase3IncompleteBeats(
          actIncomplete.map((x) => ({
            act: actNo,
            actName: actOutline.actName ?? null,
            beatName: x.beatName,
            missing: x.missing,
          })),
        );
        throw new Error(`阶段3：第${actNo}幕补全后仍存在缺失字段：${missing}`);
      }
    }

    // 最终校验：所有幕都补全
    const structureIssues: string[] = [];
    for (let actNo = 1; actNo <= actCount; actNo += 1) {
      const act = (currentBeatFlow.acts ?? []).find((a) => a.act === actNo) ?? null;
      if (!act) {
        structureIssues.push(`缺少第${actNo}幕`);
        continue;
      }
      const beats = act.beats ?? [];
      if (beats.length < 3) {
        structureIssues.push(`第${actNo}幕节拍数不足(${beats.length})`);
      }
    }

    const incomplete = findPhase3IncompleteBeats({ beatFlow: currentBeatFlow, actCount });
    if (structureIssues.length > 0 || incomplete.length > 0) {
      const detail = incomplete.length > 0 ? formatPhase3IncompleteBeats(incomplete) : '';
      const issues = structureIssues.length > 0 ? structureIssues.join('；') : '';
      const joined = [issues, detail].filter(Boolean).join('；');
      throw new Error(`阶段3未完全补全（仍存在缺少 location/visualHook/characters/事件/信息流 的节拍）：${joined || '请重试'}`);
    }

    const nextCompletedPhase = phase3Mutated
      ? 3
      : Math.max((existingChain?.completedPhase ?? 0) as number, 3);
    updatedChain = {
      ...existingChain!,
      completedPhase: nextCompletedPhase,
      beatFlow: currentBeatFlow,
      ...(phase3Mutated
        ? {
          // 若阶段3发生变更（尤其是 force 重新生成），阶段4产物可能不再自洽：主动清空，避免“看起来还在但其实过期”
          validationStatus: 'incomplete',
          revisionSuggestions: [],
          plotLines: [],
          consistencyChecks: null,
        }
        : {}),
    };
  } else {
    // targetPhase === 4
    if ((existingChain?.completedPhase ?? 0) < 3) {
      throw new Error('请先完成阶段3');
    }
    await updateProgress({ pct: 20, message: '阶段4：生成叙事线交织...' });
    const phaseConfig = {
      ...providerConfig,
      responseFormat: jsonSchemaFormat('narrative_phase4_plot_lines', schemaPhase4PlotLines()),
    };
    const systemPrompt = await loadSystemPrompt({
      prisma,
      teamId,
      key: 'workflow.narrative_causal_chain.phase4.system',
    });
    const prompt = buildPhase4UserPrompt({
      phase1: {
        outlineSummary: existingChain?.outlineSummary ?? '',
        conflictEngine: (existingChain?.conflictEngine ?? { coreObjectOrEvent: '' }) as Phase1ConflictEngine['conflictEngine'],
      },
      phase2: {
        infoVisibilityLayers: (existingChain?.infoVisibilityLayers ?? []) as Phase2InfoLayers['infoVisibilityLayers'],
        characterMatrix: (existingChain?.characterMatrix ?? []) as Phase2InfoLayers['characterMatrix'],
      },
      phase3: {
        beatFlow: (existingChain?.beatFlow ?? { actMode: 'three_act', acts: [] }) as Phase3BeatFlow['beatFlow'],
      },
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];
    const res = await chatWithProvider(phaseConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    await updateProgress({
      pct: 30,
      message: '阶段4：解析输出...',
      output: previewLLMOutput(res.content),
    });

    let parsed: Phase4PlotLines | null = null;
    try {
      ({ parsed, extractedJson } = parsePhase4(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段4解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixConfig = stableJsonFixConfig(phaseConfig);
      const jsonFixSystemPrompt = await loadSystemPrompt({
        prisma,
        teamId,
        key: 'workflow.narrative_causal_chain.json_fix.system',
      });
      let lastErr: unknown = err;
      let ok = false;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段4修复 JSON（第${attempt}/3次）...`,
        });
        const fixRes = await chatWithProvider(fixConfig, [
          { role: 'system', content: jsonFixSystemPrompt },
          { role: 'user', content: buildJsonFixUserPrompt(res.content, 4) },
        ]);
        if (!fixRes.content?.trim()) {
          lastErr = new Error('修复失败：AI 返回空内容');
          continue;
        }
        tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
        await updateProgress({
          pct: 40 + attempt,
          message: `阶段4修复输出已返回，解析中（第${attempt}/3次）...`,
          output: previewLLMOutput(fixRes.content),
        });
        try {
          ({ parsed, extractedJson } = parsePhase4(fixRes.content));
          ok = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!ok) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
      fixed = true;
    }

    if (!parsed) throw new Error('阶段4解析失败：结果为空');

    // 判断是否通过自洽校验
    const checks = parsed.consistencyChecks;
    const allPass =
      checks?.blindSpotDrivesAction &&
      checks?.infoFlowChangesAtLeastTwo &&
      checks?.coreConflictHasThreeWayTension &&
      checks?.endingIrreversibleTriggeredByMultiLines &&
      checks?.noRedundantRole;

    updatedChain = {
      ...existingChain!,
      completedPhase: 4,
      validationStatus: allPass ? 'pass' : 'needs_revision',
      revisionSuggestions: checks?.notes ?? [],
      plotLines: parsed.plotLines,
      consistencyChecks: parsed.consistencyChecks,
    };
  }

  await updateProgress({ pct: 85, message: '写入数据库...' });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      contextCache: mergeProjectContextCache(contextCacheForWrite, updatedChain),
    },
  });

  // 版本快照：仅在阶段成功落库后创建一条（避免 phase3 的中间 checkpoint 产生大量版本）
  await tryCreateNarrativeCausalChainVersion({
    prisma,
    teamId,
    projectId,
    source: 'ai',
    phase: targetPhase,
    label: `AI 阶段${targetPhase}`,
    note: fixed ? `自动修复输出：${lastParseError ?? ''}`.trim() || null : null,
    basedOnVersionId: null,
    chain: updatedChain,
  });

  await updateProgress({ pct: 100, message: `阶段 ${targetPhase} 完成` });

  return {
    projectId,
    phase: targetPhase,
    completedPhase: updatedChain.completedPhase,
    validationStatus: updatedChain.validationStatus,
    extractedJson,
    fixed,
    lastParseError,
    tokenUsage,
    executionMode,
    fallbackUsed,
    agentTrace,
    stepSummaries,
  };
}
