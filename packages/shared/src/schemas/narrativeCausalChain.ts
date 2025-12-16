import { z } from 'zod';

/** 叙事因果链 schema 版本号，用于数据迁移 */
export const NARRATIVE_CAUSAL_CHAIN_VERSION = '2.0.0';

// ===================== 分阶段 Schema =====================
// 方案A：将复杂的因果链拆分为 4 个阶段，每阶段只生成一部分
// 这样 AI 每次专注于单一任务，输出更稳定

// ========== 阶段1：核心冲突引擎 ==========
export const Phase1ConflictEngineSchema = z.object({
  outlineSummary: z.string().min(1).max(8000).describe('用3-5句话概括完整故事流'),
  conflictEngine: z.object({
    coreObjectOrEvent: z.string().min(1).max(400).describe('核心冲突物件/事件'),
    stakesByFaction: z.record(z.string(), z.string().max(4000)).default({}).describe('各势力的利害关系'),
    firstMover: z.object({
      initiator: z.string().max(200).optional().nullable(),
      publicReason: z.string().max(4000).optional().nullable(),
      hiddenIntent: z.string().max(4000).optional().nullable(),
      legitimacyMask: z.string().max(4000).optional().nullable(),
    }).optional().nullable(),
    necessityDerivation: z.array(z.string().max(800)).default([]),
  }),
});
export type Phase1ConflictEngine = z.infer<typeof Phase1ConflictEngineSchema>;

// ========== 阶段2：信息能见度层 + 角色矩阵 ==========
// 优化：放宽数字类型约束，支持字符串自动转换
const coerceInt = z.preprocess(
  (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
  z.number().int().min(1).max(10).optional().nullable()
);

export const Phase2InfoLayersSchema = z.object({
  infoVisibilityLayers: z.array(z.object({
    layerName: z.string().max(80).optional().nullable(),
    roles: z.array(z.string().max(200)).default([]),
    infoBoundary: z.string().max(4000).optional().nullable(),
    blindSpot: z.string().max(4000).optional().nullable(),
    motivation: z.object({
      gain: coerceInt,
      lossAvoid: coerceInt,
      activationTrigger: z.string().max(4000).optional().nullable(),
    }).optional().nullable(),
  })).default([]),
  characterMatrix: z.array(z.object({
    name: z.string().max(200).optional().nullable(), // 改为可选，避免校验失败
    identity: z.string().max(800).optional().nullable(),
    goal: z.string().max(4000).optional().nullable(),
    secret: z.string().max(4000).optional().nullable(),
    vulnerability: z.string().max(4000).optional().nullable(),
    assumptions: z.array(z.string().max(800)).optional().nullable(),
  })).default([]),
});
export type Phase2InfoLayers = z.infer<typeof Phase2InfoLayersSchema>;

// ========== 阶段3：节拍流程（增强版：场景化节拍） ==========
// 每个节拍不仅描述叙事逻辑，还要包含"可分镜化"的场景信息
const coerceAct = z.preprocess(
  (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
  z.number().int().min(1).max(4)
);

const coerceActMode = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const s = val.trim().toLowerCase();
    const three = new Set(['three_act', 'three-act', '3-act', '3act', '三幕', '三幕式', '三幕结构']);
    const four = new Set(['four_act', 'four-act', '4-act', '4act', '四幕', '四幕式', '四幕结构']);
    if (three.has(s)) return 'three_act';
    if (four.has(s)) return 'four_act';
    return val;
  },
  z.enum(['three_act', 'four_act']).default('three_act')
);

