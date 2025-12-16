import type { Prisma, PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import { chatWithProvider } from '../providers/index.js';
import type { ChatMessage } from '../providers/types.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { mergeTokenUsage, toProviderChatConfig, styleFullPrompt, isRecord } from './common.js';
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

// ===================== 阶段1：核心冲突引擎 =====================

function buildPhase1Prompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
}): string {
  return `你是叙事架构师。请基于设定生成【阶段1：故事大纲 + 核心冲突引擎】。

【输出要求】直接输出 JSON，不要 Markdown/代码块/解释。

【输入设定】
- 故事梗概：${args.storySynopsis}
- 画风：${args.artStyle}
- 世界观：${args.worldView}
- 角色库：${args.characters}

【输出 JSON 结构】
{
  "outlineSummary": "用3-5句话概括完整故事流（起承转合）",
  "conflictEngine": {
    "coreObjectOrEvent": "核心冲突物件/事件（如：账册/失踪案/继承权）",
    "stakesByFaction": {
      "势力A": "该物件对势力A的功能与风险",
      "势力B": "该物件对势力B的功能与风险"
    },
    "firstMover": {
      "initiator": "发起者角色名",
      "publicReason": "公开宣称的目的",
      "hiddenIntent": "真实意图",
      "legitimacyMask": "如何包装成'不得不做'的公事"
    },
    "necessityDerivation": [
      "若不行动则______（损失）",
      "若行动不加密则______（风险）",
      "因此必须______（关键设计）"
    ]
  }
}

请输出 JSON：`;
}

function parsePhase1(raw: string): { parsed: Phase1ConflictEngine; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase1ConflictEngineSchema.parse(json), extractedJson };
}

// ===================== 阶段2：信息能见度层 + 角色矩阵 =====================

function buildPhase2Prompt(args: {
  storySynopsis: string;
  characters: string;
  phase1: Phase1ConflictEngine;
}): string {
  return `你是叙事架构师。请基于【阶段1结果】生成【阶段2：信息能见度层 + 角色矩阵】。

【阶段1结果】
- 故事大纲：${args.phase1.outlineSummary}
- 核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}
- 各方利害：${JSON.stringify(args.phase1.conflictEngine.stakesByFaction)}

【角色库】${args.characters}

【输出要求】
1) 直接输出 JSON，不要 Markdown/代码块/解释
2) 以 { 开头，以 } 结尾
3) infoVisibilityLayers 至少 2-4 层（按知情权从高到低排列）
4) characterMatrix 为角色库中的每个主要角色填写一项
5) motivation.gain 和 motivation.lossAvoid 必须是 1-10 的整数（不要加引号）

【输出 JSON 结构】
{
  "infoVisibilityLayers": [
    {
      "layerName": "顶层",
      "roles": ["角色A"],
      "infoBoundary": "知道全部真相",
      "blindSpot": "不知道执行层的背叛",
      "motivation": {"gain": 8, "lossAvoid": 3, "activationTrigger": "发现背叛"}
    },
    {
      "layerName": "执行层",
      "roles": ["角色B", "角色C"],
      "infoBoundary": "只知道任务，不知道目的",
      "blindSpot": "不知道自己是棋子",
      "motivation": {"gain": 5, "lossAvoid": 7, "activationTrigger": "发现真相"}
    }
  ],
  "characterMatrix": [
    {"name": "角色A", "identity": "身份", "goal": "目标", "secret": "秘密", "vulnerability": "软肋"},
    {"name": "角色B", "identity": "身份", "goal": "目标", "secret": "秘密", "vulnerability": "软肋"}
  ]
}

请输出 JSON：`;
}

function parsePhase2(raw: string): { parsed: Phase2InfoLayers; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase2InfoLayersSchema.parse(json), extractedJson };
}

// ===================== 阶段3（增量版）：3A 目录 + 3B 按幕补全 =====================

type BeatOutline = { beatName: string; escalation?: number | null; interlock?: string | null };
type ActOutline = { act: number; actName?: string | null; beats: BeatOutline[] };

