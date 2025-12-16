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

function parsePhase1(raw: string): Phase1ConflictEngine {
  const { json } = parseJsonFromText(raw, { expectedKind: 'object' });
  return Phase1ConflictEngineSchema.parse(json);
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

function parsePhase2(raw: string): Phase2InfoLayers {
  const { json } = parseJsonFromText(raw, { expectedKind: 'object' });
  return Phase2InfoLayersSchema.parse(json);
}

// ===================== 阶段3：节拍流程（场景化版本） =====================

function buildPhase3Prompt(args: {
  phase1: Phase1ConflictEngine;
  phase2: Phase2InfoLayers;
}): string {
  // 安全获取数组（防止 null/undefined）
  const layers = args.phase2.infoVisibilityLayers ?? [];
  const characters = args.phase2.characterMatrix ?? [];

  // 格式化信息层级（包含详细内容）
  const layersDetail = layers
    .map((l) => {
      const roles = l.roles?.join('、') || '无';
      const trigger = l.motivation?.activationTrigger || '未知';
      return `  - ${l.layerName || '未命名层'}：角色[${roles}]，盲区[${l.blindSpot || '无'}]，触发点[${trigger}]`;
    })
    .join('\n');

  // 格式化角色矩阵（包含目标和软肋）
  const charactersDetail = characters
    .map((c) => `  - ${c.name || '未命名'}：目标[${c.goal || '未知'}]，秘密[${c.secret || '无'}]，软肋[${c.vulnerability || '无'}]`)
    .join('\n');

  // 格式化各方利害
  const stakesDetail = Object.entries(args.phase1.conflictEngine?.stakesByFaction || {})
    .map(([faction, stake]) => `  - ${faction}：${stake}`)
    .join('\n');

  return `你是叙事架构师。请基于【阶段1+2结果】生成【阶段3：场景化节拍流程】。

【核心目标】生成"可直接拆解为分镜"的节拍结构。每个节拍不仅描述叙事逻辑，还要包含场景/地点/人物/视觉钩子。

【阶段1结果 - 故事骨架】
故事大纲：${args.phase1.outlineSummary}

核心冲突物件：${args.phase1.conflictEngine.coreObjectOrEvent}

各方利害：
${stakesDetail || '  （无）'}

第一推动因：${args.phase1.conflictEngine.firstMover?.initiator || '未知'} - ${args.phase1.conflictEngine.firstMover?.hiddenIntent || '未知意图'}

【阶段2结果 - 信息与角色】
信息层级（从高到低）：
${layersDetail || '  （无）'}

角色矩阵：
${charactersDetail || '  （无）'}

【输出要求】
1) 直接输出 JSON，不要 Markdown/代码块/解释
2) 以 { 开头，以 } 结尾
3) actMode 必须是 "three_act" 或 "four_act"
4) escalation 和 estimatedScenes 必须是整数（如 3），不要加引号
5) 每幕 3-5 个节拍，三幕/四幕结构

【输出 JSON 结构】
{
  "beatFlow": {
    "actMode": "three_act",
    "acts": [
      {
        "act": 1,
        "actName": "开端",
        "beats": [
          {
            "beatName": "发现",
            "surfaceEvent": "主角发现异常",
            "infoFlow": "主角得知秘密，反派不知情",
            "escalation": 2,
            "interlock": "与暗线1交叉",
            "location": "废弃仓库",
            "characters": ["主角", "配角A"],
            "visualHook": "撕裂的信封特写",
            "emotionalTone": "紧张",
            "estimatedScenes": 3
          },
          {
            "beatName": "追查",
            "surfaceEvent": "主角开始调查",
            "infoFlow": "主角接近真相，暗中有人监视",
            "escalation": 4,
            "interlock": "与暗线2交叉",
            "location": "城市街道",
            "characters": ["主角"],
            "visualHook": "背后的黑影",
            "emotionalTone": "悬疑",
            "estimatedScenes": 2
          }
        ]
      },
      {
        "act": 2,
        "actName": "发展",
        "beats": []
      },
      {
        "act": 3,
        "actName": "高潮",
        "beats": []
      }
    ]
  }
}

【重要】每个节拍必须包含 location、characters、visualHook，这是后续分镜生成的关键输入。

请输出 JSON：`;
}

function parsePhase3(raw: string): Phase3BeatFlow {
  const { json } = parseJsonFromText(raw, { expectedKind: 'object' });
  return Phase3BeatFlowSchema.parse(json);
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

function parsePhase4(raw: string): Phase4PlotLines {
  const { json } = parseJsonFromText(raw, { expectedKind: 'object' });
  return Phase4PlotLinesSchema.parse(json);
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
      parsed = parsePhase1(res.content);
    } catch {
      await updateProgress({ pct: 40, message: '尝试修复 JSON...' });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 1) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      parsed = parsePhase1(fixRes.content);
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
      parsed = parsePhase2(res.content);
    } catch {
      await updateProgress({ pct: 40, message: '尝试修复 JSON...' });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 2) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      parsed = parsePhase2(fixRes.content);
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
    await updateProgress({ pct: 20, message: '阶段3：生成节拍流程...' });
    const prompt = buildPhase3Prompt({
      phase1: {
        outlineSummary: existingChain?.outlineSummary ?? '',
        conflictEngine: (existingChain?.conflictEngine ?? { coreObjectOrEvent: '' }) as Phase1ConflictEngine['conflictEngine'],
      },
      phase2: {
        infoVisibilityLayers: (existingChain?.infoVisibilityLayers ?? []) as Phase2InfoLayers['infoVisibilityLayers'],
        characterMatrix: (existingChain?.characterMatrix ?? []) as Phase2InfoLayers['characterMatrix'],
      },
    });

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const res = await chatWithProvider(providerConfig, messages);
    if (!res.content?.trim()) throw new Error('AI 返回空内容');
    tokenUsage = mergeTokenUsage(tokenUsage, res.tokenUsage) ?? tokenUsage;

    let parsed: Phase3BeatFlow;
    try {
      parsed = parsePhase3(res.content);
    } catch {
      await updateProgress({ pct: 40, message: '尝试修复 JSON...' });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 3) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      parsed = parsePhase3(fixRes.content);
    }

    updatedChain = {
      ...existingChain!,
      completedPhase: 3,
      beatFlow: parsed.beatFlow,
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
      parsed = parsePhase4(res.content);
    } catch {
      await updateProgress({ pct: 40, message: '尝试修复 JSON...' });
      const fixRes = await chatWithProvider(providerConfig, [
        { role: 'user', content: buildJsonFixPrompt(res.content, 4) },
      ]);
      if (!fixRes.content?.trim()) throw new Error('修复失败');
      tokenUsage = mergeTokenUsage(tokenUsage, fixRes.tokenUsage) ?? tokenUsage;
      parsed = parsePhase4(fixRes.content);
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
      contextCache: mergeProjectContextCache(project.contextCache, updatedChain),
    },
  });

  await updateProgress({ pct: 100, message: `阶段 ${targetPhase} 完成` });

  return {
    projectId,
    phase: targetPhase,
    completedPhase: updatedChain.completedPhase,
    validationStatus: updatedChain.validationStatus,
    tokenUsage,
  };
}