const coerceStringArray = (maxLen: number) =>
  z.preprocess(
    (val) => {
      if (val === null || typeof val === 'undefined') return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        return val
          .split(/[，,、]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return val;
    },
    z.array(z.string().max(maxLen)).default([])
  );

const SceneBeatSchema = z.object({
  beatName: z.string().max(120).describe('节拍名称：动词+名词，如"裂箱/对峙/倒戈"'),
  surfaceEvent: z.string().max(4000).optional().nullable().describe('表面事件：角色在做什么'),
  infoFlow: z.string().max(4000).optional().nullable().describe('信息流动：谁知道了什么，谁仍被蒙在鼓里'),
  escalation: coerceInt.describe('冲突升级值(1-10)'),
  interlock: z.string().max(4000).optional().nullable().describe('咬合点：与哪条暗线交叉'),
  // ===== 新增：场景化字段（用于分镜拆解） =====
  location: z.string().max(400).optional().nullable().describe('场景/地点：这个节拍发生在哪里'),
  characters: coerceStringArray(200).describe('参与角色：哪些角色在场'),
  visualHook: z.string().max(1000).optional().nullable().describe('视觉钩子：关键画面/动作/道具描述'),
  emotionalTone: z.string().max(200).optional().nullable().describe('情绪基调：如"紧张/温馨/悲壮"'),
  estimatedScenes: coerceInt.describe('预估分镜数(1-10)'),
});

export const Phase3BeatFlowSchema = z.object({
  beatFlow: z.object({
    actMode: coerceActMode,
    acts: z.preprocess(
      (val) => (val === null ? undefined : val),
      z.array(z.object({
        act: coerceAct,
        actName: z.string().max(120).optional().nullable(),
        beats: z.preprocess(
          (val) => (val === null ? undefined : val),
          z.array(SceneBeatSchema).default([])
        ),
      })).default([])
    ),
  }),
});
export type Phase3BeatFlow = z.infer<typeof Phase3BeatFlowSchema>;

// ========== 阶段4：叙事线 + 自洽校验 ==========
// 字符串转布尔值（AI 可能输出 "true"/"false" 字符串）
const coerceBool = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      return val.toLowerCase() === 'true';
    }
    return val;
  },
  z.boolean().optional().nullable()
);

// lineType 支持中文映射
const coerceLineType = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      const map: Record<string, string> = {
        '主线': 'main', '明线': 'main',
        '暗线1': 'sub1', '副线1': 'sub1',
        '暗线2': 'sub2', '副线2': 'sub2',
        '暗线3': 'sub3', '副线3': 'sub3',
      };
      return map[val] ?? val;
    }
    return val;
  },
  z.enum(['main', 'sub1', 'sub2', 'sub3']).optional().nullable()
);

export const Phase4PlotLinesSchema = z.object({
  plotLines: z.array(z.object({
    lineType: coerceLineType,
    driver: z.string().max(200).optional().nullable(),
    statedGoal: z.string().max(4000).optional().nullable(),
    trueGoal: z.string().max(4000).optional().nullable(),
    keyInterlocks: coerceStringArray(120),
    pointOfNoReturn: z.string().max(120).optional().nullable(),
  })).default([]),
  consistencyChecks: z.object({
    blindSpotDrivesAction: coerceBool,
    infoFlowChangesAtLeastTwo: coerceBool,
    coreConflictHasThreeWayTension: coerceBool,
    endingIrreversibleTriggeredByMultiLines: coerceBool,
    noRedundantRole: coerceBool,
    notes: z.array(z.string().max(4000)).default([]),
  }).optional().nullable(),
});
export type Phase4PlotLines = z.infer<typeof Phase4PlotLinesSchema>;