function buildPhase3OutlinePrompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
}): string {
  const layerNames = (args.phase2.infoVisibilityLayers ?? []).map((l) => l.layerName).filter(Boolean).join('、');
  const characterNames = (args.phase2.characterMatrix ?? []).map((c) => c.name).filter(Boolean).join('、');

  return `你是叙事架构师。请基于【阶段1+2结果】生成【阶段3A：节拍目录（轻量）】。

【目的】先生成“节拍目录”，只输出节拍名与冲突升级/咬合点，不输出长文本；为后续分幕补全做锚点。

【阶段1】故事大纲：${args.phase1.outlineSummary}
核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}

【阶段2】信息层级：${layerNames || '-'}
角色：${characterNames || '-'}

【输出要求】
1) 直接输出 JSON，不要 Markdown/代码块/解释
2) 以 { 开头，以 } 结尾
3) actMode 必须是 "three_act" 或 "four_act"
4) 每幕 3-5 个节拍（推荐 4 个；复杂剧情可 5 个）
5) beatName 必须唯一，且后续会被引用，请写清晰的“动词+名词”
6) escalation 必须是 1-10 的整数（不加引号），按幕推进逐步升高

【输出 JSON 结构】
{
  "beatFlow": {
    "actMode": "three_act",
    "acts": [
      { "act": 1, "actName": "开端", "beats": [
        { "beatName": "发现", "escalation": 2, "interlock": "与暗线1首次咬合" }
      ]},
      { "act": 2, "actName": "发展", "beats": [ ... ]},
      { "act": 3, "actName": "高潮", "beats": [ ... ]}
    ]
  }
}

请输出 JSON：`;
}

