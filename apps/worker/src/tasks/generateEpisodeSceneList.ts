import type { PrismaClient } from '@prisma/client';
import type { JobProgress } from 'bullmq';
import type { ChatMessage } from '../providers/types.js';
import { chatWithProvider } from '../providers/index.js';
import { decryptApiKey } from '../crypto/apiKeyCrypto.js';
import { isRecord, styleFullPrompt, toProviderChatConfig } from './common.js';
import { loadSystemPrompt } from './systemPrompts.js';

function parseSceneList(text: string, limit: number): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\d+[).\s-]+/, '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function formatWorldView(items: Array<{ type: string; title: string; content: string; order: number }>): string {
  if (items.length === 0) return '-';
  return items
    .map((it) => `- (${it.order}) [${it.type}] ${it.title}: ${String(it.content ?? '').slice(0, 400)}`)
    .join('\n');
}

function formatCharacters(items: Array<{ name: string; appearance: string; personality: string; background: string }>): string {
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

function formatNarrativeCausalChain(contextCache: unknown): string {
  if (!contextCache || !isRecord(contextCache)) return '-';
  const chain = contextCache['narrativeCausalChain'];
  if (!chain) return '-';
  if (!isRecord(chain)) return String(chain);

  // 智能策略：若全量 JSON（压缩）足够短，则直接喂给模型（信息最完整，且不会“半截截断”）
  try {
    const compact = JSON.stringify(chain);
    if (compact.length <= 12000) return compact;
  } catch {
    // fallthrough to summary
  }

  const clip = (v: unknown, max = 140) => {
    const s = (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
    if (!s) return '';
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };

  const pushUntil = (lines: string[], maxLen = 12000): string => {
    let out = '';
    for (const line of lines) {
      const next = out ? `${out}\n${line}` : line;
      if (next.length > maxLen) {
        return out ? `${out}\n...TRUNCATED...` : '...TRUNCATED...';
      }
      out = next;
    }
    return out || '-';
  };

  const lines: string[] = [];
  lines.push('【叙事因果链摘要】（用于分镜一致性：人物动机/信息差/节拍推进）');

  const beatFlow = chain.beatFlow;
  if (isRecord(beatFlow)) {
    const acts = beatFlow.acts;
    if (Array.isArray(acts) && acts.length) {
      lines.push('- 节拍（按幕）：');
      for (const a of acts.slice(0, 4)) {
        if (!isRecord(a)) continue;
        const actNo = a.act;
        const actName = clip(a.actName, 24);
        lines.push(`  第${typeof actNo === 'number' ? actNo : '-'}幕${actName ? `「${actName}」` : ''}：`);
        const beats = a.beats;
        if (!Array.isArray(beats) || beats.length === 0) {
          lines.push('    （无节拍）');
          continue;
        }
        for (const b of beats.slice(0, 10)) {
          if (!isRecord(b)) continue;
          const name = clip(b.beatName, 60) || '未命名节拍';
          const loc = clip(b.location, 30);
          const chars = Array.isArray(b.characters) ? b.characters.map((c) => clip(c, 16)).filter(Boolean).join('、') : '';
          lines.push(`    · ${name}${loc ? ` @${loc}` : ''}${chars ? `（${chars}）` : ''}`);
        }
      }
    }
  }

  const plotLines = chain.plotLines;
  if (Array.isArray(plotLines) && plotLines.length) {
    lines.push('- 叙事线关键咬合点：');
    for (const pl of plotLines.slice(0, 6)) {
      if (!isRecord(pl)) continue;
      const type = clip(pl.lineType, 12) || '-';
      const driver = clip(pl.driver, 20) || '-';
      const interlocks = Array.isArray(pl.keyInterlocks)
        ? pl.keyInterlocks.map((x) => clip(x, 30)).filter(Boolean).join('、')
        : '';
      if (interlocks) lines.push(`  - ${type}：${driver}（${interlocks}）`);
    }
  }

  return pushUntil(lines, 12000);
}

function buildUserPrompt(args: {
  storySynopsis: string;
  artStyle: string;
  worldView: string;
  characters: string;
  narrativeCausalChain?: string;
  episode: { order: number; title: string; summary: string; outline: unknown; coreExpression: unknown };
  prevEpisode?: {
    order: number;
    title: string | null;
    summary: string | null;
    coreExpression: unknown;
    scenes: Array<{ order: number; summary: string }>;
  };
  sceneCount: number;
}): string {
  return [
    `目标分镜数：${args.sceneCount}`,
    '',
    '全局设定：',
    '- 故事梗概：',
    args.storySynopsis || '-',
    '',
    '- 画风（完整提示词）：',
    args.artStyle || '-',
    '',
    '- 世界观要素：',
    args.worldView || '-',
    '',
    '- 角色库：',
    args.characters || '-',
    '',
    '- 叙事因果链（结构化叙事骨架；若提供，请与其保持一致）：',
    args.narrativeCausalChain ?? '-',
    '',
    '当前集：',
    `- 集数：第 ${args.episode.order} 集`,
    `- 标题：${args.episode.title || '-'}`,
    `- 一句话概要：${args.episode.summary || '-'}`,
    '- Outline（可能是结构化 JSON）：',
    JSON.stringify(args.episode.outline ?? null),
    '',
    '- Core Expression（结构化 JSON）：',
    JSON.stringify(args.episode.coreExpression ?? null),
    ...(args.prevEpisode
      ? [
          '',
          '上一集（用于避免重复，不要复述上一集桥段）：',
          `- 集数：第 ${args.prevEpisode.order} 集`,
          `- 标题：${args.prevEpisode.title || '-'}`,
          `- 一句话概要：${args.prevEpisode.summary || '-'}`,
          '- 上一集 Core Expression（结构化 JSON，可用于避免重复主题/母题）：',
          JSON.stringify(args.prevEpisode.coreExpression ?? null),
          '',
          '- 上一集分镜列表（如为空表示未生成）：',
          args.prevEpisode.scenes.length
            ? args.prevEpisode.scenes
                .slice(0, 24)
                .map((s) => `${s.order}. ${String(s.summary ?? '').slice(0, 80)}`)
                .join('\n')
            : '-',
        ]
      : []),
  ].join('\n');
}

export async function generateEpisodeSceneList(args: {
  prisma: PrismaClient;
  teamId: string;
  projectId: string;
  episodeId: string;
  aiProfileId: string;
  apiKeySecret: string;
  options?: { sceneCountHint?: number };
  updateProgress: (progress: JobProgress) => Promise<void>;
}) {
  const { prisma, teamId, projectId, episodeId, aiProfileId, apiKeySecret, updateProgress } = args;

  const project = await prisma.project.findFirst({
    where: { id: projectId, teamId, deletedAt: null },
    select: { id: true, summary: true, style: true, artStyleConfig: true, contextCache: true },
  });
  if (!project) throw new Error('Project not found');

  const episode = await prisma.episode.findFirst({
    where: { id: episodeId, projectId },
    select: { id: true, order: true, title: true, summary: true, outline: true, coreExpression: true },
  });
  if (!episode) throw new Error('Episode not found');
  if (!episode.coreExpression) throw new Error('Episode coreExpression missing');

  const prevEpisode =
    episode.order > 1
      ? await prisma.episode.findFirst({
          where: { projectId, order: episode.order - 1 },
          select: { id: true, order: true, title: true, summary: true, coreExpression: true },
        })
      : null;
  const prevScenes = prevEpisode
    ? await prisma.scene.findMany({
        where: { episodeId: prevEpisode.id },
        orderBy: { order: 'asc' },
        take: 24,
        select: { order: true, summary: true },
      })
    : [];

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

  // 与 API 校验口径保持一致：6..24；不传则默认 12
  const sceneCountHint = args.options?.sceneCountHint;
  const sceneCount =
    typeof sceneCountHint === 'number'
      ? Math.max(6, Math.min(24, Math.round(sceneCountHint)))
      : 12;

  await updateProgress({ pct: 5, message: '准备提示词...' });

  const systemPrompt = await loadSystemPrompt({
    prisma,
    teamId,
    key: 'workflow.episode_scene_list.system',
  });

  const userPrompt = buildUserPrompt({
    storySynopsis: project.summary,
    artStyle: styleFullPrompt(project),
    worldView: formatWorldView(worldViewElements),
    characters: formatCharacters(characters),
    narrativeCausalChain: formatNarrativeCausalChain(project.contextCache),
    episode: {
      order: episode.order,
      title: episode.title,
      summary: episode.summary,
      outline: episode.outline,
      coreExpression: episode.coreExpression,
    },
    prevEpisode: prevEpisode
      ? {
          order: prevEpisode.order,
          title: prevEpisode.title,
          summary: prevEpisode.summary,
          coreExpression: prevEpisode.coreExpression,
          scenes: prevScenes.map((s) => ({ order: s.order, summary: s.summary || '' })),
        }
      : undefined,
    sceneCount,
  });

  const apiKey = decryptApiKey(profile.apiKeyEncrypted, apiKeySecret);
  const providerConfig = toProviderChatConfig(profile);
  providerConfig.apiKey = apiKey;

  await updateProgress({ pct: 25, message: '调用 AI 生成分镜列表...' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const res = await chatWithProvider(providerConfig, messages);

  await updateProgress({ pct: 70, message: '解析与写入分镜...' });

  const summaries = parseSceneList(res.content, sceneCount);
  if (summaries.length < 6) {
    throw new Error('AI 返回分镜数量过少，请重试或调整梗概/画风/核心表达');
  }

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { episodeId } }),
    prisma.scene.createMany({
      data: summaries.map((summary, idx) => ({
        projectId,
        episodeId,
        order: idx + 1,
        summary,
        status: 'pending',
      })),
    }),
    prisma.episode.update({ where: { id: episodeId }, data: { workflowState: 'SCENE_LIST_EDITING' } }),
    prisma.project.update({ where: { id: projectId }, data: { workflowState: 'EPISODE_CREATING' } }),
  ]);

  await updateProgress({ pct: 100, message: '完成' });

  return {
    episodeId,
    sceneCount: summaries.length,
    scenes: summaries.map((summary, idx) => ({ order: idx + 1, summary })),
    tokenUsage: res.tokenUsage ?? null,
  };
}