// ===================== 完整的叙事因果链（合并所有阶段） =====================
export const NarrativeCausalChainSchema = z.object({
  // 元信息
  version: z.string().default(NARRATIVE_CAUSAL_CHAIN_VERSION),
  validationStatus: z.enum(['pass', 'needs_revision', 'incomplete']).default('incomplete'),
  revisionSuggestions: z.array(z.string().max(4000)).default([]),
  
  // 当前完成的阶段 (1-4)
  completedPhase: z.number().int().min(0).max(4).default(0),
  
  // 阶段1：大纲 + 冲突引擎
  outlineSummary: z.string().max(8000).optional().nullable(),
  conflictEngine: z.object({
    coreObjectOrEvent: z.string().max(400).optional().nullable(),
    stakesByFaction: z.record(z.string(), z.string().max(4000)).default({}),
    firstMover: z.object({
      initiator: z.string().max(200).optional().nullable(),
      publicReason: z.string().max(4000).optional().nullable(),
      hiddenIntent: z.string().max(4000).optional().nullable(),
      legitimacyMask: z.string().max(4000).optional().nullable(),
    }).optional().nullable(),
    necessityDerivation: z.array(z.string().max(800)).default([]),
  }).optional().nullable(),
  
  // 阶段2：信息层 + 角色矩阵
  infoVisibilityLayers: z.array(z.object({
    layerName: z.string().max(80).optional().nullable(),
    roles: z.array(z.string().max(200)).default([]),
    infoBoundary: z.string().max(4000).optional().nullable(),
    blindSpot: z.string().max(4000).optional().nullable(),
    motivation: z.object({
      gain: z.number().int().min(1).max(10).optional().nullable(),
      lossAvoid: z.number().int().min(1).max(10).optional().nullable(),
      activationTrigger: z.string().max(4000).optional().nullable(),
    }).optional().nullable(),
  })).default([]),
  characterMatrix: z.array(z.object({
    name: z.string().max(200).optional().nullable(),
    identity: z.string().max(800).optional().nullable(),
    goal: z.string().max(4000).optional().nullable(),
    secret: z.string().max(4000).optional().nullable(),
    vulnerability: z.string().max(4000).optional().nullable(),
    assumptions: z.array(z.string().max(800)).optional().nullable(),
  })).default([]),
  
  // 阶段3：节拍流程（场景化版本）
  beatFlow: z.object({
    actMode: z.enum(['three_act', 'four_act']).default('three_act'),
    acts: z.array(z.object({
      act: z.number().int().min(1).max(4).optional().nullable(),
      actName: z.string().max(120).optional().nullable(),
      beats: z.array(z.object({
        beatName: z.string().max(120).optional().nullable(),
        surfaceEvent: z.string().max(4000).optional().nullable(),
        infoFlow: z.string().max(4000).optional().nullable(),
        escalation: z.number().int().min(1).max(10).optional().nullable(),
        interlock: z.string().max(4000).optional().nullable(),
        // 场景化字段
        location: z.string().max(400).optional().nullable(),
        characters: z.array(z.string().max(200)).default([]),
        visualHook: z.string().max(1000).optional().nullable(),
        emotionalTone: z.string().max(200).optional().nullable(),
        estimatedScenes: z.number().int().min(1).max(10).optional().nullable(),
      })).default([]),
    })).default([]),
  }).optional().nullable(),
  
  // 阶段4：叙事线 + 自洽校验
  plotLines: z.array(z.object({
    lineType: z.enum(['main', 'sub1', 'sub2', 'sub3']).optional().nullable(),
    driver: z.string().max(200).optional().nullable(),
    statedGoal: z.string().max(4000).optional().nullable(),
    trueGoal: z.string().max(4000).optional().nullable(),
    keyInterlocks: z.array(z.string().max(120)).default([]),
    pointOfNoReturn: z.string().max(120).optional().nullable(),
  })).default([]),
  consistencyChecks: z.object({
    blindSpotDrivesAction: z.boolean().optional().nullable(),
    infoFlowChangesAtLeastTwo: z.boolean().optional().nullable(),
    coreConflictHasThreeWayTension: z.boolean().optional().nullable(),
    endingIrreversibleTriggeredByMultiLines: z.boolean().optional().nullable(),
    noRedundantRole: z.boolean().optional().nullable(),
    notes: z.array(z.string().max(4000)).default([]),
  }).optional().nullable(),
}).passthrough();

export type NarrativeCausalChain = z.infer<typeof NarrativeCausalChainSchema>;

// ===================== 阶段名称映射 =====================
export const CAUSAL_CHAIN_PHASES = [
  { phase: 1, name: '核心冲突', description: '故事大纲 + 冲突引擎' },
  { phase: 2, name: '信息分层', description: '信息能见度层 + 角色矩阵' },
  { phase: 3, name: '节拍流程', description: '三/四幕结构的节拍设计' },
  { phase: 4, name: '叙事线交织', description: '明暗线 + 自洽校验' },
] as const;