function buildPhase3ActDetailPrompt(args: {
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

  return `你是叙事架构师。请基于【阶段1+2结果】对【阶段3A给定的第${args.actOutline.act}幕节拍目录】进行补全，生成【阶段3B：按幕补全节拍详情】。

【强约束】beatName 必须与目录完全一致（不改名、不新增、不删除、不重排）。

【阶段1】故事大纲：${args.phase1.outlineSummary}
核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}

【阶段2】信息层级：
${layersDetail || '-'}

角色矩阵：
${charactersDetail || '-'}

【本幕节拍目录（不可修改）】
第${args.actOutline.act}幕「${args.actOutline.actName || ''}」
${beatsOutlineText}

【输出要求】
1) 直接输出 JSON，不要 Markdown/代码块/解释
2) 以 { 开头，以 } 结尾
3) 只输出这一幕（act=${args.actOutline.act}）的补全结果（但仍使用 beatFlow 包装）
4) escalation / estimatedScenes 必须是整数（不加引号）
5) 所有字符串字段禁止出现真实换行符；如需换行请使用 \\n
6) 每个字符串字段尽量控制在 60 字以内（避免输出过长导致截断）

【输出 JSON 结构】
{
  "beatFlow": {
    "actMode": "${args.actMode}",
    "acts": [
      {
        "act": ${args.actOutline.act},
        "actName": "${args.actOutline.actName ?? ''}",
        "beats": [
          {
            "beatName": "必须与目录一致",
            "surfaceEvent": "表面事件",
            "infoFlow": "信息流动/知情差",
            "escalation": 3,
            "interlock": "与暗线交叉点（可沿用目录）",
            "location": "地点",
            "characters": ["角色A", "角色B"],
            "visualHook": "画面钩子",
            "emotionalTone": "情绪基调",
            "estimatedScenes": 3
          }
        ]
      }
    ]
  }
}

请输出 JSON：`;
}

function isBeatDetailedEnough(beat: Record<string, unknown>): boolean {
  const location = beat['location'];
  const visualHook = beat['visualHook'];
  const characters = beat['characters'];
  const surfaceEvent = beat['surfaceEvent'];
  const infoFlow = beat['infoFlow'];
  return (
    typeof location === 'string' && location.trim().length > 0 &&
    typeof visualHook === 'string' && visualHook.trim().length > 0 &&
    Array.isArray(characters) && characters.length > 0 &&
    typeof surfaceEvent === 'string' && surfaceEvent.trim().length > 0 &&
    typeof infoFlow === 'string' && infoFlow.trim().length > 0
  );
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

function buildPhase4Prompt(args: {
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

  return `你是叙事架构师。请基于【阶段1+2+3结果】生成【阶段4：叙事线交织 + 自洽校验】。

【阶段1结果 - 故事骨架】
故事大纲：${args.phase1.outlineSummary}
核心冲突：${args.phase1.conflictEngine.coreObjectOrEvent}
第一推动因：${args.phase1.conflictEngine.firstMover?.initiator || '未知'}

【阶段2结果 - 角色目标】
${characterGoals || '（无）'}

【阶段3结果 - 节拍结构】
${beatsDetail || '（无）'}

【输出要求】
1) 直接输出 JSON，不要 Markdown/代码块/解释
2) 以 { 开头，以 } 结尾
3) lineType 必须是 "main"、"sub1"、"sub2"、"sub3" 之一
4) consistencyChecks 中的值必须是 true 或 false（布尔值，不加引号）
5) plotLines 至少 2-4 条线

【输出 JSON 结构】
{
  "plotLines": [
    {
      "lineType": "main",
      "driver": "主角",
      "statedGoal": "查明真相",
      "trueGoal": "复仇",
      "keyInterlocks": ["发现", "对峙"],
      "pointOfNoReturn": "揭露"
    },
    {
      "lineType": "sub1",
      "driver": "反派",
      "statedGoal": "维护秩序",
      "trueGoal": "掩盖罪行",
      "keyInterlocks": ["监视", "追杀"],
      "pointOfNoReturn": "暴露"
    }
  ],
  "consistencyChecks": {
    "blindSpotDrivesAction": true,
    "infoFlowChangesAtLeastTwo": true,
    "coreConflictHasThreeWayTension": true,
    "endingIrreversibleTriggeredByMultiLines": true,
    "noRedundantRole": true,
    "notes": ["角色X的转变动机可加强", "节拍Y的信息流单向"]
  }
}

请输出 JSON：`;
}

function parsePhase4(raw: string): { parsed: Phase4PlotLines; extractedJson: string } {
  const { json, extractedJson } = parseJsonFromText(raw, { expectedKind: 'object' });
  return { parsed: Phase4PlotLinesSchema.parse(json), extractedJson };
}

// ===================== 通用修复提示 =====================

function buildJsonFixPrompt(raw: string, phase: number): string {
  const phaseHints: Record<number, string> = {
    1: `必须包含 outlineSummary(字符串) 和 conflictEngine(对象，含 coreObjectOrEvent)`,
    2: `必须包含 infoVisibilityLayers(数组) 和 characterMatrix(数组)。
注意：motivation.gain 和 motivation.lossAvoid 必须是数字(如 5)，不是字符串(如 "5")`,
    3: `必须包含 beatFlow(对象，含 actMode 和 acts 数组)。
注意：escalation 和 estimatedScenes 必须是数字(如 3)，不是字符串(如 "3")`,
    4: `必须包含 plotLines(数组) 和 consistencyChecks(对象)。
注意：lineType 必须是 "main"/"sub1"/"sub2"/"sub3" 之一；consistencyChecks 中的值必须是布尔值 true/false（不加引号）`,
  };

  return `你刚才的输出无法被解析为符合要求的 JSON。请只输出一个 JSON 对象。

【修复要求】
1) 不要输出 Markdown、代码块、解释或多余文字
2) 直接以 { 开头，以 } 结尾
3) 阶段${phase}的字段要求：${phaseHints[phase] ?? '确保字段完整'}

原始输出：
<<<
${raw?.trim() ?? ''}
>>>

请只输出修正后的 JSON：`;
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

  let tokenUsage = { prompt: 0, completion: 0, total: 0 };
  let extractedJson: string | null = null;
  let fixed = false;
  let lastParseError: string | null = null;
  let contextCacheForWrite: Prisma.JsonValue | null = project.contextCache;

  // 执行对应阶段
  let updatedChain: NarrativeCausalChain;

  if (targetPhase === 1) {
    await updateProgress({ pct: 20, message: '阶段1：生成核心冲突引擎...' });
    const prompt = buildPhase1Prompt({
      storySynopsis: project.summary,
      artStyle: styleFullPrompt(project),
      worldView: formatWorldView(worldViewElements),
      characters: formatCharacters(characters),
    });

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const res = await chatWithProvider(providerConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    let parsed: Phase1ConflictEngine;
    try {
      ({ parsed, extractedJson } = parsePhase1(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段1解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 1) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      ({ parsed, extractedJson } = parsePhase1(fixRes.content));
      fixed = true;
    }

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
    const prompt = buildPhase2Prompt({
      storySynopsis: project.summary,
      characters: formatCharacters(characters),
      phase1: {
        outlineSummary: existingChain.outlineSummary,
        conflictEngine: existingChain.conflictEngine as Phase1ConflictEngine['conflictEngine'],
      },
    });

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const res = await chatWithProvider(providerConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    let parsed: Phase2InfoLayers;
    try {
      ({ parsed, extractedJson } = parsePhase2(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段2解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 2) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      ({ parsed, extractedJson } = parsePhase2(fixRes.content));
      fixed = true;
    }

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

    // === 3A：生成节拍目录（轻量） ===
    let beatFlow: Phase3BeatFlow['beatFlow'] | null =
      (existingChain?.beatFlow as Phase3BeatFlow['beatFlow'] | null) ?? null;

    if (!beatFlow || !Array.isArray(beatFlow.acts) || beatFlow.acts.length === 0) {
      await updateProgress({ pct: 18, message: '阶段3A：生成节拍目录（轻量）...' });
      const promptA = buildPhase3OutlinePrompt({ phase1, phase2 });
      const resA = await chatWithProvider(providerConfig, [{ role: 'user', content: promptA }]);
      if (!resA.content?.trim()) throw new Error('AI 返回空内容');
      tokenUsage = mergeTokenUsage(tokenUsage, resA.tokenUsage) ?? tokenUsage;

      let parsedA: Phase3BeatFlow;
      try {
        ({ parsed: parsedA, extractedJson } = parsePhase3(resA.content));
      } catch (err) {
        lastParseError = err instanceof Error ? err.message : String(err);
        await updateProgress({
          pct: 26,
          message: `阶段3A解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
        });
        const fixRes = await chatWithProvider(providerConfig, [
          { role: 'user', content: buildJsonFixPrompt(resA.content, 3) },
        ]);
        if (!fixRes.content?.trim()) throw new Error('修复失败');
        tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
        ({ parsed: parsedA, extractedJson } = parsePhase3(fixRes.content));
        fixed = true;
      }

      beatFlow = parsedA.beatFlow;

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
      if (actAlreadyDetailed) continue;

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

      const promptB = buildPhase3ActDetailPrompt({
        phase1,
        phase2,
        actOutline,
        actMode: currentBeatFlow.actMode,
      });

      const resB = await chatWithProvider(providerConfig, [{ role: 'user', content: promptB }]);
      if (!resB.content?.trim()) throw new Error('AI 返回空内容');
      tokenUsage = mergeTokenUsage(tokenUsage, resB.tokenUsage) ?? tokenUsage;

      let parsedB: Phase3BeatFlow;
      try {
        ({ parsed: parsedB, extractedJson } = parsePhase3(resB.content));
      } catch (err) {
        lastParseError = err instanceof Error ? err.message : String(err);
        await updateProgress({
          pct: 38 + Math.round(((actNo - 1) / Math.max(1, actCount)) * 45),
          message: `阶段3B解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
        });
        const fixRes = await chatWithProvider(providerConfig, [
          { role: 'user', content: buildJsonFixPrompt(resB.content, 3) },
        ]);
        if (!fixRes.content?.trim()) throw new Error('修复失败');
        tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
        ({ parsed: parsedB, extractedJson } = parsePhase3(fixRes.content));
        fixed = true;
      }

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

      const mergedBeats = beats.map((b) => {
        const name = String(b.beatName ?? '').trim();
        const d = name ? detailMap.get(name) : undefined;
        return d ? { ...b, ...d, beatName: name } : b;
      });

      currentBeatFlow = mergeActDetailsIntoBeatFlow(currentBeatFlow, actNo, mergedBeats);

      // 每补完一幕就写入一次（断点续跑）
      const draftChain: NarrativeCausalChain = { ...existingChain!, beatFlow: currentBeatFlow, completedPhase: 2 };
      const nextCache = mergeProjectContextCache(contextCacheForWrite, draftChain);
      contextCacheForWrite = nextCache as unknown as Prisma.JsonValue;
      await prisma.project.update({
        where: { id: projectId },
        data: { contextCache: nextCache },
      });
    }

    // 最终校验：所有幕都补全
    const allActsOk = (currentBeatFlow.acts ?? [])
      .filter((a) => typeof a.act === 'number' && a.act >= 1 && a.act <= actCount)
      .every((a) => (a.beats ?? []).length >= 3 && (a.beats ?? []).every((b) =>
        isBeatDetailedEnough(b as unknown as Record<string, unknown>)
      ));

    if (!allActsOk) {
      throw new Error('阶段3未完全补全（仍存在缺少 location/visualHook/characters/事件/信息流 的节拍），请重试');
    }

    updatedChain = {
      ...existingChain!,
      completedPhase: 3,
      beatFlow: currentBeatFlow,
    };
  } else {
    // targetPhase === 4
    if ((existingChain?.completedPhase ?? 0) < 3) {
      throw new Error('请先完成阶段3');
    }
    await updateProgress({ pct: 20, message: '阶段4：生成叙事线交织...' });
    const prompt = buildPhase4Prompt({
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

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const res = await chatWithProvider(providerConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    let parsed: Phase4PlotLines;
    try {
      ({ parsed, extractedJson } = parsePhase4(res.content));
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      await updateProgress({
        pct: 40,
        message: `阶段4解析失败，尝试修复 JSON...（${summarizeError(err)}）`,
      });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 4) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      ({ parsed, extractedJson } = parsePhase4(fixRes.content));
      fixed = true;
    }

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
  };
}

